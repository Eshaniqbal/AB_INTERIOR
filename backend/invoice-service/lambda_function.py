"""
backend/invoice-service/lambda_function.py
-------------------------------------------
Triggered by SQS (invoice_jobs queue).
Fetches invoice data → generates PDF → uploads to S3 → updates DynamoDB.
"""

import os
import json
import boto3
import base64
from datetime import datetime, timezone
from decimal import Decimal
from jinja2 import Environment, FileSystemLoader
import weasyprint

TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "billing_main")
REGION = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET = os.environ.get("S3_BUCKET", "cloudhisaab-storage")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)
s3 = boto3.client("s3", region_name=REGION)

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates")
jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def lambda_handler(event, context):
    """Process SQS messages for PDF generation."""
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            sale_id = body["sale_id"]
            tenant_id = body["tenant_id"]
            invoice_number = body["invoice_number"]

            process_invoice(sale_id, tenant_id, invoice_number)
        except Exception as e:
            print(f"ERROR processing record: {e}")
            # Don't raise — let other records continue
    return {"statusCode": 200}


def process_invoice(sale_id: str, tenant_id: str, invoice_number: str):
    pk = f"TENANT#{tenant_id}"

    # 1. Fetch sale record
    sale_resp = table.get_item(Key={"PK": pk, "SK": f"SALE#{sale_id}"})
    sale = sale_resp.get("Item")
    if not sale:
        raise Exception(f"Sale {sale_id} not found")

    # 2. Fetch sale items
    items_resp = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={":pk": pk, ":sk": f"SALEITEM#{sale_id}#"},
    )
    items = items_resp.get("Items", [])

    # 3. Fetch tenant metadata
    meta_resp = table.get_item(Key={"PK": pk, "SK": "METADATA"})
    tenant = meta_resp.get("Item", {})

    # 4. Render HTML template
    template = jinja_env.get_template("invoice.html")
    html = template.render(
        invoice_number=invoice_number,
        sale=_serialize(sale),
        items=[_serialize(i) for i in items],
        tenant=_serialize(tenant),
        generated_at=datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC"),
    )

    # 5. Generate PDF bytes
    pdf_bytes = weasyprint.HTML(string=html).write_pdf()

    # 6. Upload to S3
    s3_key = f"{tenant_id}/invoices/{invoice_number}.pdf"
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=pdf_bytes,
        ContentType="application/pdf",
        Metadata={
            "tenant_id": tenant_id,
            "sale_id": sale_id,
            "invoice_number": invoice_number,
        },
    )

    # 7. Update sale record with PDF key
    table.update_item(
        Key={"PK": pk, "SK": f"SALE#{sale_id}"},
        UpdateExpression="SET pdf_s3_key = :k, pdf_status = :s, pdf_generated_at = :t",
        ExpressionAttributeValues={
            ":k": s3_key,
            ":s": "READY",
            ":t": datetime.now(timezone.utc).isoformat(),
        },
    )
    print(f"✅ PDF generated: s3://{S3_BUCKET}/{s3_key}")


def _serialize(obj):
    """Convert DynamoDB Decimal types to float for Jinja2."""
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, Decimal):
        return float(obj)
    return obj
