"""
backend/graphql_api/types/stock.py
------------------------------------
Strawberry types for Stock & Purchase entities.
"""

import strawberry
from typing import Optional, List


@strawberry.type
class StockLevel:
    product_id: str
    product_name: str
    sku: str
    total_in: float
    total_out: float
    current_stock: float    # total_in - total_out
    low_stock_alert: int
    is_low_stock: bool


@strawberry.type
class StockEntry:
    entry_id: str
    product_id: str
    entry_type: str         # IN | OUT
    quantity: float
    reference_type: str     # SALE | PURCHASE | ADJUSTMENT
    reference_id: str
    notes: str
    created_at: str


@strawberry.input
class PurchaseItemInput:
    product_id: str
    quantity: float
    cost_price: float       # purchase price (updates product cost)


@strawberry.input
class PurchaseInput:
    supplier_name: str
    supplier_invoice: Optional[str] = None
    items: List[PurchaseItemInput]
    notes: Optional[str] = None


@strawberry.type
class PurchaseItem:
    product_id: str
    product_name: str
    quantity: float
    cost_price: float
    line_total: float


@strawberry.type
class Purchase:
    purchase_id: str
    supplier_name: str
    supplier_invoice: str
    items: List[PurchaseItem]
    total_amount: float
    notes: str
    created_at: str
    created_by: str
