"""
backend/graphql_api/types/expense.py
--------------------------------------
Strawberry types for Expense entity.
"""

import strawberry
from typing import Optional, List


EXPENSE_CATEGORIES = [
    "RENT", "SALARY", "ELECTRICITY", "TRANSPORT",
    "MARKETING", "MAINTENANCE", "PURCHASE", "OTHER"
]


@strawberry.input
class ExpenseInput:
    amount: float
    category: str
    description: str
    date: Optional[str] = None   # YYYY-MM-DD, defaults to today
    payment_method: Optional[str] = "CASH"


@strawberry.type
class Expense:
    expense_id: str
    amount: float
    category: str
    description: str
    date: str
    payment_method: str
    created_at: str
    created_by: str


@strawberry.type
class ExpenseSummary:
    category: str
    total: float
    count: int


@strawberry.type
class ExpenseConnection:
    items: List[Expense]
    total_amount: float
    by_category: List[ExpenseSummary]
