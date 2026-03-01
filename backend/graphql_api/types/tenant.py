"""
backend/graphql_api/types/tenant.py
-------------------------------------
Strawberry types for Tenant and User entities.
"""

import strawberry
from typing import Optional


@strawberry.input
class TenantInput:
    business_name: str
    owner_name: str
    email: str
    phone: str
    gstin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    password: str


@strawberry.type
class Tenant:
    tenant_id: str
    business_name: str
    owner_name: str
    email: str
    phone: str
    gstin: str
    address: str
    city: str
    state: str
    pincode: str
    plan: str           # FREE | BASIC | PRO | ENTERPRISE
    created_at: str


@strawberry.type
class AuthPayload:
    tenant_id:    str
    user_id:      str
    email:        str
    role:         str
    access_token: str
    refresh_token: str
    expires_in:   int
    tenant:       Tenant
    # Populated when Cognito returns a challenge instead of tokens
    challenge_name: Optional[str] = None   # e.g. "NEW_PASSWORD_REQUIRED"
    session:        Optional[str] = None   # opaque session token to pass back


@strawberry.input
class LoginInput:
    email: str
    password: str


@strawberry.input
class UserInput:
    name: str
    email: str
    password: str
    role: str    # MANAGER | CASHIER | ACCOUNTANT


@strawberry.type
class User:
    user_id: str
    name: str
    email: str
    role: str
    is_active: bool
    created_at: str


@strawberry.type
class RegisterStepOnePayload:
    """Returned after step 1 of registration (OTP sent, not yet confirmed)."""
    tenant_id: str
    user_id: str
    email: str
    message: str


@strawberry.input
class VerifyOtpInput:
    email: str
    otp: str
