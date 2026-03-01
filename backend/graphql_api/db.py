"""
backend/graphql_api/db.py
--------------------------
Per-tenant DynamoDB table design for CloudHisaab.
Each organisation gets its own isolated table: ch_<tenant_id>
A global "registry" table (ch_registry) stores tenant metadata.
"""

import os
import time
import boto3
from boto3.dynamodb.conditions import Key
from typing import Any, Dict, List, Optional

REGION         = os.environ.get("AWS_REGION", "us-east-1")
REGISTRY_TABLE = os.environ.get("REGISTRY_TABLE", "ch_registry")

_dynamodb = boto3.resource("dynamodb", region_name=REGION)
_ddb_client = boto3.client("dynamodb", region_name=REGION)
_s3  = boto3.client("s3",  region_name=REGION)
_sqs = boto3.client("sqs", region_name=REGION)

_table_cache: Dict[str, Any] = {}


# ─────────────────────────────────────────────────────────
# Per-org table name helper
# ─────────────────────────────────────────────────────────

def org_table_name(tenant_id: str) -> str:
    """Returns the per-org DynamoDB table name."""
    return f"ch_{tenant_id.lower()}"


def get_org_table(tenant_id: str):
    """Return (and lazily cache) the boto3 Table object for an org."""
    name = org_table_name(tenant_id)
    if name not in _table_cache:
        _table_cache[name] = _dynamodb.Table(name)
    return _table_cache[name]


def get_registry():
    """Registry table stores TENANT metadata (lookup by email, etc.)."""
    if REGISTRY_TABLE not in _table_cache:
        _table_cache[REGISTRY_TABLE] = _dynamodb.Table(REGISTRY_TABLE)
    return _table_cache[REGISTRY_TABLE]


def get_s3():
    return _s3


def get_sqs():
    return _sqs


# ─────────────────────────────────────────────────────────
# Table provisioning — called once at org registration
# ─────────────────────────────────────────────────────────

def create_org_table(tenant_id: str) -> str:
    """
    Create a DynamoDB table for a new organisation.
    Returns the table name. Waits until ACTIVE.
    """
    name = org_table_name(tenant_id)

    # Check if already exists
    try:
        existing = _ddb_client.describe_table(TableName=name)
        status = existing["Table"]["TableStatus"]
        if status == "ACTIVE":
            return name
    except _ddb_client.exceptions.ResourceNotFoundException:
        pass  # doesn't exist yet

    _ddb_client.create_table(
        TableName=name,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "PK",     "AttributeType": "S"},
            {"AttributeName": "SK",     "AttributeType": "S"},
            {"AttributeName": "GSI1PK", "AttributeType": "S"},
            {"AttributeName": "GSI1SK", "AttributeType": "S"},
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    )

    # Wait for ACTIVE (up to 30s)
    for _ in range(30):
        try:
            desc = _ddb_client.describe_table(TableName=name)
            if desc["Table"]["TableStatus"] == "ACTIVE":
                break
        except Exception:
            pass
        time.sleep(1)

    # Invalidate cache so new table object is used
    _table_cache.pop(name, None)
    return name


# ─────────────────────────────────────────────────────────
# SK key builders  (same schema in every org table)
# ─────────────────────────────────────────────────────────

def meta_sk()                              -> str: return "METADATA"
def user_sk(uid: str)                      -> str: return f"USER#{uid}"
def product_sk(pid: str)                   -> str: return f"PRODUCT#{pid}"
def stock_sk(pid: str, ts: str)            -> str: return f"STOCK#{pid}#{ts}"
def sale_sk(sid: str)                      -> str: return f"SALE#{sid}"
def sale_item_sk(sid: str, pid: str)       -> str: return f"SALEITEM#{sid}#{pid}"
def expense_sk(eid: str)                   -> str: return f"EXPENSE#{eid}"
def purchase_sk(pid: str)                  -> str: return f"PURCHASE#{pid}"
def purchase_item_sk(pid: str, iid: str)   -> str: return f"PURCHASEITEM#{pid}#{iid}"

# PK is always "ORG" in a per-org table (no tenant prefix needed anymore)
ORG_PK = "ORG"


def gsi1_sale_sk(date: str, sale_id: str)        -> str: return f"DATE#{date}#SALE#{sale_id}"
def gsi1_expense_sk(date: str, eid: str)         -> str: return f"DATE#{date}#EXPENSE#{eid}"


# ─────────────────────────────────────────────────────────
# Generic CRUD helpers (all use per-org table)
# ─────────────────────────────────────────────────────────

def put(tenant_id: str, item: Dict[str, Any]) -> None:
    get_org_table(tenant_id).put_item(Item=item)


def get(tenant_id: str, pk_val: str, sk_val: str) -> Optional[Dict]:
    resp = get_org_table(tenant_id).get_item(Key={"PK": pk_val, "SK": sk_val})
    return resp.get("Item")


def delete(tenant_id: str, pk_val: str, sk_val: str) -> None:
    get_org_table(tenant_id).delete_item(Key={"PK": pk_val, "SK": sk_val})


def update(tenant_id: str, pk_val: str, sk_val: str,
           expression: str, values: Dict, names: Optional[Dict] = None) -> Dict:
    kwargs: Dict[str, Any] = {
        "Key": {"PK": pk_val, "SK": sk_val},
        "UpdateExpression": expression,
        "ExpressionAttributeValues": values,
        "ReturnValues": "ALL_NEW",
    }
    if names:
        kwargs["ExpressionAttributeNames"] = names
    return get_org_table(tenant_id).update_item(**kwargs).get("Attributes", {})


def query_pk(tenant_id: str, pk_val: str,
             sk_prefix: Optional[str] = None,
             limit: int = 500) -> Dict:
    kwargs: Dict[str, Any] = {"Limit": limit}
    if sk_prefix:
        kwargs["KeyConditionExpression"] = (
            Key("PK").eq(pk_val) & Key("SK").begins_with(sk_prefix)
        )
    else:
        kwargs["KeyConditionExpression"] = Key("PK").eq(pk_val)
    return get_org_table(tenant_id).query(**kwargs)


def query_gsi1(tenant_id: str, gsi1pk_val: str,
               sk_prefix: Optional[str] = None, limit: int = 500) -> Dict:
    kwargs: Dict[str, Any] = {"IndexName": "GSI1", "Limit": limit}
    if sk_prefix:
        kwargs["KeyConditionExpression"] = (
            Key("GSI1PK").eq(gsi1pk_val) & Key("GSI1SK").begins_with(sk_prefix)
        )
    else:
        kwargs["KeyConditionExpression"] = Key("GSI1PK").eq(gsi1pk_val)
    return get_org_table(tenant_id).query(**kwargs)


# ─────────────────────────────────────────────────────────
# Registry helpers (global tenant lookup)
# ─────────────────────────────────────────────────────────

def registry_put(item: Dict) -> None:
    get_registry().put_item(Item=item)


def registry_get(pk_val: str, sk_val: str) -> Optional[Dict]:
    resp = get_registry().get_item(Key={"PK": pk_val, "SK": sk_val})
    return resp.get("Item")
