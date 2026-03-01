"""
backend/graphql_api/resolvers/user_resolver.py
-----------------------------------------------
Team / User Management — SUPER_ADMIN only.

Invite flow:
  1. admin_create_user() → Cognito creates user, sends temp-password email  
  2. admin_update_user_attributes() → sets custom:tenant_id + custom:role  
  3. Seeds user record in org DynamoDB table  

Other operations:
  - list_users      → scan USER# SK prefix in org table  
  - update_user_role → update Cognito attribute + DynamoDB record  
  - toggle_user     → enable/disable in Cognito + mark is_active in DynamoDB  
  - remove_user     → admin_delete_user from Cognito + remove DynamoDB record  
"""

import os
import uuid
import boto3
import strawberry
from typing import List, Optional
from datetime import datetime, timezone

from ..db import ORG_PK, user_sk, put, get_org_table
from ..types.tenant import User
from ..context import AppContext

COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
REGION               = os.environ.get("AWS_REGION", "us-east-1")

ALLOWED_ROLES = {"MANAGER", "CASHIER", "ACCOUNTANT"}

_cognito = None


def _cog():
    global _cognito
    if not _cognito:
        _cognito = boto3.client("cognito-idp", region_name=REGION)
    return _cognito


# ─────────────────────────────────────────────────────────────
# Input types
# ─────────────────────────────────────────────────────────────

@strawberry.input
class InviteUserInput:
    name:  str
    email: str
    role:  str   # MANAGER | CASHIER | ACCOUNTANT


@strawberry.input
class UpdateUserRoleInput:
    user_id: str
    role:    str


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _validate_role(role: str):
    if role not in ALLOWED_ROLES:
        raise Exception(f"Invalid role '{role}'. Must be one of: {', '.join(ALLOWED_ROLES)}")


def _get_all_users(tenant_id: str) -> List[User]:
    """Scan all USER# records from the org table."""
    from boto3.dynamodb.conditions import Key
    table = get_org_table(tenant_id)
    resp  = table.query(
        KeyConditionExpression=Key("PK").eq(ORG_PK) & Key("SK").begins_with("USER#"),
    )
    users = []
    for item in resp.get("Items", []):
        users.append(User(
            user_id=str(item.get("user_id", "")),
            name=str(item.get("name", "")),
            email=str(item.get("email", "")),
            role=str(item.get("role", "CASHIER")),
            is_active=bool(item.get("is_active", True)),
            created_at=str(item.get("created_at", "")),
        ))
    return sorted(users, key=lambda u: u.created_at, reverse=True)


# ─────────────────────────────────────────────────────────────
# Queries
# ─────────────────────────────────────────────────────────────

def list_users(
    info: strawberry.types.Info[AppContext, None],
) -> List[User]:
    """List all team members. SUPER_ADMIN only."""
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN")
    return _get_all_users(ctx.auth.tenant_id)


# ─────────────────────────────────────────────────────────────
# Mutation: Invite a new team member
# ─────────────────────────────────────────────────────────────

