"""
backend/graphql_api/resolvers/report_resolver.py
--------------------------------------------------
Dashboard and profit report — per-org table design.
Daily summaries stored as SUMMARY#DATE#YYYY-MM-DD items in the org table.
"""

import strawberry
from typing import List, Optional
from datetime import datetime, timezone
from decimal import Decimal

from ..db import ORG_PK, query_pk, query_gsi1, get_org_table
from ..types.dashboard import DashboardSummary, DailySummary, ProfitReport, TopProduct
from ..context import AppContext


def _daily_summary(tid: str, date: str) -> DailySummary:
    try:
        resp = get_org_table(tid).get_item(Key={"PK": ORG_PK, "SK": f"SUMMARY#DATE#{date}"})
        item = resp.get("Item", {})
    except Exception:
        item = {}

    sales    = float(item.get("total_sales", 0))
    profit   = float(item.get("total_profit", 0))
    expenses = float(item.get("total_expenses", 0))
    return DailySummary(
        date=date,
        total_sales=sales,
        total_profit=profit,
        total_expenses=expenses,
        net_profit=round(profit - expenses, 2),
        invoice_count=int(item.get("invoice_count", 0)),
        items_sold=float(item.get("items_sold", 0)),
    )


def get_dashboard(info: strawberry.types.Info[AppContext, None],
                  date: Optional[str] = None) -> DashboardSummary:
    ctx = info.context
    ctx.auth.require_auth()
    tid   = ctx.auth.tenant_id
    today = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month = today[:7]

    today_summary = _daily_summary(tid, today)

    # Month totals: sum all SUMMARY#DATE#YYYY-MM-* items
    month_sales = month_profit = month_expenses = 0.0
    month_invoices = 0
    try:
        resp = query_pk(tid, ORG_PK, sk_prefix=f"SUMMARY#DATE#{month}", limit=31)
        for item in resp.get("Items", []):
            month_sales    += float(item.get("total_sales", 0))
            month_profit   += float(item.get("total_profit", 0))
            month_expenses += float(item.get("total_expenses", 0))
            month_invoices += int(item.get("invoice_count", 0))
    except Exception:
        pass

    month_summary = DailySummary(
        date=month,
        total_sales=round(month_sales, 2),
        total_profit=round(month_profit, 2),
        total_expenses=round(month_expenses, 2),
        net_profit=round(month_profit - month_expenses, 2),
        invoice_count=month_invoices,
        items_sold=0,
    )

    # Top products — from today's sale items via GSI1
    top_products = _top_products(tid, today)

    # Low stock count
    low_stock = 0
    try:
        prods = query_pk(tid, ORG_PK, sk_prefix="PRODUCT#", limit=500).get("Items", [])
        for prod in prods:
            pid       = prod["product_id"]
            entries   = query_pk(tid, ORG_PK, sk_prefix=f"STOCK#{pid}#", limit=1000).get("Items", [])
            total_in  = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "IN")
            total_out = sum(float(e["quantity"]) for e in entries if e.get("entry_type") == "OUT")
            if (total_in - total_out) <= int(prod.get("low_stock_alert", 10)):
                low_stock += 1
    except Exception:
        pass

    return DashboardSummary(
        today=today_summary,
        month=month_summary,
        top_products=top_products,
        low_stock_count=low_stock,
        pending_invoices=0,
    )


def _top_products(tid: str, date: str, limit: int = 5) -> List[TopProduct]:
    try:
        resp  = query_gsi1(tid, ORG_PK, sk_prefix=f"DATE#{date}#SALE#", limit=200)
        sales = resp.get("Items", [])
        pmap: dict = {}
        for sale in sales:
            sid = sale.get("sale_id", "")
            if not sid:
                continue
            items = query_pk(tid, ORG_PK, sk_prefix=f"SALEITEM#{sid}#", limit=100).get("Items", [])
            for item in items:
                pid = item["product_id"]
                if pid not in pmap:
                    pmap[pid] = {"product_id": pid,
                                 "product_name": str(item.get("product_name", "")),
                                 "sku": str(item.get("sku", "")),
                                 "total_quantity_sold": 0.0,
                                 "total_revenue": 0.0,
                                 "total_profit": 0.0}
                pmap[pid]["total_quantity_sold"] += float(item.get("quantity", 0))
                pmap[pid]["total_revenue"]       += float(item.get("line_total", 0))
                pmap[pid]["total_profit"]        += float(item.get("profit", 0))
        return [TopProduct(**p) for p in sorted(pmap.values(), key=lambda x: x["total_revenue"], reverse=True)[:limit]]
    except Exception:
        return []


