"""
backend/graphql_api/schema.py
--------------------------------
Root Strawberry schema — wires all types and resolvers together.
"""

import strawberry
from typing import Optional, List

# ── Types ──
from .types.product  import Product, ProductInput, ProductConnection
from .types.invoice  import Invoice, InvoiceInput, InvoiceResponse, InvoiceConnection
from .types.stock    import StockLevel, Purchase, PurchaseInput
from .types.expense  import Expense, ExpenseInput, ExpenseConnection
from .types.dashboard import DashboardSummary, ProfitReport
from .types.gstr1     import Gstr1Report
from .types.customer import (
    Customer, CustomerLedger, CustomerConnection,
    RecordPaymentInput, RecordAdvanceInput,
)
from .types.tenant   import (
    Tenant, TenantInput, AuthPayload, LoginInput, User,
    RegisterStepOnePayload, VerifyOtpInput,
)

# ── Resolvers ──
from .resolvers.product_resolver import (
    list_products, get_product, create_product, update_product, delete_product
)
from .resolvers.billing_resolver import (
    create_invoice, list_invoices, get_invoice, get_invoice_download_url
)
from .resolvers.stock_resolver import (
    get_stock_levels, get_stock_level, record_purchase
)
from .resolvers.expense_resolver import add_expense, list_expenses, delete_expense
from .resolvers.report_resolver  import get_dashboard, get_profit_report, get_gstr1_report
from .resolvers.tenant_resolver  import register_tenant, verify_otp, resend_otp, login, respond_to_new_password_challenge
from .resolvers.customer_resolver import (
    list_customers, get_customer_ledger, get_customer_by_phone,
    record_customer_payment, record_advance, delete_customer,
)
from .resolvers.settings_resolver import (
    get_tenant_profile, update_tenant_profile,
    forgot_password, confirm_forgot_password,
    UpdateTenantInput,
)
from .resolvers.user_resolver import (
    list_users, invite_user, update_user_role, toggle_user_active, remove_user,
    InviteUserInput, UpdateUserRoleInput,
)

# ── Context ──
from .context import AppContext


@strawberry.type
class Query:
    # ─── Products ───
    list_products: ProductConnection          = strawberry.field(resolver=list_products)
    get_product:   Optional[Product]          = strawberry.field(resolver=get_product)

    # ─── Billing ───
    list_invoices:              InvoiceConnection  = strawberry.field(resolver=list_invoices)
    get_invoice:                Optional[Invoice]  = strawberry.field(resolver=get_invoice)
    get_invoice_download_url:   Optional[str]      = strawberry.field(resolver=get_invoice_download_url)

    # ─── Stock ───
    get_stock_levels: List[StockLevel]   = strawberry.field(resolver=get_stock_levels)
    get_stock_level:  StockLevel         = strawberry.field(resolver=get_stock_level)

    # ─── Expenses ───
    list_expenses: ExpenseConnection = strawberry.field(resolver=list_expenses)

    # ─── Dashboard & Reports ───
    get_dashboard:     DashboardSummary = strawberry.field(resolver=get_dashboard)
    get_profit_report: ProfitReport     = strawberry.field(resolver=get_profit_report)
    get_gstr1_report:  Gstr1Report      = strawberry.field(resolver=get_gstr1_report)

    # ─── Customers / Ledger ───
    list_customers:        CustomerConnection        = strawberry.field(resolver=list_customers)
    get_customer_ledger:   Optional[CustomerLedger]  = strawberry.field(resolver=get_customer_ledger)
    get_customer_by_phone: Optional[Customer]         = strawberry.field(resolver=get_customer_by_phone)

    # ─── Settings ───
    get_tenant_profile: Optional[Tenant] = strawberry.field(resolver=get_tenant_profile)

    # ─── Team / Users ───
    list_users: List[User] = strawberry.field(resolver=list_users)


@strawberry.type
class Mutation:
    # ─── Auth ───
    register_tenant:                  RegisterStepOnePayload = strawberry.field(resolver=register_tenant)
    verify_otp:                       RegisterStepOnePayload = strawberry.field(resolver=verify_otp)
    resend_otp:                       str                    = strawberry.field(resolver=resend_otp)
    login:                            AuthPayload            = strawberry.field(resolver=login)
    respond_to_new_password_challenge: AuthPayload           = strawberry.field(resolver=respond_to_new_password_challenge)

    # ─── Products ───
    create_product: Product = strawberry.field(resolver=create_product)
    update_product: Product = strawberry.field(resolver=update_product)
    delete_product: bool    = strawberry.field(resolver=delete_product)

    # ─── Billing ───
    create_invoice: InvoiceResponse = strawberry.field(resolver=create_invoice)

    # ─── Stock / Purchases ───
    record_purchase: Purchase = strawberry.field(resolver=record_purchase)

    # ─── Expenses ───
    add_expense:    Expense = strawberry.field(resolver=add_expense)
    delete_expense: bool    = strawberry.field(resolver=delete_expense)

    # ─── Customers / Ledger ───
    record_customer_payment: Customer = strawberry.field(resolver=record_customer_payment)
    record_advance:          Customer = strawberry.field(resolver=record_advance)
    delete_customer:         bool     = strawberry.field(resolver=delete_customer)

    # ─── Settings ───
    update_tenant_profile:    Tenant = strawberry.field(resolver=update_tenant_profile)

    # ─── Auth extras ───
    forgot_password:          str = strawberry.field(resolver=forgot_password)
    confirm_forgot_password:  str = strawberry.field(resolver=confirm_forgot_password)

    # ─── Team / Users ───
    invite_user:         User = strawberry.field(resolver=invite_user)
    update_user_role:    User = strawberry.field(resolver=update_user_role)
    toggle_user_active:  User = strawberry.field(resolver=toggle_user_active)
    remove_user:         bool = strawberry.field(resolver=remove_user)


schema = strawberry.Schema(query=Query, mutation=Mutation)
