"""
backend/graphql_api/types/invoice.py
--------------------------------------
Strawberry types for Invoice / Sale entities.
"""

import strawberry
from typing import Optional, List


@strawberry.input
class InvoiceItemInput:
    product_id: str
    quantity: float
    selling_price: Optional[float] = None   # override product price if given


@strawberry.input
class InvoiceInput:
    customer_name: str
    customer_phone: Optional[str] = None
    customer_gstin: Optional[str] = None
    items: List[InvoiceItemInput]
    discount_amount: Optional[float] = 0.0
    notes: Optional[str] = None
    payment_method: Optional[str] = "CASH"  # CASH | UPI | CARD | CREDIT | PARTIAL
    amount_paid: Optional[float] = None      # if None → fully paid


@strawberry.type
class InvoiceItem:
    product_id: str
    product_name: str
    sku: str
    hsn_code: str
    quantity: float
    cost_price: float
    selling_price: float
    gst_rate: float
    gst_amount: float
    profit: float
    line_total: float       # selling_price * quantity (ex-GST)
    line_total_with_gst: float


@strawberry.type
class Invoice:
    sale_id: str
    invoice_number: str
    tenant_id: str
    customer_name: str
    customer_phone: str
    customer_gstin: str
    items: List[InvoiceItem]
    subtotal: float          # sum of line_total (ex-GST)
    total_gst: float
    discount_amount: float
    total_amount: float      # final amount paid
    total_cost: float
    total_profit: float
    payment_method: str
    pdf_url: Optional[str]
    notes: str
    created_at: str
    created_by: str
    # Business / shop info (from org META record)
    business_name: Optional[str] = None
    business_gstin: Optional[str] = None
    business_address: Optional[str] = None
    business_phone: Optional[str] = None
    business_city: Optional[str] = None
    business_state: Optional[str] = None


@strawberry.type
class InvoiceResponse:
    """Returned immediately after invoice creation."""
    sale_id: str
    invoice_number: str
    total_amount: float
    total_profit: float
    total_gst: float
    amount_paid: float
    balance_due: float
    pdf_url: Optional[str]   # set after async PDF generation
    created_at: str


@strawberry.type
class InvoiceConnection:
    items: List[Invoice]
    next_token: Optional[str] = None
    total: int = 0
