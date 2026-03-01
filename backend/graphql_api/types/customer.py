"""
backend/graphql_api/types/customer.py
--------------------------------------
Customer ledger types for CloudHisaab.
"""

import strawberry
from typing import Optional, List
from decimal import Decimal


@strawberry.type
class Customer:
    customer_id: str
    name: str
    phone: str
    gstin: str
    total_invoiced: float
    total_paid: float
    advance: float
    outstanding: float
    invoice_count: int
    last_invoice_date: Optional[str]


@strawberry.type
class CustomerLedgerEntry:
    entry_id: str
    entry_type: str          # INVOICE | PAYMENT | ADVANCE
    amount: float
    amount_paid: float       # how much was paid at creation (0 for PAYMENT/ADVANCE entries, full amount usually)
    balance_after: float
    description: str
    date: str
    created_at: str


@strawberry.type
class CustomerLedger:
    customer: Customer
    entries: List[CustomerLedgerEntry]


@strawberry.type
class CustomerConnection:
    items: List[Customer]
    total: int


@strawberry.input
class RecordPaymentInput:
    phone: str
    amount: float
    notes: Optional[str] = None


@strawberry.input
class RecordAdvanceInput:
    phone: str
    name: str
    amount: float
    notes: Optional[str] = None
