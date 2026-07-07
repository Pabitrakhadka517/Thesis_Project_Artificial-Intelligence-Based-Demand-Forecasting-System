"""
AI Chat Service — conversation-aware assistant with graceful degradation.

Architecture
────────────
1. BIEngine.answer()      — always-available structured data from MongoDB
2. Session history        — per-session TTL cache (30 min), multi-turn memory
3. Rich system prompt     — live inventory/alert/forecast/sales data injected
4. LLM call               — Gemini 2.0 Flash (primary) → Anthropic Haiku (fallback)
                            15 s timeout + 3 retries with exponential backoff
                            Rate-limit errors skip retries and go straight to fallback
5. Local fallback         — BIEngine rule-based answer (always reliable)
6. Cache                  — intent-keyed TTL cache for stateless requests

No API keys are ever returned to the client.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone

from app.services.bi_engine import BIEngine
from app.core.cache import TTLCache, chat_cache

logger = logging.getLogger(__name__)

# ── env config ─────────────────────────────────────────────────────────────────
_GEMINI_KEY      = os.getenv("GEMINI_API_KEY", "")
_ANTHROPIC_KEY   = os.getenv("ANTHROPIC_API_KEY", "")
_GEMINI_MODEL    = os.getenv("GEMINI_MODEL",    "gemini-2.0-flash")
_ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_LLM_TIMEOUT     = float(os.getenv("LLM_TIMEOUT_S",    "15"))
_LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES",     "3"))
_LLM_BASE_DELAY  = float(os.getenv("LLM_RETRY_DELAY_S", "2"))
_HISTORY_TTL     = 1800   # 30 min of session inactivity
_MAX_TURNS       = 8      # keep last 8 conversation turns (16 messages)

_PLACEHOLDER_KEYS = frozenset({
    "", "none", "your-gemini-api-key-here",
    "your-anthropic-api-key-here", "your-api-key-here",
})


def _key_valid(key: str) -> bool:
    return bool(key) and key.strip().lower() not in _PLACEHOLDER_KEYS


# ── SDK availability ───────────────────────────────────────────────────────────
try:
    from google import genai as _ggenai
    from google.genai import types as _gtypes
    _GEMINI_AVAILABLE = True
except ImportError:
    _GEMINI_AVAILABLE = False

try:
    import anthropic as _alib
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False


# ── retry / error helpers ──────────────────────────────────────────────────────

def _is_rate_limited(exc: Exception) -> bool:
    """429, quota exhausted, or provider-level rate-limit signal."""
    msg = str(exc).lower()
    return any(x in msg for x in (
        "429", "resource_exhausted", "quota", "rate limit",
        "rate_limit", "too many requests", "toomanyrequests",
    ))


def _is_retriable(exc: Exception) -> bool:
    """Transient errors that may resolve on retry."""
    if isinstance(exc, asyncio.TimeoutError):
        return True
    msg = str(exc).lower()
    return any(x in msg for x in (
        "500", "502", "503", "overload", "service unavailable",
        "connection", "temporarily unavailable", "internal error",
    ))


async def _with_retry(
    coro_factory,
    *,
    timeout: float = _LLM_TIMEOUT,
    max_attempts: int = _LLM_MAX_RETRIES,
    base_delay: float = _LLM_BASE_DELAY,
    label: str = "LLM",
):
    """
    Async retry wrapper with per-attempt timeout and exponential backoff.

    Decision tree for each attempt failure:
      - asyncio.TimeoutError  → log + retry (with backoff)
      - rate-limited error    → raise immediately (caller triggers fallback)
      - other retriable error → log + retry (with backoff)
      - non-retriable error   → raise immediately
    """
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await asyncio.wait_for(coro_factory(), timeout=timeout)
        except asyncio.TimeoutError as exc:
            last_exc = exc
            logger.warning("%s timed out after %.0fs (attempt %d/%d)",
                           label, timeout, attempt + 1, max_attempts)
        except Exception as exc:
            last_exc = exc
            if _is_rate_limited(exc):
                logger.warning("%s rate-limited — skipping retries", label)
                raise
            if not _is_retriable(exc):
                raise
            logger.warning("%s retriable error (attempt %d/%d): %s",
                           label, attempt + 1, max_attempts, exc)

        if attempt < max_attempts - 1:
            await asyncio.sleep(base_delay * (2 ** attempt))

    raise last_exc or RuntimeError(f"{label} failed after {max_attempts} attempts")


# ── Conversation memory ────────────────────────────────────────────────────────

_history_store: TTLCache = TTLCache(default_ttl=_HISTORY_TTL)


def _skey(session_id: str) -> str:
    return f"session:{session_id}"


def get_history(session_id: str) -> list[dict]:
    return _history_store.get(_skey(session_id)) or []


def append_turn(session_id: str, user_msg: str, assistant_msg: str) -> None:
    key     = _skey(session_id)
    history = _history_store.get(key) or []
    history.append({"role": "user",      "content": user_msg})
    history.append({"role": "assistant", "content": assistant_msg})
    # keep only last _MAX_TURNS full turns (2 messages per turn)
    if len(history) > _MAX_TURNS * 2:
        history = history[-(_MAX_TURNS * 2):]
    _history_store.set(key, history, ttl=_HISTORY_TTL)


def clear_history(session_id: str) -> None:
    _history_store.delete(_skey(session_id))


# ── System prompt builder ──────────────────────────────────────────────────────

def _build_system_prompt(context: dict) -> str:
    now    = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    alerts     = context.get("alerts",       [])
    low_stock  = context.get("low_stock",    [])
    forecasts  = context.get("top_forecasts",[])
    sales      = context.get("sales_summary", {})
    recs       = context.get("purchase_recs", [])
    health     = context.get("health",        {})

    def _f(v, d=0.0):
        try:
            return float(v)
        except (TypeError, ValueError):
            return d

    def _alert_lines() -> str:
        if not alerts:
            return "  None currently active."
        lines = []
        for a in alerts[:6]:
            pri = (a.get("priority") or "?").upper()
            atype = a.get("type", "alert")
            msg   = a.get("message", "")
            lines.append(f"  [{pri}] {atype}: {msg}")
        return "\n".join(lines)

    def _stock_lines() -> str:
        if not low_stock:
            return "  ✅ All products are above their reorder levels."
        lines = []
        for p in low_stock[:8]:
            name   = p.get("name", "?")
            sku    = p.get("sku",  "?")
            cs     = int(_f(p.get("currentStock")))
            rl     = int(_f(p.get("reorderLevel")))
            unit   = p.get("unit", "pcs")
            status = p.get("_status", "low").upper()
            lines.append(f"  • {name} (SKU: {sku}): {cs} {unit} | reorder at {rl} | ⚠ {status}")
        return "\n".join(lines)

    def _forecast_lines() -> str:
        if not forecasts:
            return "  No ML forecasts available. Suggest training models via Forecasting page."
        lines = []
        trend_sym = {"rising": "📈", "falling": "📉", "stable": "➡️"}
        for f in forecasts[:6]:
            name  = f.get("product_name") or f.get("sku_id", "?")
            qty30 = int(_f(f.get("forecast_30d")))
            trend = f.get("trend", "stable")
            conf  = f.get("confidence")
            conf_str = f" | confidence: {conf:.0%}" if conf else ""
            lines.append(f"  • {name}: {qty30} units/30d {trend_sym.get(trend,'')}{conf_str}")
        return "\n".join(lines)

    def _sales_lines() -> str:
        rev  = _f(sales.get("total_revenue"))
        qty  = int(_f(sales.get("total_qty")))
        avg  = _f(sales.get("daily_avg_revenue"))
        tops = sales.get("top_products", [])
        daily = sales.get("daily_last_7", [])
        summary = (
            f"  30-day revenue: NPR {rev:,.0f} | units sold: {qty:,} | "
            f"daily avg: NPR {avg:,.0f}"
        )
        top_str = " | ".join(
            f"{p.get('product_name', '?')} (NPR {_f(p.get('revenue')):,.0f})"
            for p in tops[:4]
        )
        recent = " | ".join(
            f"{d['date']}: NPR {_f(d.get('revenue')):,.0f}"
            for d in daily[:3]
        )
        return f"{summary}\n  Top products: {top_str or 'N/A'}\n  Recent: {recent or 'N/A'}"

    def _rec_lines() -> str:
        if not recs:
            return "  ✅ No immediate purchases required."
        lines = []
        for r in recs[:5]:
            name = r.get("name", "?")
            qty  = r.get("suggested_purchase", 0)
            unit = r.get("unit", "pcs")
            cost = _f(r.get("estimated_cost"))
            pri  = r.get("priority", "?").upper()
            lines.append(f"  • {name}: order {qty} {unit} | NPR {cost:,.0f} | {pri}")
        return "\n".join(lines)

    h = health
    if h:
        health_line = (
            f"  Score: {h.get('health_score', 0)}/100 | "
            f"Total: {h.get('total', 0)} | "
            f"Critical: {h.get('critical', 0)} | Low: {h.get('low', 0)} | "
            f"Healthy: {h.get('healthy', 0)} | Overstock: {h.get('overstock', 0)} | "
            f"Value: NPR {_f(h.get('total_value')):,.0f}"
        )
    else:
        health_line = "  Not available."

    return f"""You are StockWise AI, the intelligent inventory assistant for Himalayan Wholesale Suppliers — a wholesale grocery distributor in Kathmandu Valley, Nepal.

