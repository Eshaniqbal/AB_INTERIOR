"""
backend/graphql_api/resolvers/billing_resolver.py
---------------------------------------------------
Invoice creation and retrieval — per-org table design.
"""

import json
import uuid
import os
import strawberry
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal

from ..db import (
    ORG_PK, sale_sk, sale_item_sk, stock_sk, product_sk,
    gsi1_sale_sk, meta_sk, put, get, get_org_table, get_s3, get_sqs,
    query_pk, query_gsi1,
)
from ..types.invoice import (
    Invoice, InvoiceItem, InvoiceInput, InvoiceResponse, InvoiceConnection,
)
from ..context import AppContext
from .customer_resolver import upsert_customer_invoice

S3_BUCKET = os.environ.get("S3_BUCKET", "cloudhisaab-storage")
SQS_QUEUE = os.environ.get("SQS_INVOICE_QUEUE_URL", "")


def _invoice_number(tenant_id: str, counter: int) -> str:
    return f"INV-{tenant_id[-6:].upper()}-{counter:05d}"


def _map_item(item: dict) -> InvoiceItem:
    sp       = float(item.get("selling_price", 0))
    cp       = float(item.get("cost_price", 0))
    qty      = float(item.get("quantity", 1))
    gst_rate = float(item.get("gst_rate", 0))
    gst_amt  = round(sp * gst_rate / 100 * qty, 2)
    return InvoiceItem(
        product_id=item["product_id"],
        product_name=item.get("product_name", ""),
        sku=item.get("sku", ""),
        hsn_code=item.get("hsn_code", ""),
        quantity=qty,
        cost_price=cp,
        selling_price=sp,
        gst_rate=gst_rate,
        gst_amount=gst_amt,
        profit=round((sp - cp) * qty, 2),
        line_total=round(sp * qty, 2),
        line_total_with_gst=round((sp + sp * gst_rate / 100) * qty, 2),
    )


def _map_invoice(sale: dict, items: List[dict], meta: Optional[dict] = None) -> Invoice:
    m = meta or {}
    return Invoice(
        sale_id=sale["sale_id"],
        invoice_number=sale.get("invoice_number", ""),
        tenant_id=sale.get("tenant_id", ""),
        customer_name=sale.get("customer_name", ""),
        customer_phone=sale.get("customer_phone", ""),
        customer_gstin=sale.get("customer_gstin", ""),
        items=[_map_item(i) for i in items],
        subtotal=float(sale.get("subtotal", 0)),
        total_gst=float(sale.get("total_gst", 0)),
        discount_amount=float(sale.get("discount_amount", 0)),
        total_amount=float(sale.get("total_amount", 0)),
        total_cost=float(sale.get("total_cost", 0)),
        total_profit=float(sale.get("total_profit", 0)),
        payment_method=sale.get("payment_method", "CASH"),
        pdf_url=sale.get("pdf_url"),
        notes=sale.get("notes", ""),
        created_at=sale.get("created_at", ""),
        created_by=sale.get("created_by", ""),
        business_name=m.get("business_name"),
        business_gstin=m.get("gstin"),
        business_address=m.get("address"),
        business_phone=m.get("phone"),
        business_city=m.get("city"),
        business_state=m.get("state"),
    )


