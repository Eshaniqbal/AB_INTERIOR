"""
backend/graphql_api/resolvers/customer_resolver.py
----------------------------------------------------
Customer ledger — tracks outstanding balances, payments, advances.
Each customer is keyed by phone: CUSTOMER#<phone>
Ledger entries:          CUSTLEDGER#<phone>#<timestamp>
"""

import uuid
import strawberry
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal

from ..db import ORG_PK, get_org_table, query_pk
from ..types.customer import (
    Customer, CustomerLedger, CustomerLedgerEntry,
    CustomerConnection, RecordPaymentInput, RecordAdvanceInput,
)
from ..context import AppContext


def normalise_phone(raw: str) -> str:
    """
    Strips formatting, removes leading +91 / 0, and returns the
    last 10 digits (or the full stripped number if shorter/longer).
    Examples:
        "+91-98765 43221" -> "9876543221"
        "098 76543221"    -> "9876543221"
        "98765 43221"     -> "9876543221"
    """
    import re
    digits = re.sub(r"[^\d]", "", raw)          # keep only digits
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]                       # strip country code
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]                       # strip leading 0
    return digits


def _customer_sk(phone: str) -> str:
    return f"CUSTOMER#{normalise_phone(phone)}"


def _ledger_sk(phone: str, ts: str) -> str:
    return f"CUSTLEDGER#{normalise_phone(phone)}#{ts}"


def _map_customer(item: dict) -> Customer:
    total_invoiced = float(item.get("total_invoiced", 0))
    total_paid     = float(item.get("total_paid", 0))
    advance        = float(item.get("advance", 0))
    outstanding    = round(total_invoiced - total_paid - advance, 2)
    return Customer(
        customer_id=item.get("phone", ""),
        name=item.get("customer_name", ""),
        phone=item.get("phone", ""),
        gstin=item.get("gstin", ""),
        total_invoiced=total_invoiced,
        total_paid=total_paid,
        advance=advance,
        outstanding=outstanding,
        invoice_count=int(item.get("invoice_count", 0)),
        last_invoice_date=item.get("last_invoice_date"),
    )


