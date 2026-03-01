"""
backend/graphql_api/types/product.py
--------------------------------------
Strawberry types for Product entity.
"""

import strawberry
from typing import Optional


@strawberry.input
class ProductInput:
    name: str
    sku: str
    hsn_code: Optional[str] = ""
    cost_price: float
    selling_price: float
    gst_rate: float        # e.g. 18.0 for 18%
    category: Optional[str] = None
    unit: Optional[str] = "pcs"
    low_stock_alert: Optional[int] = 10


@strawberry.type
class Product:
    product_id: str
    name: str
    sku: str
    hsn_code: str
    cost_price: float
    selling_price: float
    gst_rate: float
    category: str
    unit: str
    low_stock_alert: int
    created_at: str
    updated_at: str
    # computed
    margin_percent: float
    gst_amount: float       # GST on selling price
    selling_price_with_gst: float


@strawberry.type
class ProductConnection:
    items: list["Product"]
    next_token: Optional[str] = None
    total: int = 0