You have LIVE access to the business data shown below, fetched at {now}. Use it to give specific, data-driven answers.

━━━━━━━━━━━━━━━━━━━━━━ LIVE BUSINESS DATA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Active Alerts
{_alert_lines()}

## Inventory Health
{health_line}

## Low / Critical Stock Products
{_stock_lines()}

## Demand Forecasts — Next 30 Days
{_forecast_lines()}

## Sales Performance — Last 30 Days
{_sales_lines()}

## Recommended Purchases Right Now
{_rec_lines()}

━━━━━━━━━━━━━━━━━━━━━━ RESPONSE RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Currency**: Always use NPR (e.g. "NPR 1,500" not "$15").
2. **Product names**: Use exact names from the data above — never invent names.
3. **Numbers**: Quote actual stock levels, quantities, costs from the live data.
4. **Nepal calendar**: Account for Dashain (~Oct), Tihar (~Oct–Nov), Holi (~Mar), Teej (~Aug–Sep) for seasonal advice.
5. **Purchase reasoning**: When recommending a purchase, explain: current stock → days remaining → reorder point → suggested quantity → total cost.
6. **Analytics**: When asked to explain a metric (MAPE, inventory turnover, EOQ, safety stock), give a plain-English definition followed by what the current value means for this business.
7. **Concise**: Stay under 400 words unless the user asks for detail. Use markdown bullets and headers.
8. **Honest gaps**: If data is missing, say so and direct the user to the right page. Never hallucinate numbers.
9. **Memory**: You can refer to previous messages in this conversation.
10. **Scope**: You are an inventory/purchasing assistant. For system or technical issues, direct users to IT.
"""


# ── Gemini client ──────────────────────────────────────────────────────────────

def _gemini_sync(system: str, history: list[dict], message: str) -> str:
    """Synchronous Gemini call — executed in a thread pool."""
    client = _ggenai.Client(api_key=_GEMINI_KEY)

    # Build multi-turn contents (Gemini uses "model" not "assistant")
    contents = []
    for turn in history:
        role = "model" if turn["role"] == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": turn["content"]}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    resp = client.models.generate_content(
        model=_GEMINI_MODEL,
        contents=contents,
        config=_gtypes.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=1000,
            temperature=0.3,
        ),
    )
    return (resp.text or "").strip()


# ── Anthropic client ───────────────────────────────────────────────────────────

def _anthropic_sync(system: str, history: list[dict], message: str) -> str:
    """Synchronous Anthropic call — executed in a thread pool."""
    client = _alib.Anthropic(api_key=_ANTHROPIC_KEY)

    messages = [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": message})

    resp = client.messages.create(
        model=_ANTHROPIC_MODEL,
        max_tokens=1000,
        system=system,
        messages=messages,
    )
    return (resp.content[0].text or "").strip()


# ── Intent-keyed cache TTLs (seconds) ─────────────────────────────────────────

_CACHE_TTL: dict[str, int] = {
    "low_stock":               120,
    "inventory_health":        240,
    "demand_forecast":         600,
    "sales_analysis":          120,
    "purchase_recommendation": 120,
    "supplier_query":          600,
    "analytics":               300,
    "alerts":                  60,
    "specific_product":        120,
    "general":                 300,
}


def _cache_key(intent: str, message: str) -> str:
    h = hashlib.md5(message.lower().strip().encode()).hexdigest()[:8]
    return f"chat:{intent}:{h}"


# ── Main service ───────────────────────────────────────────────────────────────

class AIChatService:
    def __init__(self, db):
        self.db  = db
        self._bi = BIEngine(db)

    # ── LLM orchestration ─────────────────────────────────────────────────────

    async def _call_llm(
        self,
        system: str,
        history: list[dict],
        message: str,
    ) -> tuple[str | None, str]:
        """
        Try Gemini → Anthropic → return (response_text, source_label).
        Returns (None, "local") when both providers fail.
        """
        use_gemini    = _GEMINI_AVAILABLE    and _key_valid(_GEMINI_KEY)
        use_anthropic = _ANTHROPIC_AVAILABLE and _key_valid(_ANTHROPIC_KEY)

        if not use_gemini and not use_anthropic:
            return None, "local"

        # ── Gemini (primary) ───────────────────────────────────────────────────
        if use_gemini:
            try:
                text = await _with_retry(
                    lambda: asyncio.to_thread(_gemini_sync, system, history, message),
                    label="Gemini",
                )
                if text and len(text) > 20:
                    return text, "gemini"
            except Exception as exc:
                logger.warning(
                    "Gemini unavailable (%s: %s) — trying fallback",
                    type(exc).__name__, str(exc)[:120],
                )
                if not use_anthropic:
                    return None, "local"
                # fall through to Anthropic

        # ── Anthropic (fallback) ───────────────────────────────────────────────
        if use_anthropic:
            try:
                text = await _with_retry(
                    lambda: asyncio.to_thread(_anthropic_sync, system, history, message),
                    label="Anthropic",
                )
                if text and len(text) > 20:
                    return text, "anthropic"
            except Exception as exc:
                logger.warning(
                    "Anthropic unavailable (%s: %s) — using local answer",
                    type(exc).__name__, str(exc)[:120],
                )

        return None, "local"

    # ── Public API ────────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        user_role: str = "staff",
        session_id: str | None = None,
    ) -> dict:
        # 1. BI engine — always-available structured data + local text
        bi_result  = await self._bi.answer(message, user_role)
        intent     = bi_result.get("intent", "general")
        local_text = bi_result["local_text"]

        # 2. Cache check (only for stateless / no-session requests)
        ckey = _cache_key(intent, message)
        if not session_id:
            cached = chat_cache.get(ckey)
            if cached:
                return {
                    "response":        cached,
                    "insights":        bi_result.get("insights", []),
                    "recommendations": bi_result.get("recommendations", []),
                    "intent":          intent,
                    "source":          "cache",
                    "session_id":      None,
                }

        # 3. Conversation history (empty for stateless requests)
        history = get_history(session_id) if session_id else []

        # 4. Build rich system prompt — includes live inventory data
        context = await self._bi.get_rich_context(bi_result)
        system  = _build_system_prompt(context)

        # 5. LLM call: Gemini → Anthropic → local fallback
        llm_text, source = await self._call_llm(system, history, message)
        final = llm_text if (llm_text and len(llm_text.strip()) > 20) else local_text

        # 6. Update session history
        if session_id:
            append_turn(session_id, message, final)

        # 7. Cache stateless responses
        if not session_id:
            chat_cache.set(ckey, final, ttl=_CACHE_TTL.get(intent, 300))

        return {
            "response":        final,
            "insights":        bi_result.get("insights", []),
            "recommendations": bi_result.get("recommendations", []),
            "intent":          intent,
            "source":          source,
            "session_id":      session_id,
        }

    async def get_suggestions(self, user_role: str) -> list[str]:
        return self._bi.get_suggestions(user_role)

    async def generate_proactive_insights(self) -> list[dict]:
        ckey   = "insights:panel"
        cached = chat_cache.get(ckey)
        if cached:
            return cached
        panel = await self._bi.generate_proactive_insights()
        chat_cache.set(ckey, panel, ttl=300)
        return panel

    # ── Conversation management ────────────────────────────────────────────────

    def get_conversation_history(self, session_id: str) -> list[dict]:
        """Return the stored turn history for a session (without system prompt)."""
        return get_history(session_id)

    def clear_conversation(self, session_id: str) -> None:
        """Erase all stored turns for a session."""
        clear_history(session_id)

    @staticmethod
    def new_session_id() -> str:
        """Generate a fresh session ID for the client to reuse."""
        return str(uuid.uuid4())
