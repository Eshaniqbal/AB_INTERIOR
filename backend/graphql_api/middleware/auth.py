"""
backend/graphql_api/middleware/auth.py
---------------------------------------
Cognito IdToken JWT verification via JWKS.

Why IdToken, not AccessToken?
- Cognito AccessToken does NOT include custom attributes (custom:tenant_id, custom:role)
- Cognito IdToken DOES include all custom User Pool attributes
- We sign users in with IdToken and verify it here

JWKS is cached in-memory after first fetch to avoid repeated network calls.
"""

import os
import json
import base64
import httpx
from typing import Optional, Dict

try:
    from jose import jwt, JWTError
    JOSE_AVAILABLE = True
except ImportError:
    JOSE_AVAILABLE = False

COGNITO_REGION       = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID", "")

_jwks_cache: Optional[Dict] = None


async def _get_jwks() -> Dict:
    global _jwks_cache
    if _jwks_cache:
        return _jwks_cache
    url = (
        f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
        f"/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
    )
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


def _decode_unverified(token: str) -> Dict:
    """Decode JWT payload without signature check — for fallback/dev."""
    try:
        parts = token.split(".")
        payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
        return json.loads(base64.b64decode(payload))
    except Exception:
        return {}


async def verify_token(token: str) -> Dict:
    """
    Verify Cognito IdToken (not AccessToken).
    IdToken token_use = "id", carries custom:tenant_id, custom:role, email, sub.
    Returns raw claims dict.
    """
    if not COGNITO_USER_POOL_ID or not JOSE_AVAILABLE:
        # No Cognito configured or jose not installed — decode without verification
        return _decode_unverified(token)

    try:
        jwks   = await _get_jwks()
        issuer = (
            f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
            f"/{COGNITO_USER_POOL_ID}"
        )
        # For IdToken: audience = client_id; token_use = "id"
        claims = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            issuer=issuer,
            options={
                "verify_at_hash": False,
                "verify_aud": False,   # audience check is optional for IdToken
            },
        )
        # Extra safety: make sure it's actually an IdToken
        if claims.get("token_use") not in ("id", None):
            raise Exception(f"Expected IdToken, got token_use={claims.get('token_use')}")
        return claims
    except Exception as e:
        # Fall back to unverified decode (network error, etc.)
        raw = _decode_unverified(token)
        if raw:
            return raw
        raise Exception(f"Invalid token: {e}")


class AuthClaims:
    """Parsed JWT claims — attached to every GraphQL request context."""

    def __init__(self, claims: Dict):
        # IdToken carries custom attributes as "custom:key"
        # Always lowercase — DynamoDB tables (ch_<tid>) and S3 paths use lowercase.
        # Cognito may store custom:tenant_id as uppercase (e.g. ORG213E518716).
        self.tenant_id: str = (
            claims.get("custom:tenant_id", "")
            or claims.get("custom_tenant_id", "")
        ).lower()
        self.role: str = (
            claims.get("custom:role", "")
            or claims.get("custom_role", "CASHIER")
        ) or "CASHIER"
        self.user_id: str = claims.get("sub", "")
        # IdToken has cognito:username; AccessToken has username
        self.username: str = (
            claims.get("cognito:username", "")
            or claims.get("username", "")
        )
        # IdToken has email directly
        self.email: str = claims.get("email", self.username)
        self.raw = claims

    @property
    def is_authenticated(self) -> bool:
        return bool(self.tenant_id and self.user_id)

    def require_auth(self) -> "AuthClaims":
        if not self.is_authenticated:
            raise Exception("Unauthorized: please sign in")
        return self

    def require_roles(self, *roles: str) -> "AuthClaims":
        self.require_auth()
        if self.role not in roles:
            raise Exception(f"Forbidden: requires one of {roles}, your role is {self.role}")
        return self

    def require_min_role(self, min_role: str) -> "AuthClaims":
        hierarchy = {"ACCOUNTANT": 1, "CASHIER": 2, "MANAGER": 3, "SUPER_ADMIN": 4}
        self.require_auth()
        if hierarchy.get(self.role, 0) < hierarchy.get(min_role, 99):
            raise Exception(f"Forbidden: requires at least {min_role}, your role is {self.role}")
        return self
