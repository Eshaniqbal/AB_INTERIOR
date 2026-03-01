"""
backend/graphql_api/main.py
-----------------------------
FastAPI application with Strawberry GraphQL router.

Local dev:   uvicorn graphql_api.main:app --reload --port 8000
Lambda:      Mangum wraps this app → handler = Mangum(app)

GraphQL playground: http://localhost:8000/graphql
Health check:       http://localhost:8000/health
"""

import os
from dotenv import load_dotenv

# Load .env.local FIRST — before any AWS clients initialize
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

import strawberry
from strawberry.fastapi import GraphQLRouter
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum

from .schema import schema
from .context import get_context

# ─── Strawberry GraphQL router ───
graphql_router = GraphQLRouter(
    schema,
    context_getter=get_context,
    graphql_ide="graphiql",   # built-in GraphiQL playground
)

# ─── FastAPI app ───
app = FastAPI(
    title="CloudHisaab API",
    description="Multi-tenant billing & inventory SaaS — GraphQL API",
    version="1.0.0",
)

# ─── CORS ────────────────────────────────────────────────────────────────────
# ALLOWED_ORIGINS env var = comma-separated list, e.g.:
#   https://cloudhisab.in,https://www.cloudhisab.in,https://app.cloudhisab.in
# Falls back to allow-all for local dev.
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ["*"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Routes ───
app.include_router(graphql_router, prefix="/graphql")


@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "service": "cloudhisaab-api"})


@app.get("/")
async def root():
    return JSONResponse({
        "message": "CloudHisaab API",
        "graphql": "/graphql",
        "health": "/health",
    })


@app.get("/debug-token")
async def debug_token(request: Request):
    """Decode the Bearer token and show all claims — useful for auth debugging."""
    from .middleware.auth import _decode_unverified
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse({"error": "No Bearer token"}, status_code=401)
    token = auth_header[7:]
    claims = _decode_unverified(token)
    return JSONResponse({
        "token_use":       claims.get("token_use"),
        "sub":             claims.get("sub"),
        "email":           claims.get("email"),
        "cognito_username": claims.get("cognito:username"),
        "username":        claims.get("username"),
        "custom_tenant_id": claims.get("custom:tenant_id"),
        "custom_role":     claims.get("custom:role"),
        "iss":             claims.get("iss"),
        "exp":             claims.get("exp"),
        "all_keys":        list(claims.keys()),
    })


# ─── Lambda handler (for AWS deployment) ───
handler = Mangum(app, lifespan="off")
