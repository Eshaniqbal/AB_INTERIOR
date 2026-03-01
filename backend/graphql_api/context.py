"""
backend/graphql_api/context.py
--------------------------------
Strawberry GraphQL context — carries auth info into every resolver.

Token flow:
- Frontend stores Cognito IdToken as "access_token"
- IdToken contains custom:tenant_id, custom:role, email, sub
- If IdToken verify fails, falls back to unverified decode
- If custom:tenant_id still missing, does registry fallback via email
"""

from typing import Optional
from fastapi import Request
from strawberry.fastapi import BaseContext
from .middleware.auth import verify_token, AuthClaims


class AppContext(BaseContext):
    """Must inherit BaseContext for Strawberry FastAPI integration."""

    def __init__(self, auth: Optional[AuthClaims] = None):
        super().__init__()
        self.auth = auth or AuthClaims({})


async def get_context(request: Request) -> AppContext:
    """
    FastAPI dependency injected as Strawberry context_getter.
    Extracts Bearer token → verifies → creates AppContext.
    If custom:tenant_id is missing from JWT claims, does registry fallback.
    """
    auth_header = request.headers.get("Authorization", "")
    claims: dict = {}

    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            claims = await verify_token(token)
        except Exception:
            pass  # unauthenticated — resolvers will raise if auth required

    auth = AuthClaims(claims)

    # Fallback: if JWT decoded but tenant_id is missing (e.g. AccessToken sent
    # instead of IdToken), look up registry by email
    if auth.user_id and not auth.tenant_id:
        email = auth.email or auth.username
        if email:
            try:
                from .db import registry_get
                reg = registry_get(f"EMAIL#{email}", "PROFILE")
                if reg:
                    auth.tenant_id = reg.get("tenant_id", "")
                    auth.role      = reg.get("role", "CASHIER") or "CASHIER"
            except Exception:
                pass

    return AppContext(auth=auth)
