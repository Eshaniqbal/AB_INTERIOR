"""
lambdas/invoice-pdf/test_local.py
-----------------------------------
Local test runner — generates a sample PDF without AWS services.
Uses a mock DynamoDB response and writes the PDF to ./test_output/test_invoice.pdf

Usage:
    cd lambdas/invoice-pdf
    pip install -r requirements.txt
    python test_local.py
"""

import sys
import json
import os
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone

# ── Patch boto3 out ─────────────────────────────────────────────────────────
from unittest.mock import MagicMock, patch

MOCK_TENANT_ID     = "org1234567890"
MOCK_SALE_ID       = "SAL1234567890"
MOCK_INVOICE_NUM   = "INV-567890-00001"

MOCK_SALE = {
    "PK": "ORG", "SK": f"SALE#{MOCK_SALE_ID}",
    "sale_id":         MOCK_SALE_ID,
    "invoice_number":  MOCK_INVOICE_NUM,
    "tenant_id":       MOCK_TENANT_ID,
    "customer_name":   "Ramesh Kumar",
    "customer_phone":  "9876543210",
    "customer_gstin":  "27AAPFU0939F1ZV",
    "subtotal":        Decimal("5000.00"),
    "total_gst":       Decimal("900.00"),
    "discount_amount": Decimal("100.00"),
    "total_amount":    Decimal("5800.00"),
    "payment_method":  "UPI",
    "date":            "2026-02-28",
    "notes":           "Thank you for your purchase!",
}

MOCK_ITEMS = [
    {
        "PK": "ORG", "SK": f"SALEITEM#{MOCK_SALE_ID}#PRD001",
        "product_id": "PRD001", "product_name": "Basmati Rice (5kg)",
        "sku": "RICE-5KG", "unit": "bag",
        "quantity": Decimal("10"), "selling_price": Decimal("250.00"),
        "cost_price": Decimal("200.00"), "gst_rate": Decimal("5"),
        "gst_amount": Decimal("125.00"), "line_total": Decimal("2500.00"),
        "line_total_with_gst": Decimal("2625.00"),
    },
    {
        "PK": "ORG", "SK": f"SALEITEM#{MOCK_SALE_ID}#PRD002",
        "product_id": "PRD002", "product_name": "Sunflower Oil (1L)",
        "sku": "OIL-1L", "unit": "bottle",
        "quantity": Decimal("5"), "selling_price": Decimal("180.00"),
        "cost_price": Decimal("140.00"), "gst_rate": Decimal("18"),
        "gst_amount": Decimal("162.00"), "line_total": Decimal("900.00"),
        "line_total_with_gst": Decimal("1062.00"),
    },
    {
        "PK": "ORG", "SK": f"SALEITEM#{MOCK_SALE_ID}#PRD003",
        "product_id": "PRD003", "product_name": "Sugar (1kg)",
        "sku": "SUGAR-1KG", "unit": "kg",
        "quantity": Decimal("20"), "selling_price": Decimal("50.00"),
        "cost_price": Decimal("38.00"), "gst_rate": Decimal("5"),
        "gst_amount": Decimal("50.00"), "line_total": Decimal("1000.00"),
        "line_total_with_gst": Decimal("1050.00"),
    },
]

MOCK_TENANT = {
    "PK": "ORG", "SK": "META",
    "tenant_id":     MOCK_TENANT_ID,
    "business_name": "Ramesh General Store",
    "owner_name":    "Ramesh Kumar",
    "email":         "ramesh@example.com",
    "phone":         "9876543210",
    "address":       "Shop No. 12, Gandhi Market",
    "city":          "Mumbai",
    "state":         "Maharashtra",
    "gstin":         "27AAPFU0939F1ZV",
    "pincode":       "400001",
}


def run_test():
    output_dir = Path(__file__).parent / "test_output"
    output_dir.mkdir(exist_ok=True)
    output_path = output_dir / "test_invoice.pdf"

    # Build a mock DynamoDB table
    mock_table = MagicMock()
    mock_table.get_item.side_effect = lambda Key, **kw: {
        "Item": MOCK_SALE if "SALE#" in Key["SK"] else MOCK_TENANT
    }
    mock_table.query.return_value = {"Items": MOCK_ITEMS}
    mock_table.update_item.return_value = {}

    mock_s3 = MagicMock()
    uploaded = {}
    def fake_put_object(**kwargs):
        uploaded["key"]  = kwargs["Key"]
        uploaded["size"] = len(kwargs["Body"])
        # Write to disk instead of S3
        local_key = output_dir / kwargs["Key"].replace("/", "_")
        local_key.write_bytes(kwargs["Body"])
        print(f"   [S3 mock] Would upload to s3://<bucket>/{kwargs['Key']}")
    mock_s3.put_object = fake_put_object

    with patch("lambda_function.get_dynamodb") as mock_ddb, \
         patch("lambda_function.get_s3", return_value=mock_s3):
        mock_ddb.return_value.Table.return_value = mock_table

        import lambda_function as lf
        lf.process_invoice(MOCK_SALE_ID, MOCK_TENANT_ID, MOCK_INVOICE_NUM)

    # Copy output to a simple named file
    written = list(output_dir.glob("*.pdf"))
    if written:
        import shutil
        shutil.copy(written[0], output_path)

    print(f"\n✅ Test PDF written to: {output_path.resolve()}")
    print(f"   Open it in your PDF viewer to verify the output.")


if __name__ == "__main__":
    print("═" * 50)
    print("  CloudHisaab Invoice PDF — Local Test")
    print("═" * 50)
    run_test()