# ── Called from billing_resolver on every invoice ──────────────────
def upsert_customer_invoice(tid: str, phone: str, name: str,
                             gstin: str, total_amount: float,
                             amount_paid: float, date: str,
                             invoice_number: str) -> None:
    """
    Create or update the customer ledger record.
    Also writes a ledger entry for this invoice.
    """
    if not phone:
        return
    phone  = normalise_phone(phone)          # ← normalise before storage
    table  = get_org_table(tid)
    now    = datetime.now(timezone.utc).isoformat()
    try:
        # Upsert aggregate
        table.update_item(
            Key={"PK": ORG_PK, "SK": _customer_sk(phone)},
            UpdateExpression=(
                "SET #nm = if_not_exists(#nm, :n), phone = :ph, gstin = :g, "
                "last_invoice_date = :d "
                "ADD total_invoiced :amt, total_paid :pd, invoice_count :one"
            ),
            ExpressionAttributeNames={"#nm": "customer_name"},
            ExpressionAttributeValues={
                ":n":   name,
                ":ph":  phone,
                ":g":   gstin or "",
                ":d":   date,
                ":amt": Decimal(str(round(total_amount, 2))),
                ":pd":  Decimal(str(round(amount_paid, 2))),
                ":one": 1,
            },
        )
        # Write ledger entry (invoice)
        table.put_item(Item={
            "PK": ORG_PK,
            "SK": _ledger_sk(phone, now),
            "entry_id":   f"LGR{uuid.uuid4().hex[:8].upper()}",
            "phone":      phone,
            "entry_type": "INVOICE",
            "amount":     Decimal(str(round(total_amount, 2))),
            "paid_now":   Decimal(str(round(amount_paid, 2))),
            "description": f"Invoice {invoice_number}",
            "date":       date,
            "created_at": now,
        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("upsert_customer_invoice failed: %s", e)


# ── GraphQL resolvers ───────────────────────────────────────────────
def list_customers(info: strawberry.types.Info[AppContext, None],
                   search: Optional[str] = None) -> CustomerConnection:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    resp  = query_pk(tid, ORG_PK, sk_prefix="CUSTOMER#", limit=500)
    items = resp.get("Items", [])

    if search:
        q = search.lower()
        items = [i for i in items if q in i.get("customer_name", "").lower()
                 or q in i.get("phone", "").lower()]

    customers = [_map_customer(i) for i in items]
    customers.sort(key=lambda c: c.outstanding, reverse=True)
    return CustomerConnection(items=customers, total=len(customers))


def get_customer_ledger(info: strawberry.types.Info[AppContext, None],
                        phone: str) -> Optional[CustomerLedger]:
    ctx = info.context
    ctx.auth.require_auth()
    tid = ctx.auth.tenant_id

    phone  = normalise_phone(phone)           # normalise lookup key
    item   = get_org_table(tid).get_item(Key={"PK": ORG_PK, "SK": _customer_sk(phone)}).get("Item")
    if not item:
        return None

    entries_resp = query_pk(tid, ORG_PK, sk_prefix=f"CUSTLEDGER#{phone}#", limit=200)
    entries = []
    running = 0.0
    for e in sorted(entries_resp.get("Items", []), key=lambda x: x["SK"]):
        amt    = float(e.get("amount", 0))
        paid   = float(e.get("paid_now", amt))
        etype  = e.get("entry_type", "INVOICE")
        if etype == "INVOICE":
            running += amt - paid
        elif etype in ("PAYMENT", "ADVANCE"):
            running -= amt
        entries.append(CustomerLedgerEntry(
            entry_id=e.get("entry_id", ""),
            entry_type=etype,
            amount=amt,
            amount_paid=paid,            # ← how much was collected at invoice time
            balance_after=round(running, 2),
            description=e.get("description", ""),
            date=e.get("date", ""),
            created_at=e.get("created_at", ""),
        ))

    return CustomerLedger(customer=_map_customer(item), entries=list(reversed(entries)))


def record_customer_payment(info: strawberry.types.Info[AppContext, None],
                            input: RecordPaymentInput) -> Customer:
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER", "CASHIER")
    tid  = ctx.auth.tenant_id
    now  = datetime.now(timezone.utc).isoformat()
    date = now[:10]
    table = get_org_table(tid)

    phone  = normalise_phone(input.phone)     # normalise
    table.update_item(
        Key={"PK": ORG_PK, "SK": _customer_sk(phone)},
        UpdateExpression="ADD total_paid :amt",
        ExpressionAttributeValues={":amt": Decimal(str(round(input.amount, 2)))},
    )
    table.put_item(Item={
        "PK": ORG_PK, "SK": _ledger_sk(phone, now),
        "entry_id":   f"LGR{uuid.uuid4().hex[:8].upper()}",
        "phone":      phone,
        "entry_type": "PAYMENT",
        "amount":     Decimal(str(round(input.amount, 2))),
        "description": input.notes or "Payment received",
        "date":       date,
        "created_at": now,
    })
    item = table.get_item(Key={"PK": ORG_PK, "SK": _customer_sk(phone)}).get("Item", {})
    return _map_customer(item)


def delete_customer(info: strawberry.types.Info[AppContext, None],
                    phone: str) -> bool:
    """
    Hard-delete a customer record and ALL their ledger entries.
    Requires MANAGER or SUPER_ADMIN role.
    """
    import logging
    log = logging.getLogger(__name__)
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER")
    tid   = ctx.auth.tenant_id
    norm  = normalise_phone(phone)
    table = get_org_table(tid)

    log.info("delete_customer: tid=%s phone=%s norm=%s", tid, phone, norm)

    # Delete the aggregate customer item
    table.delete_item(Key={"PK": ORG_PK, "SK": _customer_sk(norm)})

    # Delete all ledger entries for this customer
    ledger_resp = query_pk(tid, ORG_PK, sk_prefix=f"CUSTLEDGER#{norm}#", limit=500)
    entries = ledger_resp.get("Items", [])
    log.info("delete_customer: removing %d ledger entries", len(entries))
    for entry in entries:
        table.delete_item(Key={"PK": entry["PK"], "SK": entry["SK"]})

    return True

def get_customer_by_phone(info: strawberry.types.Info[AppContext, None],
                          phone: str) -> Optional[Customer]:
    """Quick lookup used by the billing page to auto-fill customer name."""
    ctx = info.context
    ctx.auth.require_auth()
    tid  = ctx.auth.tenant_id
    norm = normalise_phone(phone)
    if len(norm) < 7:           # too short to be a real phone number
        return None
    item = get_org_table(tid).get_item(
        Key={"PK": ORG_PK, "SK": _customer_sk(norm)}
    ).get("Item")
    if not item:
        return None
    return _map_customer(item)


def record_advance(info: strawberry.types.Info[AppContext, None],
                   input: RecordAdvanceInput) -> Customer:
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER", "CASHIER")
    tid  = ctx.auth.tenant_id
    now  = datetime.now(timezone.utc).isoformat()
    date = now[:10]
    table = get_org_table(tid)

    phone  = normalise_phone(input.phone)     # normalise
    table.update_item(
        Key={"PK": ORG_PK, "SK": _customer_sk(phone)},
        UpdateExpression=(
            "SET #nm = if_not_exists(#nm, :n), phone = if_not_exists(phone, :ph) "
            "ADD advance :amt"
        ),
        ExpressionAttributeNames={"#nm": "customer_name"},
        ExpressionAttributeValues={
            ":n":   input.name,
            ":ph":  phone,
            ":amt": Decimal(str(round(input.amount, 2))),
        },
    )
    table.put_item(Item={
        "PK": ORG_PK, "SK": _ledger_sk(phone, now),
        "entry_id":   f"LGR{uuid.uuid4().hex[:8].upper()}",
        "phone":      phone,
        "entry_type": "ADVANCE",
        "amount":     Decimal(str(round(input.amount, 2))),
        "description": input.notes or "Advance received",
        "date":       date,
        "created_at": now,
    })
    item = table.get_item(Key={"PK": ORG_PK, "SK": _customer_sk(input.phone)}).get("Item", {})
    return _map_customer(item)
