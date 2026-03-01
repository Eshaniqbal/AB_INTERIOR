"""
backend/graphql_api/resolvers/tenant_resolver.py
--------------------------------------------------
Complete Cognito-native auth — NO passwords ever stored in DynamoDB.

Registration flow:
  Step 1: register_tenant
    → cognito.sign_up()  (stores custom:tenant_id, custom:role in Cognito)
    → Creates per-org DynamoDB table
    → Seeds business metadata (NO password)
    → Returns tenant_id + user_id (no tokens yet)

  Step 2: verify_otp
    → cognito.confirm_sign_up() (validates OTP)
    → Returns success message  ← frontend redirects to /login
    (NO auto-login → NO need to touch any password)

Login:
  → cognito.initiate_auth(USER_PASSWORD_AUTH)  (Cognito validates credentials)
  → Decode IdToken (contains custom:tenant_id, custom:role)
  → Return tokens + tenant metadata

Role-based access:
  → custom:role stored IN Cognito user attributes at sign_up
  → JWT carries it on every request  →  auth middleware reads & enforces it
  → Hierarchy: SUPER_ADMIN > MANAGER > CASHIER > ACCOUNTANT
"""

import os
import uuid
import boto3
import strawberry
from typing import Optional
from datetime import datetime, timezone

from ..db import (
    ORG_PK, meta_sk, user_sk,
    put, get, registry_put, registry_get,
    create_org_table,
)
from ..types.tenant import (
    Tenant, TenantInput, AuthPayload, LoginInput,
    RegisterStepOnePayload, VerifyOtpInput,
)
from ..context import AppContext

COGNITO_CLIENT_ID    = os.environ.get("COGNITO_CLIENT_ID", "")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")
REGION               = os.environ.get("AWS_REGION", "us-east-1")

_cognito = None


def _cog():
    global _cognito
    if not _cognito:
        _cognito = boto3.client("cognito-idp", region_name=REGION)
    return _cognito


def _decode_jwt(token: str) -> dict:
    """Decode JWT payload — no verification (middleware does full verify)."""
    import json, base64
    payload = token.split(".")[1]
    payload += "=" * (4 - len(payload) % 4)
    return json.loads(base64.b64decode(payload))


def _build_tenant(tenant_id: str, email: str) -> Tenant:
    """Read org metadata from DynamoDB and build a Tenant object."""
    meta = get(tenant_id, ORG_PK, meta_sk()) or {}
    return Tenant(
        tenant_id=tenant_id,
        business_name=str(meta.get("business_name", "")),
        owner_name=str(meta.get("owner_name", "")),
        email=str(meta.get("email", email)),
        phone=str(meta.get("phone", "")),
        gstin=str(meta.get("gstin", "")),
        address=str(meta.get("address", "")),
        city=str(meta.get("city", "")),
        state=str(meta.get("state", "")),
        pincode=str(meta.get("pincode", "")),
        plan=str(meta.get("plan", "FREE")),
        created_at=str(meta.get("created_at", "")),
    )


# ─────────────────────────────────────────────────────────────
# Step 1: register_tenant
# ─────────────────────────────────────────────────────────────