def create_invoice(info: strawberry.types.Info[AppContext, None],
                   input: InvoiceInput) -> InvoiceResponse:
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER", "CASHIER")
    tid = ctx.auth.tenant_id

    now   = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sale_id = f"SAL{uuid.uuid4().hex[:10].upper()}"

    # ── 1. Compute line items ──────────────────────────────────
    computed, total_cost, total_profit, subtotal, total_gst = [], 0.0, 0.0, 0.0, 0.0
    for it in input.items:
        prod = get(tid, ORG_PK, product_sk(it.product_id))
        if not prod:
            raise Exception(f"Product {it.product_id} not found")
        sp  = float(it.selling_price) if it.selling_price else float(prod["selling_price"])
        cp  = float(prod["cost_price"])
        qty = float(it.quantity)
        gst = float(prod.get("gst_rate", 0))
        gst_amt = round(sp * gst / 100 * qty, 2)
        line    = round(sp * qty, 2)
        profit  = round((sp - cp) * qty, 2)

        subtotal     += line
        total_gst    += gst_amt
        total_cost   += round(cp * qty, 2)
        total_profit += profit

        computed.append({
            "product_id":   it.product_id,
            "product_name": str(prod.get("name", "")),
            "sku":          str(prod.get("sku", "")),
            "hsn_code":     str(prod.get("hsn_code", "")),
            "quantity":     Decimal(str(qty)),
            "cost_price":   Decimal(str(cp)),
            "selling_price":Decimal(str(sp)),
            "gst_rate":     Decimal(str(gst)),
            "gst_amount":   Decimal(str(gst_amt)),
            "profit":       Decimal(str(profit)),
            "line_total":   Decimal(str(line)),
        })

    discount     = float(input.discount_amount or 0)
    total_amount = round(subtotal + total_gst - discount, 2)
    amount_paid  = float(input.amount_paid) if input.amount_paid is not None else total_amount
    amount_paid  = round(min(amount_paid, total_amount), 2)   # cap at total
    balance_due  = round(total_amount - amount_paid, 2)

    # ── 2. Invoice counter + daily summary (atomic) ────────────
    table = get_org_table(tid)
    try:
        resp = table.update_item(
            Key={"PK": ORG_PK, "SK": "COUNTER#INVOICE"},
            UpdateExpression="ADD invoice_count :one",
            ExpressionAttributeValues={":one": 1},
            ReturnValues="ALL_NEW",
        )
        count = int(resp["Attributes"].get("invoice_count", 1))
    except Exception:
        count = 1

    # Update daily sales/profit summary (powers dashboard)
    try:
        table.update_item(
            Key={"PK": ORG_PK, "SK": f"SUMMARY#DATE#{today}"},
            UpdateExpression=(
                "ADD total_sales :s, total_profit :p, invoice_count :one"
            ),
            ExpressionAttributeValues={
                ":s":   Decimal(str(total_amount)),
                ":p":   Decimal(str(round(total_profit, 2))),
                ":one": 1,
            },
        )
    except Exception:
        pass

    invoice_num = _invoice_number(tid, count)


    # ── 3. Write SALE record ───────────────────────────────────
    put(tid, {
        "PK": ORG_PK, "SK": sale_sk(sale_id),
        "GSI1PK": ORG_PK, "GSI1SK": gsi1_sale_sk(today, sale_id),
        "sale_id": sale_id,
        "invoice_number": invoice_num,
        "tenant_id": tid,
        "customer_name":  input.customer_name,
        "customer_phone": input.customer_phone or "",
        "customer_gstin": input.customer_gstin or "",
        "subtotal":        Decimal(str(round(subtotal, 2))),
        "total_gst":       Decimal(str(round(total_gst, 2))),
        "discount_amount": Decimal(str(discount)),
        "total_amount":    Decimal(str(total_amount)),
        "amount_paid":     Decimal(str(amount_paid)),
        "balance_due":     Decimal(str(balance_due)),
        "total_cost":      Decimal(str(round(total_cost, 2))),
        "total_profit":    Decimal(str(round(total_profit, 2))),
        "payment_method":  input.payment_method or "CASH",
        "notes": input.notes or "",
        "date":  today,
        "created_at": now,
        "created_by": ctx.auth.user_id,
        "pdf_url": None,
        "pdf_status": "PENDING",
    })

    # ── 4. Write SALEITEM + STOCK OUT ──────────────────────────
    for ci in computed:
        put(tid, {"PK": ORG_PK, "SK": sale_item_sk(sale_id, ci["product_id"]),
                  "sale_id": sale_id, "tenant_id": tid, **ci})
        put(tid, {"PK": ORG_PK, "SK": stock_sk(ci["product_id"], now),
                  "product_id": ci["product_id"], "tenant_id": tid,
                  "entry_type": "OUT", "quantity": ci["quantity"],
                  "reference_type": "SALE", "reference_id": sale_id,
                  "notes": f"Invoice {invoice_num}", "created_at": now})

    # ── 5. Update customer ledger ──────────────────────────────
    if input.customer_phone:
        upsert_customer_invoice(
            tid=tid,
            phone=input.customer_phone,
            name=input.customer_name,
            gstin=input.customer_gstin or "",
            total_amount=total_amount,
            amount_paid=amount_paid,
            date=today,
            invoice_number=invoice_num,
        )

    # ── 6. Enqueue async PDF generation ───────────────────────
    if SQS_QUEUE:
        try:
            get_sqs().send_message(
                QueueUrl=SQS_QUEUE,
                MessageBody=json.dumps({
                    "sale_id":        sale_id,
                    "tenant_id":      tid,
                    "invoice_number": invoice_num,
                }),
                MessageAttributes={
                    "tenant_id": {"StringValue": tid, "DataType": "String"},
                },
            )
        except Exception as _sqs_err:
            import logging
            logging.getLogger(__name__).warning(
                "SQS enqueue failed for %s: %s", invoice_num, _sqs_err
            )

    return InvoiceResponse(
        sale_id=sale_id,
        invoice_number=invoice_num,
        total_amount=total_amount,
        total_profit=round(total_profit, 2),
        total_gst=round(total_gst, 2),
        amount_paid=amount_paid,
        balance_due=balance_due,
        pdf_url=None,
        created_at=now,
    )


