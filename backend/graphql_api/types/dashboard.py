"""
backend/graphql_api/types/dashboard.py
----------------------------------------
Strawberry types for Dashboard and Reports.
"""

import strawberry
from typing import Optional, List


@strawberry.type
class DailySummary:
    date: str
    total_sales: float
    total_profit: float
    total_expenses: float
    net_profit: float
    invoice_count: int
    items_sold: float


@strawberry.type
class ProfitReport:
    date_from: str
    date_to: str
    gross_profit: float
    total_expenses: float
    net_profit: float
    total_revenue: float
    total_cost: float
    invoice_count: int
    profit_margin_percent: float
    daily_breakdown: List[DailySummary]


@strawberry.type
class TopProduct:
    product_id: str
    product_name: str
    sku: str
    total_quantity_sold: float
    total_revenue: float
    total_profit: float


@strawberry.type
class DashboardSummary:
    today: DailySummary
    month: DailySummary
    top_products: List[TopProduct]
    low_stock_count: int
    pending_invoices: int
