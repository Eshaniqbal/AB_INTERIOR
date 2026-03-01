"""
lambdas/invoice-pdf/lambda_function.py
----------------------------------------------
AWS Lambda — Invoice PDF Generator
Trigger: SQS (cloudhisaab-invoice-jobs queue)

Flow:
  1. Receive SQS message: { sale_id, tenant_id, invoice_number }
  2. Fetch sale + items + tenant metadata from per-org DynamoDB table (ch_<tenant_id>)
  3. Render HTML via Jinja2 template
  4. Generate PDF with WeasyPrint
  5. Upload PDF to S3: s3://<bucket>/<tenant_id>/invoices/<invoice_number>.pdf
  6. Update sale record: pdf_status=READY, pdf_s3_key=...

Environment variables (set in Lambda config):
  AWS_REGION       — e.g. us-east-1
  S3_BUCKET        — e.g. cloudhisaab-storage
  REGISTRY_TABLE   — e.g. ch_registry (unused here but consistent)

Per-org table name convention: ch_<tenant_id_lowercase>
"""

import os
import json
import boto3
import logging
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
import weasyprint

# ── Logging ──────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Config ───────────────────────────────────────────────────────────────
REGION    = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET = os.environ.get("S3_BUCKET", "cloudhisaab-storage")

# ── AWS clients ───────────────────────────────────────────────────────────
_dynamodb = None
_s3       = None

def get_dynamodb():
    global _dynamodb
    if not _dynamodb:
        _dynamodb = boto3.resource("dynamodb", region_name=REGION)
    return _dynamodb

def get_s3():
    global _s3
    if not _s3:
        _s3 = boto3.client("s3", region_name=REGION)
    return _s3

# ── Jinja2 env ─────────────────────────────────────────────────────────
TEMPLATE_DIR = Path(__file__).parent / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=select_autoescape(["html"]),
)

# ── Key helpers (must match db.py) ────────────────────────────────────
ORG_PK = "ORG"

def org_table_name(tenant_id: str) -> str:
    return f"ch_{tenant_id.lower()}"

def _table(tenant_id: str):
    return get_dynamodb().Table(org_table_name(tenant_id))


# ── Lambda handler ────────────────────────────────────────────────────
def lambda_handler(event, context):
    """Process SQS messages — each record = one invoice PDF to generate."""
    results = {"success": 0, "failed": 0}

    for record in event.get("Records", []):
        try:
            body          = json.loads(record["body"])
            sale_id       = body["sale_id"]
            tenant_id     = body["tenant_id"]
            invoice_number = body["invoice_number"]

            logger.info(f"Processing invoice {invoice_number} for tenant {tenant_id}")
            process_invoice(sale_id, tenant_id, invoice_number)
            results["success"] += 1

        except Exception as exc:
            logger.error(f"Failed to process record: {exc}", exc_info=True)
            results["failed"] += 1
            # Don't re-raise — let other messages in the batch continue

    logger.info(f"Batch complete: {results}")
    return {"statusCode": 200, "body": json.dumps(results)}


# ── Core processor ────────────────────────────────────────────────────
def process_invoice(sale_id: str, tenant_id: str, invoice_number: str):
    tbl = _table(tenant_id)

    # 1. Sale header
    sale_resp = tbl.get_item(Key={"PK": ORG_PK, "SK": f"SALE#{sale_id}"})
    sale = sale_resp.get("Item")
    if not sale:
        raise ValueError(f"Sale {sale_id} not found in table {org_table_name(tenant_id)}")

    # 2. Sale items (SALEITEM#<sale_id>#<product_id>)
    items_resp = tbl.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={
            ":pk": ORG_PK,
            ":sk": f"SALEITEM#{sale_id}#",
        },
    )
    items = items_resp.get("Items", [])

    # 3. Tenant metadata (PK=ORG, SK=META)
    meta_resp = tbl.get_item(Key={"PK": ORG_PK, "SK": "META"})
    tenant    = meta_resp.get("Item", {})

    # 4. Enrich items with pre-computed fields
    enriched_items = []
    for item in items:
        sp       = float(item.get("selling_price", 0))
        qty      = float(item.get("quantity", 1))
        gst_rate = float(item.get("gst_rate", 0))
        gst_amt  = round(sp * gst_rate / 100 * qty, 2)
        enriched_items.append({
            **_serialize(item),
            "selling_price":        sp,
            "quantity":             qty,
            "gst_rate":             gst_rate,
            "gst_amount":           float(item.get("gst_amount", gst_amt)),
            "line_total":           round(sp * qty, 2),
            "line_total_with_gst":  round((sp + sp * gst_rate / 100) * qty, 2),
        })

    # 5. Render HTML
    now_utc = datetime.now(timezone.utc)
    template = jinja_env.get_template("invoice.html")
    html = template.render(
        invoice_number=invoice_number,
        sale=_serialize(sale),
        items=enriched_items,
        tenant=_serialize(tenant),
        generated_at=now_utc.strftime("%d %b %Y, %H:%M UTC"),
        generated_date=now_utc.strftime("%d/%m/%Y"),
    )

    # 6. Generate PDF
    logger.info(f"Generating PDF for {invoice_number}")
    pdf_bytes = weasyprint.HTML(
        string=html,
        base_url=str(TEMPLATE_DIR),
    ).write_pdf()
    logger.info(f"PDF size: {len(pdf_bytes):,} bytes")

    # 7. Upload to S3
    s3_key = f"{tenant_id}/invoices/{invoice_number}.pdf"
    get_s3().put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=pdf_bytes,
        ContentType="application/pdf",
        Metadata={
            "tenant-id":       tenant_id,
            "sale-id":         sale_id,
            "invoice-number":  invoice_number,
        },
    )
    logger.info(f"Uploaded to s3://{S3_BUCKET}/{s3_key}")

    # 8. Mark sale as PDF ready in DynamoDB
    tbl.update_item(
        Key={"PK": ORG_PK, "SK": f"SALE#{sale_id}"},
        UpdateExpression="SET pdf_s3_key = :k, pdf_status = :s, pdf_generated_at = :t REMOVE pdf_url",
        ExpressionAttributeValues={
            ":k": s3_key,
            ":s": "READY",
            ":t": now_utc.isoformat(),
        },
    )
    logger.info(f"✅ Invoice {invoice_number} PDF ready at s3://{S3_BUCKET}/{s3_key}")


# ── Helpers ──────────────────────────────────────────────────────────
def _serialize(obj):
    """Recursively convert Decimal → float for Jinja2 rendering."""
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(i) for i in obj]
    if isinstance(obj, Decimal):
        return float(obj)
    return obj