def list_invoices(info: strawberry.types.Info[AppContext, None],
                  date_from: Optional[str] = None,
                  limit: int = 50) -> InvoiceConnection:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    if date_from:
        # GSI1SK format: DATE#YYYY-MM-DD#SALE#<id>
        # Use YYYY-MM prefix to match the whole month regardless of the day sent
        # e.g. "2026-02-01" → "DATE#2026-02" matches all of February
        month_prefix = "DATE#" + date_from[:7]
        resp = query_gsi1(tid, ORG_PK, sk_prefix=month_prefix, limit=limit)
    else:
        resp = query_pk(tid, ORG_PK, sk_prefix="SALE#", limit=limit)
    sales = resp.get("Items", [])

    invoices = []
    for sale in sales:
        items_resp = query_pk(tid, ORG_PK, sk_prefix=f"SALEITEM#{sale['sale_id']}#")
        invoices.append(_map_invoice(sale, items_resp.get("Items", [])))

    return InvoiceConnection(items=invoices, total=len(invoices))


def get_invoice(info: strawberry.types.Info[AppContext, None],
                sale_id: str) -> Optional[Invoice]:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id
    sale = get(tid, ORG_PK, sale_sk(sale_id))
    if not sale:
        return None
    items_resp = query_pk(tid, ORG_PK, sk_prefix=f"SALEITEM#{sale_id}#")
    meta = get(tid, ORG_PK, meta_sk()) or {}
    return _map_invoice(sale, items_resp.get("Items", []), meta)


def get_invoice_download_url(info: strawberry.types.Info[AppContext, None],
                             sale_id: str) -> Optional[str]:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    sale = get(tid, ORG_PK, sale_sk(sale_id))
    if not sale:
        return None

    # Use the exact S3 key stored by Lambda (always lowercase tenant prefix).
    # Avoid reconstructing from tid which may be uppercase from Cognito.
    s3_key = sale.get("pdf_s3_key")
    if not s3_key:
        # PDF not generated yet — fall back to constructed path (lowercase)
        inv_num = sale.get("invoice_number", sale_id)
        s3_key = f"{tid.lower()}/invoices/{inv_num}.pdf"

    try:
        url = get_s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": s3_key},
            ExpiresIn=3600,
        )
        return url
    except Exception:
        return None
