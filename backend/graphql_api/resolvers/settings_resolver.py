"""
backend/graphql_api/resolvers/settings_resolver.py
---------------------------------------------------
Tenant settings: read current business profile + update it.
Also: forgot-password and confirm-forgot-password via Cognito.
"""

import os
import boto3
import strawberry
from typing import Optional
from datetime import datetime, timezone

from ..db import ORG_PK, meta_sk, put, get, get_org_table
from ..types.tenant import Tenant
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


# ─────────────────────────────────────────────────────────────
# Input types (defined inline for simplicity)
# ─────────────────────────────────────────────────────────────

@strawberry.input
class UpdateTenantInput:
    business_name: Optional[str] = None
    owner_name:    Optional[str] = None
    phone:         Optional[str] = None
    gstin:         Optional[str] = None
    address:       Optional[str] = None
    city:          Optional[str] = None
    state:         Optional[str] = None
    pincode:       Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Query: get current tenant profile
# ─────────────────────────────────────────────────────────────

def get_tenant_profile(info: strawberry.types.Info[AppContext, None]) -> Optional[Tenant]:
    ctx = info.context
    ctx.auth.require_auth()
    tid  = ctx.auth.tenant_id
    meta = get(tid, ORG_PK, meta_sk()) or {}

    return Tenant(
        tenant_id=tid,
        business_name=str(meta.get("business_name", "")),
        owner_name=str(meta.get("owner_name", "")),
        email=str(meta.get("email", "")),
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
# Mutation: update tenant profile
# ─────────────────────────────────────────────────────────────

def update_tenant_profile(
    info: strawberry.types.Info[AppContext, None],
    input: UpdateTenantInput,
) -> Tenant:
    ctx = info.context
    ctx.auth.require_roles("SUPER_ADMIN", "MANAGER")
    tid   = ctx.auth.tenant_id
    table = get_org_table(tid)
    now   = datetime.now(timezone.utc).isoformat()

    # Build update expression — use ExpressionAttributeNames for ALL fields
    # because several (state, name, address) are DynamoDB reserved keywords.
    set_parts  = ["#ua = :ua"]
    values     = {":ua": now}
    attr_names = {"#ua": "updated_at"}

    field_map = {
        "business_name": ("#bn", ":bn", input.business_name),
        "owner_name":    ("#on", ":on", input.owner_name),
        "phone":         ("#ph", ":ph", input.phone),
        "gstin":         ("#gs", ":gs", input.gstin),
        "address":       ("#ad", ":ad", input.address),
        "city":          ("#ci", ":ci", input.city),
        "state":         ("#st", ":st", input.state),
        "pincode":       ("#pc", ":pc", input.pincode),
    }
    for field, (name_alias, val_alias, val) in field_map.items():
        if val is not None:
            set_parts.append(f"{name_alias} = {val_alias}")
            attr_names[name_alias] = field
            values[val_alias]      = val

    table.update_item(
        Key={"PK": ORG_PK, "SK": meta_sk()},
        UpdateExpression="SET " + ", ".join(set_parts),
        ExpressionAttributeNames=attr_names,
        ExpressionAttributeValues=values,
    )

    # Return refreshed profile
    meta = get(tid, ORG_PK, meta_sk()) or {}
    return Tenant(
        tenant_id=tid,
        business_name=str(meta.get("business_name", "")),
        owner_name=str(meta.get("owner_name", "")),
        email=str(meta.get("email", "")),
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
# Forgot Password — Step 1: send code
# ─────────────────────────────────────────────────────────────

def forgot_password(
    info: strawberry.types.Info[AppContext, None],
    email: str,
) -> str:
    """Triggers Cognito to send a password-reset code to the user's email."""
    try:
        _cog().forgot_password(ClientId=COGNITO_CLIENT_ID, Username=email)
        return "Password reset code sent to your email."
    except _cog().exceptions.UserNotFoundException:
        # Don't reveal whether the email exists — silently succeed
        return "If an account with this email exists, a reset code has been sent."
    except Exception as e:
        raise Exception(f"Could not send reset code: {e}")


# ─────────────────────────────────────────────────────────────
# Forgot Password — Step 2: confirm new password
# ─────────────────────────────────────────────────────────────

def confirm_forgot_password(
    info: strawberry.types.Info[AppContext, None],
    email: str,
    code: str,
    new_password: str,
) -> str:
    """Confirms the password-reset code and sets a new password."""
    try:
        _cog().confirm_forgot_password(
            ClientId=COGNITO_CLIENT_ID,
            Username=email,
            ConfirmationCode=code.strip(),
            Password=new_password,
        )
        return "Password reset successful. You can now sign in with your new password."
    except _cog().exceptions.CodeMismatchException:
        raise Exception("Invalid or expired reset code.")
    except _cog().exceptions.InvalidPasswordException as e:
        raise Exception(f"Password doesn't meet requirements: {e}")
    except Exception as e:
        raise Exception(f"Password reset failed: {e}")
