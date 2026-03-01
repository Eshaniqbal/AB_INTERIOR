"""
backend/graphql_api/resolvers/expense_resolver.py
---------------------------------------------------
Expense CRUD — per-org table design.
Summary counters stored in per-org COUNTER#DATE items.
"""

import uuid
import strawberry
from typing import List
from datetime import datetime, timezone
from decimal import Decimal
from collections import defaultdict

from ..db import ORG_PK, expense_sk, gsi1_expense_sk, put, query_pk, query_gsi1, get_org_table
from ..types.expense import Expense, ExpenseInput, ExpenseConnection, ExpenseSummary
from ..context import AppContext


def _map(item: dict) -> Expense:
    return Expense(
        expense_id=item["expense_id"],
        amount=float(item["amount"]),
        category=item.get("category", "OTHER"),
        description=item.get("description", ""),
        date=item.get("date", ""),
        payment_method=item.get("payment_method", "CASH"),
        created_at=item.get("created_at", ""),
        created_by=item.get("created_by", ""),
    )


def add_expense(info: strawberry.types.Info[AppContext, None],
                input: ExpenseInput) -> Expense:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id

    now        = datetime.now(timezone.utc).isoformat()
    date       = input.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    expense_id = f"EXP{uuid.uuid4().hex[:10].upper()}"

    item = {
        "PK": ORG_PK, "SK": expense_sk(expense_id),
        "GSI1PK": ORG_PK, "GSI1SK": gsi1_expense_sk(date, expense_id),
        "expense_id": expense_id,
        "amount":         Decimal(str(input.amount)),
        "category":       input.category,
        "description":    input.description,
        "date":           date,
        "payment_method": input.payment_method or "CASH",
        "created_at":     now,
        "created_by":     ctx.auth.user_id,
    }
    put(tid, item)

    # Update daily expense counter in org table
    try:
        get_org_table(tid).update_item(
            Key={"PK": ORG_PK, "SK": f"SUMMARY#DATE#{date}"},
            UpdateExpression="ADD total_expenses :e",
            ExpressionAttributeValues={":e": Decimal(str(input.amount))},
        )
    except Exception:
        pass

    return _map(item)


def list_expenses(info: strawberry.types.Info[AppContext, None],
                  month: str) -> ExpenseConnection:
    """month = YYYY-MM"""
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    resp      = query_gsi1(tid, ORG_PK, sk_prefix=f"DATE#{month}", limit=500)
    all_items = resp.get("Items", [])
    expenses  = [i for i in all_items if i.get("SK", "").startswith("EXPENSE#")]

    mapped = [_map(e) for e in expenses]
    total  = sum(float(e.amount) for e in mapped)

    by_cat: dict = defaultdict(lambda: {"total": 0.0, "count": 0})
    for e in mapped:
        by_cat[e.category]["total"] += float(e.amount)
        by_cat[e.category]["count"] += 1

    return ExpenseConnection(
        items=mapped,
        total_amount=round(total, 2),
        by_category=[
            ExpenseSummary(category=cat, total=round(v["total"], 2), count=v["count"])
            for cat, v in by_cat.items()
        ],
    )


def delete_expense(info: strawberry.types.Info[AppContext, None],
                   expense_id: str) -> bool:
    ctx = info.context
    ctx.auth.require_min_role("MANAGER")
    tid = ctx.auth.tenant_id
    get_org_table(tid).delete_item(Key={"PK": ORG_PK, "SK": expense_sk(expense_id)})
    return True
