"""
Internal-service authentication.

ai-service is only meant to be called by the Node server, never directly by a
browser. It has no user auth of its own — the Node server already enforces
JWT + RBAC before proxying (see server/src/routes/ai.proxy.js) and forwards
X-User-Id/X-User-Role for context. This guard just makes sure requests
actually come from that trusted proxy and not directly off the network,
since main.py binds 0.0.0.0.
"""
import hmac
import os

from fastapi import Header, HTTPException


def verify_internal_key(x_internal_api_key: str | None = Header(default=None, alias="X-Internal-Api-Key")) -> None:
    expected = os.getenv("AI_SERVICE_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=500, detail="AI_SERVICE_API_KEY is not configured on the server.")
    if not x_internal_api_key or not hmac.compare_digest(x_internal_api_key, expected):
        raise HTTPException(status_code=401, detail="Missing or invalid internal API key.")
