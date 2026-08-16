"""
AI Chat Router

POST   /api/ai/chat                    — send a message, get LLM-powered business answer
GET    /api/ai/chat/suggestions        — role-based suggested questions
GET    /api/ai/chat/insights           — proactive AI insights (page-load panel)
GET    /api/ai/chat/history/{sid}      — retrieve conversation turns for a session
DELETE /api/ai/chat/history/{sid}      — clear all turns for a session
POST   /api/ai/chat/session            — create a new session ID (client helper)
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Header, HTTPException, Path
from pydantic import BaseModel, Field

# Sessions are UUIDs by default (see new_session_id()), but the docstrings below
# explicitly allow any client-generated string — so this only bounds length
# against abuse, it doesn't restrict the character set.
SessionId = Annotated[str, Path(min_length=1, max_length=128)]

from app.database import get_db
from app.services.ai_chat_service import AIChatService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["ai-chat"])


# ── request/response models ────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message:    str            = Field(..., min_length=1, max_length=2000)
    user_role:  str            = Field(default="staff")
    session_id: Optional[str]  = Field(
        default=None,
        max_length=128,
        description=(
            "Opaque session token for multi-turn conversation memory. "
            "Omit for stateless (cached) responses. "
            "Create via POST /api/ai/chat/session or generate client-side (UUID)."
        ),
    )


class SessionResponse(BaseModel):
    session_id: str


# ── endpoints ──────────────────────────────────────────────────────────────────

@router.post("", summary="Send a message to the AI assistant")
async def chat(
    body:         ChatRequest,
    x_user_role:  str | None = Header(default=None, alias="X-User-Role"),
):
    """
    Context-aware AI chat endpoint.

    Flow:
      1. BIEngine fetches live inventory / forecast / sales / alerts from MongoDB
      2. Rich system prompt built from live data
      3. LLM called (Gemini → Anthropic) with conversation history (if session_id provided)
      4. If both LLMs fail → graceful fallback to rule-based local answer
      5. Response + structured insights/recommendations returned

    Pass `session_id` for multi-turn conversation memory.
    Omit for single-turn stateless requests (faster, uses cache).
    """
    role = x_user_role or body.user_role or "staff"
    db   = get_db()
    svc  = AIChatService(db)

    try:
        result = await svc.chat(
            body.message,
            user_role=role,
            session_id=body.session_id,
        )
        return {"success": True, "data": result}
    except Exception:
        logger.exception("Chat request failed")
        raise HTTPException(status_code=500, detail="Chat failed. Please try again.")


@router.get("/suggestions", summary="Role-based suggested questions")
async def get_suggestions(
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
    role:        str         = "staff",
):
    """Return role-appropriate quick-action questions for the assistant interface."""
    effective_role = x_user_role or role
    db  = get_db()
    svc = AIChatService(db)
    suggestions = await svc.get_suggestions(effective_role)
    return {"success": True, "data": suggestions}


@router.get("/insights", summary="Proactive AI insights panel")
async def get_insights():
    """
    Generates a proactive insight panel without any user question.
    Useful for dashboard widgets and page-load alerts.
    Cached for 5 minutes.
    """
    db  = get_db()
    svc = AIChatService(db)
    try:
        insights = await svc.generate_proactive_insights()
        return {"success": True, "data": insights}
    except Exception:
        logger.exception("Insights generation failed")
        raise HTTPException(status_code=500, detail="Insights generation failed. Please try again.")


@router.post("/session", summary="Create a new conversation session ID", response_model=SessionResponse)
async def create_session():
    """
    Returns a fresh UUID to use as `session_id` in subsequent chat requests.
    Sessions expire after 30 minutes of inactivity.

    Alternatively, the client can generate its own UUID — the server treats any
    string as a valid session key.
    """
    return SessionResponse(session_id=AIChatService.new_session_id())


@router.get("/history/{session_id}", summary="Retrieve conversation history for a session")
async def get_history(session_id: SessionId):
    """
    Returns all stored turns for the given session as a list of
    {role: "user"|"assistant", content: "..."} messages.

    Returns an empty list if the session has expired or never existed.
    """
    db  = get_db()
    svc = AIChatService(db)
    history = svc.get_conversation_history(session_id)
    return {
        "success":    True,
        "session_id": session_id,
        "turns":      len(history) // 2,
        "messages":   history,
    }


@router.delete("/history/{session_id}", summary="Clear conversation history for a session")
async def clear_history(session_id: SessionId):
    """
    Deletes all stored turns for the given session.
    The session ID itself becomes reusable (starts a fresh conversation).
    """
    db  = get_db()
    svc = AIChatService(db)
    svc.clear_conversation(session_id)
    return {
        "success":    True,
        "session_id": session_id,
        "message":    "Conversation history cleared.",
    }