def register_tenant(
    info: strawberry.types.Info[AppContext, None],
    input: TenantInput,
) -> RegisterStepOnePayload:
    """
    Initiates registration.
    - Cognito sign_up() → OTP sent to email, role stored as Cognito attribute
    - DynamoDB: stores ONLY business metadata (NO password, NO hash)
    - Registry: email → tenant mapping (NO password)
    """
    if not COGNITO_CLIENT_ID:
        raise Exception("Cognito not configured.")

    cog       = _cog()
    now       = datetime.now(timezone.utc).isoformat()
    tenant_id = f"ORG{uuid.uuid4().hex[:10].upper()}"
    user_id   = f"USR{uuid.uuid4().hex[:10].upper()}"

    # ── Cognito sign_up ──────────────────────────────────────
    # Credentials are stored and hashed by Cognito internally (SRP + bcrypt).
    # We NEVER see or touch the password again after this call.
    try:
        cog.sign_up(
            ClientId=COGNITO_CLIENT_ID,
            Username=input.email,
            Password=input.password,           # sent ONCE to Cognito; never stored by us
            UserAttributes=[
                {"Name": "email",             "Value": input.email},
                {"Name": "custom:tenant_id",  "Value": tenant_id},
                {"Name": "custom:role",       "Value": "SUPER_ADMIN"},
            ],
        )
    except cog.exceptions.UsernameExistsException:
        raise Exception("An account with this email already exists.")
    except cog.exceptions.InvalidPasswordException as e:
        raise Exception(f"Password too weak: {e}")
    except Exception as e:
        raise Exception(f"Registration failed: {e}")

    # ── Create per-org DynamoDB table ────────────────────────
    try:
        create_org_table(tenant_id)
    except Exception as e:
        raise Exception(f"Could not create org table: {e}")

    # ── Seed org metadata — NO password stored ───────────────
    put(tenant_id, {
        "PK": ORG_PK, "SK": meta_sk(),
        "tenant_id":     tenant_id,
        "business_name": input.business_name,
        "owner_name":    input.owner_name,
        "email":         input.email,
        "phone":         input.phone or "",
        "gstin":         input.gstin or "",
        "address":       input.address or "",
        "city":          input.city or "",
        "state":         input.state or "",
        "pincode":       input.pincode or "",
        "plan":          "FREE",
        "created_at":    now,
    })

    # ── Seed SUPER_ADMIN user record ─────────────────────────
    put(tenant_id, {
        "PK": ORG_PK, "SK": user_sk(user_id),
        "user_id":    user_id,
        "name":       input.owner_name,
        "email":      input.email,
        "role":       "SUPER_ADMIN",
        "is_active":  True,
        "created_at": now,
    })

    # ── Registry: email → tenant mapping ────────────────────
    # Only identity info — absolutely NO password or hash.
    registry_put({
        "PK": f"EMAIL#{input.email}", "SK": "PROFILE",
        "tenant_id": tenant_id,
        "user_id":   user_id,
        "role":      "SUPER_ADMIN",
    })

    return RegisterStepOnePayload(
        tenant_id=tenant_id,
        user_id=user_id,
        email=input.email,
        message="OTP sent to your email. Please verify to complete registration.",
    )


# ─────────────────────────────────────────────────────────────
# Step 2: verify_otp
# Confirm Cognito OTP → return success message → frontend logs in
# ─────────────────────────────────────────────────────────────

def verify_otp(
    info: strawberry.types.Info[AppContext, None],
    input: VerifyOtpInput,
) -> RegisterStepOnePayload:
    """
    Confirms the email OTP via Cognito.
    Returns a success payload — the frontend should redirect to /login.
    We do NOT auto-login here because that would require knowing the password.
    Cognito owns credentials completely.
    """
    if not COGNITO_CLIENT_ID:
        raise Exception("Cognito not configured.")

    cog = _cog()

    try:
        cog.confirm_sign_up(
            ClientId=COGNITO_CLIENT_ID,
            Username=input.email,
            ConfirmationCode=input.otp.strip(),
        )
    except cog.exceptions.CodeMismatchException:
        raise Exception("Invalid OTP. Please check your email and try again.")
    except cog.exceptions.ExpiredCodeException:
        raise Exception("OTP has expired. Click 'Resend OTP' to get a new one.")
    except cog.exceptions.NotAuthorizedException:
        # Already confirmed — treat as success
        pass
    except Exception as e:
        raise Exception(f"OTP verification failed: {e}")

    # Look up registry for tenant/user IDs
    reg = registry_get(f"EMAIL#{input.email}", "PROFILE")
    if not reg:
        raise Exception("Account not found. Please register again.")

    return RegisterStepOnePayload(
        tenant_id=reg["tenant_id"],
        user_id=reg["user_id"],
        email=input.email,
        message="EMAIL_VERIFIED",     # sentinel — frontend checks this to redirect to login
    )


# ─────────────────────────────────────────────────────────────
# Resend OTP
# ─────────────────────────────────────────────────────────────

def resend_otp(
    info: strawberry.types.Info[AppContext, None],
    email: str,
) -> str:
    cog = _cog()
    try:
        cog.resend_confirmation_code(ClientId=COGNITO_CLIENT_ID, Username=email)
        return "OTP resent successfully. Check your inbox."
    except Exception as e:
        raise Exception(f"Could not resend OTP: {e}")


# ─────────────────────────────────────────────────────────────
# Login — Cognito USER_PASSWORD_AUTH
# ─────────────────────────────────────────────────────────────