def invite_user(
    info: strawberry.types.Info[AppContext, None],
    input: InviteUserInput,
) -> User:
    """
    Invite a team member:
    - Cognito AdminCreateUser → sends temp-password email
    - Sets custom:tenant_id + custom:role as Cognito attributes
    - Seeds user record in org DynamoDB (NO password stored)
    """
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN")
    _validate_role(input.role)

    tid     = ctx.auth.tenant_id
    cog     = _cog()
    now     = datetime.now(timezone.utc).isoformat()
    user_id = f"USR{uuid.uuid4().hex[:10].upper()}"

    # Cognito creates the user and emails a temporary password automatically.
    # - No TemporaryPassword → Cognito auto-generates a secure one
    # - No MessageAction    → Cognito sends the welcome email with login instructions
    try:
        cog.admin_create_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=input.email,
            UserAttributes=[
                {"Name": "email",            "Value": input.email},
                {"Name": "email_verified",   "Value": "true"},
                {"Name": "name",             "Value": input.name},
                {"Name": "custom:tenant_id", "Value": tid.upper()},
                {"Name": "custom:role",      "Value": input.role},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
    except cog.exceptions.UsernameExistsException:
        raise Exception(f"A user with email {input.email} already exists.")
    except Exception as e:
        raise Exception(f"Could not create user: {e}")

    # Seed user in org table — NO password
    user_item = {
        "PK":         ORG_PK,
        "SK":         user_sk(user_id),
        "user_id":    user_id,
        "name":       input.name,
        "email":      input.email,
        "role":       input.role,
        "is_active":  True,
        "created_at": now,
    }
    put(tid, user_item)

    return User(
        user_id=user_id,
        name=input.name,
        email=input.email,
        role=input.role,
        is_active=True,
        created_at=now,
    )


# ─────────────────────────────────────────────────────────────
# Mutation: Update role
# ─────────────────────────────────────────────────────────────

def update_user_role(
    info: strawberry.types.Info[AppContext, None],
    input: UpdateUserRoleInput,
) -> User:
    """Change a team member's role. SUPER_ADMIN only."""
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN")
    _validate_role(input.role)

    tid   = ctx.auth.tenant_id
    table = get_org_table(tid)
    now   = datetime.now(timezone.utc).isoformat()

    # Find the user record
    from boto3.dynamodb.conditions import Key
    resp  = table.query(
        KeyConditionExpression=Key("PK").eq(ORG_PK) & Key("SK").eq(user_sk(input.user_id)),
    )
    items = resp.get("Items", [])
    if not items:
        raise Exception("User not found.")
    item = items[0]

    # Update Cognito attribute
    try:
        _cog().admin_update_user_attributes(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=item["email"],
            UserAttributes=[{"Name": "custom:role", "Value": input.role}],
        )
    except Exception as e:
        raise Exception(f"Could not update Cognito role: {e}")

    # Update DynamoDB
    table.update_item(
        Key={"PK": ORG_PK, "SK": user_sk(input.user_id)},
        UpdateExpression="SET #r = :r, updated_at = :ua",
        ExpressionAttributeNames={"#r": "role"},
        ExpressionAttributeValues={":r": input.role, ":ua": now},
    )

    return User(
        user_id=input.user_id,
        name=str(item.get("name", "")),
        email=str(item.get("email", "")),
        role=input.role,
        is_active=bool(item.get("is_active", True)),
        created_at=str(item.get("created_at", "")),
    )


# ─────────────────────────────────────────────────────────────
# Mutation: Enable / Disable user
# ─────────────────────────────────────────────────────────────

def toggle_user_active(
    info: strawberry.types.Info[AppContext, None],
    user_id: str,
    active: bool,
) -> User:
    """Enable or disable a team member. SUPER_ADMIN only."""
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN")

    tid   = ctx.auth.tenant_id
    cog   = _cog()
    table = get_org_table(tid)
    now   = datetime.now(timezone.utc).isoformat()

    # Find user
    from boto3.dynamodb.conditions import Key
    resp  = table.query(
        KeyConditionExpression=Key("PK").eq(ORG_PK) & Key("SK").eq(user_sk(user_id)),
    )
    items = resp.get("Items", [])
    if not items:
        raise Exception("User not found.")
    item = items[0]

    # Cognito enable/disable
    try:
        if active:
            cog.admin_enable_user(UserPoolId=COGNITO_USER_POOL_ID, Username=item["email"])
        else:
            cog.admin_disable_user(UserPoolId=COGNITO_USER_POOL_ID, Username=item["email"])
    except Exception as e:
        raise Exception(f"Could not update user status: {e}")

    # Update DynamoDB
    table.update_item(
        Key={"PK": ORG_PK, "SK": user_sk(user_id)},
        UpdateExpression="SET is_active = :a, updated_at = :ua",
        ExpressionAttributeValues={":a": active, ":ua": now},
    )

    return User(
        user_id=user_id,
        name=str(item.get("name", "")),
        email=str(item.get("email", "")),
        role=str(item.get("role", "CASHIER")),
        is_active=active,
        created_at=str(item.get("created_at", "")),
    )


# ─────────────────────────────────────────────────────────────
# Mutation: Remove user
# ─────────────────────────────────────────────────────────────

def remove_user(
    info: strawberry.types.Info[AppContext, None],
    user_id: str,
) -> bool:
    """Permanently remove a team member. SUPER_ADMIN only."""
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN")

    tid   = ctx.auth.tenant_id
    cog   = _cog()
    table = get_org_table(tid)

    from boto3.dynamodb.conditions import Key
    resp  = table.query(
        KeyConditionExpression=Key("PK").eq(ORG_PK) & Key("SK").eq(user_sk(user_id)),
    )
    items = resp.get("Items", [])
    if not items:
        raise Exception("User not found.")
    item = items[0]

    # Delete from Cognito
    try:
        cog.admin_delete_user(UserPoolId=COGNITO_USER_POOL_ID, Username=item["email"])
    except Exception as e:
        raise Exception(f"Could not remove user from Cognito: {e}")

    # Delete from DynamoDB
    table.delete_item(Key={"PK": ORG_PK, "SK": user_sk(user_id)})
    return True
