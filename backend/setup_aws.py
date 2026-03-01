"""
backend/setup_aws.py
---------------------
One-time setup script to create AWS resources for CloudHisaab.
Run once: python setup_aws.py

Creates:
  1. DynamoDB table: billing_main (with GSI1)
  2. DynamoDB table: billing_summary
  3. Cognito User Pool + App Client
  4. S3 bucket: cloudhisaab-storage
  5. SQS queue: cloudhisaab-invoice-jobs
  
Updates .env.local with created resource IDs.
"""

import os
import json
import boto3
from botocore.exceptions import ClientError

REGION = "us-east-1"
ACCOUNT = "688927627225"

dynamodb = boto3.client("dynamodb", region_name=REGION)
cognito = boto3.client("cognito-idp", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
sqs = boto3.client("sqs", region_name=REGION)


def create_dynamo_table(name: str, extra_attributes=None, extra_indexes=None):
    """Create a DynamoDB table if it doesn't exist."""
    try:
        attrs = [
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
        ]
        key_schema = [
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ]
        gsis = []

        if extra_attributes:
            attrs.extend(extra_attributes)
        if extra_indexes:
            gsis.extend(extra_indexes)

        kwargs = {
            "TableName": name,
            "AttributeDefinitions": attrs,
            "KeySchema": key_schema,
            "BillingMode": "PAY_PER_REQUEST",
        }
        if gsis:
            kwargs["GlobalSecondaryIndexes"] = gsis

        dynamodb.create_table(**kwargs)
        print(f"  ✅ Created DynamoDB table: {name}")
        # Wait for table to be active
        waiter = dynamodb.get_waiter("table_exists")
        waiter.wait(TableName=name)
        print(f"  ✅ Table {name} is ACTIVE")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceInUseException":
            print(f"  ⏭️  Table {name} already exists")
            return False
        raise


def create_cognito_user_pool():
    """Create Cognito User Pool with custom attributes."""
    try:
        resp = cognito.create_user_pool(
            PoolName="cloudhisaab-users",
            Policies={
                "PasswordPolicy": {
                    "MinimumLength": 8,
                    "RequireUppercase": False,
                    "RequireLowercase": True,
                    "RequireNumbers": True,
                    "RequireSymbols": False,
                }
            },
            Schema=[
                {
                    "Name": "email",
                    "AttributeDataType": "String",
                    "Required": True,
                    "Mutable": True,
                },
                {
                    "Name": "tenant_id",
                    "AttributeDataType": "String",
                    "Required": False,
                    "Mutable": True,
                },
                {
                    "Name": "role",
                    "AttributeDataType": "String",
                    "Required": False,
                    "Mutable": True,
                },
            ],
            AutoVerifiedAttributes=["email"],
            UsernameAttributes=["email"],
            UsernameConfiguration={"CaseSensitive": False},
        )
        pool_id = resp["UserPool"]["Id"]
        print(f"  ✅ Created Cognito User Pool: {pool_id}")

        # Create App Client
        client_resp = cognito.create_user_pool_client(
            UserPoolId=pool_id,
            ClientName="cloudhisaab-web",
            GenerateSecret=False,
            ExplicitAuthFlows=[
                "ALLOW_USER_PASSWORD_AUTH",
                "ALLOW_REFRESH_TOKEN_AUTH",
                "ALLOW_USER_SRP_AUTH",
            ],
            ReadAttributes=["email", "custom:tenant_id", "custom:role"],
            WriteAttributes=["email", "custom:tenant_id", "custom:role"],
        )
        client_id = client_resp["UserPoolClient"]["ClientId"]
        print(f"  ✅ Created Cognito App Client: {client_id}")
        return pool_id, client_id
    except ClientError as e:
        if "already exists" in str(e):
            print("  ⏭️  Cognito User Pool already exists")
            return None, None
        raise


def create_s3_bucket(bucket_name: str):
    try:
        if REGION == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": REGION},
            )
        # Block public access
        s3.put_public_access_block(
            Bucket=bucket_name,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            },
        )
        # Enable versioning
        s3.put_bucket_versioning(
            Bucket=bucket_name,
            VersioningConfiguration={"Status": "Enabled"},
        )
        print(f"  ✅ Created S3 bucket: {bucket_name}")
    except ClientError as e:
        if e.response["Error"]["Code"] in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
            print(f"  ⏭️  S3 bucket {bucket_name} already exists")
        else:
            raise


def create_sqs_queue(queue_name: str):
    try:
        resp = sqs.create_queue(
            QueueName=queue_name,
            Attributes={
                "VisibilityTimeout": "300",
                "MessageRetentionPeriod": "86400",
            },
        )
        url = resp["QueueUrl"]
        print(f"  ✅ Created SQS queue: {url}")
        return url
    except ClientError as e:
        if "QueueAlreadyExists" in str(e):
            resp = sqs.get_queue_url(QueueName=queue_name)
            print(f"  ⏭️  SQS queue already exists: {resp['QueueUrl']}")
            return resp["QueueUrl"]
        raise


def update_env_file(updates: dict):
    env_path = os.path.join(os.path.dirname(__file__), ".env.local")
    with open(env_path, "r") as f:
        lines = f.readlines()

    new_lines = []
    updated = set()
    for line in lines:
        key = line.split("=")[0].strip()
        if key in updates:
            new_lines.append(f"{key}={updates[key]}\n")
            updated.add(key)
        else:
            new_lines.append(line)

    for key, val in updates.items():
        if key not in updated:
            new_lines.append(f"{key}={val}\n")

    with open(env_path, "w") as f:
        f.writelines(new_lines)
    print(f"\n  ✅ Updated .env.local with resource IDs")


def main():
    print("\n🚀 CloudHisaab – AWS Resource Setup")
    print("=" * 45)

    # 1. DynamoDB main table
    print("\n📦 Creating DynamoDB tables...")
    create_dynamo_table(
        "billing_main",
        extra_attributes=[
            {"AttributeName": "GSI1PK", "AttributeType": "S"},
            {"AttributeName": "GSI1SK", "AttributeType": "S"},
        ],
        extra_indexes=[
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

    # 2. Summary table
    create_dynamo_table("billing_summary")

    # 3. Cognito
    print("\n🔐 Creating Cognito User Pool...")
    pool_id, client_id = create_cognito_user_pool()

    # 4. S3
    print("\n🪣  Creating S3 bucket...")
    create_s3_bucket("cloudhisaab-storage")

    # 5. SQS
    print("\n📨 Creating SQS queue...")
    queue_url = create_sqs_queue("cloudhisaab-invoice-jobs")

    # 6. Update .env.local
    updates = {"SQS_INVOICE_QUEUE_URL": queue_url or ""}
    if pool_id:
        updates["COGNITO_USER_POOL_ID"] = pool_id
    if client_id:
        updates["COGNITO_CLIENT_ID"] = client_id

    update_env_file(updates)

    print("\n" + "=" * 45)
    print("✅ All AWS resources created successfully!")
    print("\nNext steps:")
    print("  1. cd backend && pip install -r requirements.txt")
    print("  2. uvicorn graphql_api.main:app --reload --port 8000")
    print("  3. Open http://localhost:8000/graphql")
    print("=" * 45 + "\n")


if __name__ == "__main__":
    main()
