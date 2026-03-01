"""
backend/graphql_api/resolvers/stock_resolver.py
-------------------------------------------------
Stock ledger — per-org table design.
Stock = SUM(IN) - SUM(OUT), never stored directly.
"""

import uuid
import strawberry
from typing import List
from datetime import datetime, timezone
from decimal import Decimal

from ..db import ORG_PK, product_sk, stock_sk, purchase_sk, purchase_item_sk, put, get, query_pk
from ..types.stock import StockLevel, Purchase, PurchaseInput
from ..context import AppContext


def get_stock_levels(info: strawberry.types.Info[AppContext, None]) -> List[StockLevel]:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    products_resp = query_pk(tid, ORG_PK, sk_prefix="PRODUCT#", limit=500)
    products = {i["product_id"]: i for i in products_resp.get("Items", [])}

    levels = []
    for pid, prod in products.items():
        stock_resp = query_pk(tid, ORG_PK, sk_prefix=f"STOCK#{pid}#", limit=1000)
        entries   = stock_resp.get("Items", [])
        total_in  = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "IN")
        total_out = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "OUT")
        current   = total_in - total_out
        alert     = int(prod.get("low_stock_alert", 10))
        levels.append(StockLevel(
            product_id=pid,
            product_name=str(prod.get("name", "")),
            sku=str(prod.get("sku", "")),
            total_in=total_in,
            total_out=total_out,
            current_stock=current,
            low_stock_alert=alert,
            is_low_stock=current <= alert,
        ))
    return levels


def get_stock_level(info: strawberry.types.Info[AppContext, None],
                    product_id: str) -> StockLevel:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    prod = get(tid, ORG_PK, product_sk(product_id))
    if not prod:
        raise Exception("Product not found")

    stock_resp = query_pk(tid, ORG_PK, sk_prefix=f"STOCK#{product_id}#", limit=1000)
    entries   = stock_resp.get("Items", [])
    total_in  = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "IN")
    total_out = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "OUT")
    current   = total_in - total_out
    alert     = int(prod.get("low_stock_alert", 10))
    return StockLevel(
        product_id=product_id,
        product_name=str(prod.get("name", "")),
        sku=str(prod.get("sku", "")),
        total_in=total_in, total_out=total_out,
        current_stock=current, low_stock_alert=alert,
        is_low_stock=current <= alert,
    )


def record_purchase(info: strawberry.types.Info[AppContext, None],
                    input: PurchaseInput) -> Purchase:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id

    now         = datetime.now(timezone.utc).isoformat()
    purchase_id = f"PUR{uuid.uuid4().hex[:10].upper()}"
    total       = 0.0
    result_items = []

    for it in input.items:
        prod = get(tid, ORG_PK, product_sk(it.product_id))
        if not prod:
            raise Exception(f"Product {it.product_id} not found")

        qty  = float(it.quantity)
        cp   = float(it.cost_price)
        line = round(cp * qty, 2)
        total += line

        put(tid, {
            "PK": ORG_PK, "SK": stock_sk(it.product_id, now),
            "product_id": it.product_id,
            "entry_type": "IN", "quantity": Decimal(str(qty)),
            "reference_type": "PURCHASE", "reference_id": purchase_id,
            "notes": f"Purchase from {input.supplier_name}",
            "created_at": now,
        })
        put(tid, {
            "PK": ORG_PK, "SK": purchase_item_sk(purchase_id, it.product_id),
            "purchase_id": purchase_id, "product_id": it.product_id,
            "product_name": str(prod.get("name", "")),
            "quantity": Decimal(str(qty)), "cost_price": Decimal(str(cp)),
            "line_total": Decimal(str(line)), "created_at": now,
        })
        result_items.append({
            "product_id": it.product_id,
            "product_name": str(prod.get("name", "")),
            "quantity": qty, "cost_price": cp, "line_total": line,
        })

    put(tid, {
        "PK": ORG_PK, "SK": purchase_sk(purchase_id),
        "purchase_id": purchase_id,
        "supplier_name":    input.supplier_name,
        "supplier_invoice": input.supplier_invoice or "",
        "total_amount": Decimal(str(round(total, 2))),
        "notes": input.notes or "",
        "created_at": now, "created_by": ctx.auth.user_id,
    })

    from ..types.stock import PurchaseItem
    return Purchase(
        purchase_id=purchase_id,
        supplier_name=input.supplier_name,
        supplier_invoice=input.supplier_invoice or "",
        items=[PurchaseItem(**i) for i in result_items],
        total_amount=round(total, 2),
        notes=input.notes or "",
        created_at=now,
        created_by=ctx.auth.user_id,
    )
