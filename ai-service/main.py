"""
StockWise AI Microservice — FastAPI
Handles only AI/ML: demand forecasting, optimization recommendations.
The main application API is served by the Node.js Express server.
"""
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.security import verify_internal_key
from app.routers import inventory_ai, ml_forecast, ai_chat

app = FastAPI(
    title="StockWise AI Service",
    description="Demand forecasting and inventory optimization using ML models",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # Dev origins only — add the deployed frontend/server URLs before shipping to production.
    allow_origins=["http://localhost:5000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All routes require the internal shared-secret header — this service is only
# ever called by the Node server's proxy (server/src/routes/ai.proxy.js),
# which already enforces user auth/RBAC and injects the header. Never exposed
# directly to browsers.
_internal_only = [Depends(verify_internal_key)]

app.include_router(inventory_ai.router,   prefix="/api/ai", dependencies=_internal_only)
app.include_router(ml_forecast.router,    prefix="/api/ai", dependencies=_internal_only)
app.include_router(ai_chat.router,        prefix="/api/ai", dependencies=_internal_only)


@app.get("/api/ai/health")
def health():
    import os
    gemini_ok    = bool(os.getenv("GEMINI_API_KEY",    ""))
    anthropic_ok = bool(os.getenv("ANTHROPIC_API_KEY", ""))
    return {
        "status":  "ok",
        "service": "StockWise AI",
        "models":  ["random_forest", "xgboost", "lstm", "prophet"],
        "llm": {
            "gemini":    "configured" if gemini_ok    else "not configured",
            "anthropic": "configured" if anthropic_ok else "not configured",
            "fallback":  "local BI engine (always available)",
        },
        "chat_routes": [
            "POST   /api/ai/chat                    — send message (LLM + BI engine)",
            "POST   /api/ai/chat/session            — create conversation session",
            "GET    /api/ai/chat/suggestions        — role-based suggested questions",
            "GET    /api/ai/chat/insights           — proactive insights panel",
            "GET    /api/ai/chat/history/{sid}      — conversation history for session",
            "DELETE /api/ai/chat/history/{sid}      — clear conversation session",
        ],
        "ml_routes": [
            "POST /api/ai/ml/train/{sku_id}",
            "POST /api/ai/ml/train",
            "POST /api/ai/ml/forecast/{sku_id}",
            "GET  /api/ai/ml/forecast/{sku_id}/stored",
            "GET  /api/ai/ml/forecasts",
            "GET  /api/ai/ml/models",
            "GET  /api/ai/ml/models/{sku_id}",
            "GET  /api/ai/ml/compare/{sku_id}",
            "GET  /api/ai/ml/feature-importance/{sku_id}",
            "GET  /api/ai/ml/inventory",
            "GET  /api/ai/ml/inventory/{sku_id}",
            "GET  /api/ai/ml/reorder-alerts",
            "GET  /api/ai/ml/skus",
            "GET  /api/ai/ml/dataset/summary",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