def login(
    info: strawberry.types.Info[AppContext, None],
    input: LoginInput,
) -> AuthPayload:
    """
    Full Cognito login.
    - If credentials OK and no challenge → returns tokens immediately.
    - If NEW_PASSWORD_REQUIRED → returns challenge_name + session (no tokens yet).
      Frontend must call respondToNewPasswordChallenge to complete login.
    """
    if not COGNITO_CLIENT_ID:
        raise Exception("Cognito not configured.")

    cog = _cog()

    try:
        resp = cog.initiate_auth(
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": input.email,
                "PASSWORD": input.password,
            },
            ClientId=COGNITO_CLIENT_ID,
        )
    except cog.exceptions.NotAuthorizedException:
        raise Exception("Invalid email or password.")
    except cog.exceptions.UserNotFoundException:
        raise Exception("No account found with this email.")
    except cog.exceptions.UserNotConfirmedException:
        raise Exception("Email not verified yet. Please complete OTP verification first.")
    except Exception as e:
        raise Exception(f"Login failed: {e}")

    # ── Challenge: user must set a new password (AdminCreateUser flow) ─
    if resp.get("ChallengeName") == "NEW_PASSWORD_REQUIRED":
        # Look up tenant info so frontend can show the business name etc.
        reg = registry_get(f"EMAIL#{input.email}", "PROFILE") or {}
        tenant_id = reg.get("tenant_id", "")
        placeholder_tenant = _build_tenant(tenant_id, input.email) if tenant_id else Tenant(
            tenant_id="", business_name="", owner_name="", email=input.email,
            phone="", gstin="", address="", city="", state="", pincode="",
            plan="FREE", created_at="",
        )
        return AuthPayload(
            tenant_id=tenant_id,
            user_id="",
            email=input.email,
            role="",
            access_token="",
            refresh_token="",
            expires_in=0,
            tenant=placeholder_tenant,
            challenge_name="NEW_PASSWORD_REQUIRED",
            session=resp["Session"],
        )

    tokens = resp["AuthenticationResult"]

    # ── Read identity from Cognito IdToken claims ────────────
    claims    = _decode_jwt(tokens["IdToken"])
    tenant_id = claims.get("custom:tenant_id", "")
    user_id   = claims.get("sub", "")
    role      = claims.get("custom:role", "CASHIER")

    if not tenant_id:
        reg = registry_get(f"EMAIL#{input.email}", "PROFILE")
        if not reg:
            raise Exception("Tenant not found. Please contact support.")
        tenant_id = reg["tenant_id"]
        user_id   = reg.get("user_id", user_id)
        role      = reg.get("role", "CASHIER")

    tenant = _build_tenant(tenant_id, input.email)

    return AuthPayload(
        tenant_id=tenant_id,
        user_id=user_id,
        email=input.email,
        role=role,
        access_token=tokens["IdToken"],
        refresh_token=tokens.get("RefreshToken", ""),
        expires_in=tokens.get("ExpiresIn", 3600),
        tenant=tenant,
    )


# ─────────────────────────────────────────────────────────────
# Respond to NEW_PASSWORD_REQUIRED challenge
# ─────────────────────────────────────────────────────────────

def respond_to_new_password_challenge(
    info: strawberry.types.Info[AppContext, None],
    email: str,
    session: str,
    new_password: str,
) -> AuthPayload:
    """
    Called after login returns NEW_PASSWORD_REQUIRED.
    Sets the permanent password and returns real tokens.
    """
    cog = _cog()

    try:
        resp = cog.respond_to_auth_challenge(
            ClientId=COGNITO_CLIENT_ID,
            ChallengeName="NEW_PASSWORD_REQUIRED",
            Session=session,
            ChallengeResponses={
                "USERNAME":     email,
                "NEW_PASSWORD": new_password,
            },
        )
    except cog.exceptions.InvalidPasswordException as e:
        raise Exception(f"Password doesn't meet requirements: {e}")
    except Exception as e:
        raise Exception(f"Could not set new password: {e}")

    tokens = resp["AuthenticationResult"]

    claims    = _decode_jwt(tokens["IdToken"])
    tenant_id = claims.get("custom:tenant_id", "")
    user_id   = claims.get("sub", "")
    role      = claims.get("custom:role", "CASHIER")

    if not tenant_id:
        reg = registry_get(f"EMAIL#{email}", "PROFILE") or {}
        tenant_id = reg.get("tenant_id", "")
        user_id   = reg.get("user_id", user_id)
        role      = reg.get("role", "CASHIER")

    tenant = _build_tenant(tenant_id, email)

    return AuthPayload(
        tenant_id=tenant_id,
        user_id=user_id,
        email=email,
        role=role,
        access_token=tokens["IdToken"],
        refresh_token=tokens.get("RefreshToken", ""),
        expires_in=tokens.get("ExpiresIn", 3600),
        tenant=tenant,
    )