def get_profit_report(info: strawberry.types.Info[AppContext, None],
                      date_from: str, date_to: str) -> ProfitReport:
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER", "ACCOUNTANT")
    tid = ctx.auth.tenant_id

    try:
        from boto3.dynamodb.conditions import Key
        resp = get_org_table(tid).query(
            KeyConditionExpression=(
                Key("PK").eq(ORG_PK) &
                Key("SK").between(
                    f"SUMMARY#DATE#{date_from}",
                    f"SUMMARY#DATE#{date_to}~",
                )
            ),
        )
        items = resp.get("Items", [])

    except Exception as e:
        import traceback; traceback.print_exc()
        items = []

    total_sales    = sum(float(i.get("total_sales", 0))    for i in items)
    total_profit   = sum(float(i.get("total_profit", 0))   for i in items)
    total_expenses = sum(float(i.get("total_expenses", 0)) for i in items)
    total_invoices = sum(int(i.get("invoice_count", 0))    for i in items)
    total_cost     = round(total_sales - total_profit, 2)
    net_profit     = round(total_profit - total_expenses, 2)
    margin         = round((total_profit / total_sales * 100), 2) if total_sales else 0.0

    daily = [
        DailySummary(
            date=i["SK"].replace("SUMMARY#DATE#", ""),
            total_sales=float(i.get("total_sales", 0)),
            total_profit=float(i.get("total_profit", 0)),
            total_expenses=float(i.get("total_expenses", 0)),
            net_profit=round(float(i.get("total_profit", 0)) - float(i.get("total_expenses", 0)), 2),
            invoice_count=int(i.get("invoice_count", 0)),
            items_sold=float(i.get("items_sold", 0)),
        )
        for i in items
    ]

    return ProfitReport(
        date_from=date_from, date_to=date_to,
        gross_profit=round(total_profit, 2),
        total_expenses=round(total_expenses, 2),
        net_profit=net_profit,
        total_revenue=round(total_sales, 2),
        total_cost=total_cost,
        invoice_count=total_invoices,
        profit_margin_percent=margin,
        daily_breakdown=daily,
    )


def get_gstr1_report(info: strawberry.types.Info[AppContext, None],
                     date_from: str, date_to: str) -> "Gstr1Report":
    from ..types.gstr1 import Gstr1Report, HsnSummaryItem, TaxSlabSummaryItem, B2bB2cSummary
    from collections import defaultdict
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER", "ACCOUNTANT")
    tid = ctx.auth.tenant_id

    table = get_org_table(tid)
    from boto3.dynamodb.conditions import Key
    resp = table.query(
        IndexName="GSI1",
        KeyConditionExpression=(
            Key("GSI1PK").eq(ORG_PK) &
            Key("GSI1SK").between(f"DATE#{date_from}#", f"DATE#{date_to}#~")
        )
    )
    sales = resp.get("Items", [])

    total_taxable_value = 0.0
    total_gst_amount = 0.0
    total_invoice_value = 0.0
    
    b2b_taxable = b2b_gst = b2b_total = 0.0
    b2c_taxable = b2c_gst = b2c_total = 0.0

    hsn_map = defaultdict(lambda: {"qty": 0.0, "taxable": 0.0, "gst": 0.0, "total": 0.0})
    slab_map = defaultdict(lambda: {"taxable": 0.0, "gst": 0.0, "total": 0.0})

    for sale in sales:
        sid = sale.get("sale_id")
        if not sid:
            continue
        
        # Determine B2B/B2C
        gstin = str(sale.get("customer_gstin", "")).strip()
        is_b2b = bool(gstin and len(gstin) >= 15)

        # Get the SALEITEMs for this sale
        items_resp = table.query(
            KeyConditionExpression=Key("PK").eq(ORG_PK) & Key("SK").begins_with(f"SALEITEM#{sid}#")
        )
        line_items = items_resp.get("Items", [])

        sale_taxable = 0.0
        sale_gst = 0.0
        sale_total = 0.0
        
        for item in line_items:
            qty     = float(item.get("quantity", 0))
            taxable = float(item.get("line_total", 0))
            gst_amt = float(item.get("gst_amount", 0))
            gst_rate= float(item.get("gst_rate", 0))
            hsn     = str(item.get("hsn_code", "")) or "UNKNOWN"
            total   = taxable + gst_amt

            sale_taxable += taxable
            sale_gst     += gst_amt
            sale_total   += total

            hsn_map[hsn]["qty"]     += qty
            hsn_map[hsn]["taxable"] += taxable
            hsn_map[hsn]["gst"]     += gst_amt
            hsn_map[hsn]["total"]   += total

            slab_map[gst_rate]["taxable"] += taxable
            slab_map[gst_rate]["gst"]     += gst_amt
            slab_map[gst_rate]["total"]   += total

        if is_b2b:
            b2b_taxable += sale_taxable
            b2b_gst     += sale_gst
            b2b_total   += sale_total
        else:
            b2c_taxable += sale_taxable
            b2c_gst     += sale_gst
            b2c_total   += sale_total

        total_taxable_value += sale_taxable
        total_gst_amount    += sale_gst
        total_invoice_value += sale_total

    hsn_summary = [
        HsnSummaryItem(
            hsn_code=hsn,
            total_quantity=round(v["qty"], 2),
            total_taxable_value=round(v["taxable"], 2),
            total_gst_amount=round(v["gst"], 2),
            total_value=round(v["total"], 2),
        ) for hsn, v in sorted(hsn_map.items())
    ]

    slab_summary = [
        TaxSlabSummaryItem(
            gst_rate=rate,
            total_taxable_value=round(v["taxable"], 2),
            total_gst_amount=round(v["gst"], 2),
            total_value=round(v["total"], 2),
        ) for rate, v in sorted(slab_map.items())
    ]

    b2b_b2c = B2bB2cSummary(
        b2b_taxable_value=round(b2b_taxable, 2),
        b2b_gst_amount=round(b2b_gst, 2),
        b2b_total_value=round(b2b_total, 2),
        b2c_taxable_value=round(b2c_taxable, 2),
        b2c_gst_amount=round(b2c_gst, 2),
        b2c_total_value=round(b2c_total, 2),
    )

    return Gstr1Report(
        date_from=date_from,
        date_to=date_to,
        total_taxable_value=round(total_taxable_value, 2),
        total_gst_amount=round(total_gst_amount, 2),
        total_invoice_value=round(total_invoice_value, 2),
        b2b_b2c=b2b_b2c,
        hsn_summary=hsn_summary,
        tax_slab_summary=slab_summary,
    )
