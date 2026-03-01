import strawberry
from typing import List

@strawberry.type
class HsnSummaryItem:
    hsn_code: str
    total_quantity: float
    total_taxable_value: float
    total_gst_amount: float
    total_value: float

@strawberry.type
class TaxSlabSummaryItem:
    gst_rate: float
    total_taxable_value: float
    total_gst_amount: float
    total_value: float

@strawberry.type
class B2bB2cSummary:
    b2b_taxable_value: float
    b2b_gst_amount: float
    b2b_total_value: float
    b2c_taxable_value: float
    b2c_gst_amount: float
    b2c_total_value: float

@strawberry.type
class Gstr1Report:
    date_from: str
    date_to: str
    total_taxable_value: float
    total_gst_amount: float
    total_invoice_value: float
    b2b_b2c: B2bB2cSummary
    hsn_summary: List[HsnSummaryItem]
    tax_slab_summary: List[TaxSlabSummaryItem]
