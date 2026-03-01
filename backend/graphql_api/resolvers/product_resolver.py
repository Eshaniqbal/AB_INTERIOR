"""
backend/graphql_api/resolvers/product_resolver.py
---------------------------------------------------
CRUD resolvers for Product entity — per-org table design.
"""

import strawberry
from typing import Optional
from datetime import datetime, timezone
from decimal import Decimal
import uuid

from ..db import ORG_PK, product_sk, put, get, delete, update, query_pk
from ..types.product import Product, ProductInput, ProductConnection
from ..context import AppContext


def _map_product(item: dict) -> Product:
    sp  = float(item.get("selling_price", 0))
    cp  = float(item.get("cost_price", 0))
    gst = float(item.get("gst_rate", 0))
    gst_amount = round(sp * gst / 100, 2)
    margin = round(((sp - cp) / sp * 100), 2) if sp else 0.0
    return Product(
        product_id=item["product_id"],
        name=item["name"],
        sku=item.get("sku", ""),
        hsn_code=item.get("hsn_code", ""),
        cost_price=cp,
        selling_price=sp,
        gst_rate=gst,
        category=item.get("category", "General"),
        unit=item.get("unit", "pcs"),
        low_stock_alert=int(item.get("low_stock_alert", 10)),
        created_at=item.get("created_at", ""),
        updated_at=item.get("updated_at", ""),
        margin_percent=margin,
        gst_amount=gst_amount,
        selling_price_with_gst=round(sp + gst_amount, 2),
    )


def list_products(info: strawberry.types.Info[AppContext, None],
                  limit: int = 200,
                  next_token: Optional[str] = None) -> ProductConnection:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    resp  = query_pk(tid, ORG_PK, sk_prefix="PRODUCT#", limit=limit)
    items = [_map_product(i) for i in resp.get("Items", [])]
    return ProductConnection(
        items=items,
        total=len(items),
        next_token=str(resp["LastEvaluatedKey"]) if resp.get("LastEvaluatedKey") else None,
    )


def get_product(info: strawberry.types.Info[AppContext, None],
                product_id: str) -> Optional[Product]:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id
    item = get(tid, ORG_PK, product_sk(product_id))
    return _map_product(item) if item else None


def create_product(info: strawberry.types.Info[AppContext, None],
                   input: ProductInput) -> Product:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id

    product_id = f"PRD{uuid.uuid4().hex[:10].upper()}"
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "PK": ORG_PK,
        "SK": product_sk(product_id),
        "product_id": product_id,
        "name": input.name,
        "sku": input.sku,
        "hsn_code": input.hsn_code or "",
        "cost_price":     Decimal(str(input.cost_price)),
        "selling_price":  Decimal(str(input.selling_price)),
        "gst_rate":       Decimal(str(input.gst_rate)),
        "category":       input.category or "General",
        "unit":           input.unit or "pcs",
        "low_stock_alert": input.low_stock_alert or 10,
        "created_at": now,
        "updated_at": now,
        "created_by": ctx.auth.user_id,
    }
    put(tid, item)
    return _map_product(item)


def update_product(info: strawberry.types.Info[AppContext, None],
                   product_id: str, input: ProductInput) -> Product:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id
    now = datetime.now(timezone.utc).isoformat()

    attrs = update(
        tid, ORG_PK, product_sk(product_id),
        expression=(
            "SET #name=:n, sku=:s, hsn_code=:hsn, cost_price=:cp, selling_price=:sp, "
            "gst_rate=:g, category=:c, #unit=:u, low_stock_alert=:l, updated_at=:ua"
        ),
        values={
            ":n":  input.name,
            ":s":  input.sku,
            ":hsn": input.hsn_code or "",
            ":cp": Decimal(str(input.cost_price)),
            ":sp": Decimal(str(input.selling_price)),
            ":g":  Decimal(str(input.gst_rate)),
            ":c":  input.category or "General",
            ":u":  input.unit or "pcs",
            ":l":  input.low_stock_alert or 10,
            ":ua": now,
        },
        names={"#name": "name", "#unit": "unit"},
    )
    attrs["product_id"] = product_id
    return _map_product(attrs)


def delete_product(info: strawberry.types.Info[AppContext, None],
                   product_id: str) -> bool:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id
    delete(tid, ORG_PK, product_sk(product_id))
    return True
