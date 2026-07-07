"""
Thread-safe in-memory TTL cache.
Used to avoid repeated MongoDB queries and unnecessary LLM calls.
"""
from __future__ import annotations

import time
from threading import Lock


class TTLCache:
    def __init__(self, default_ttl: int = 300):
        self._store: dict = {}
        self._expiry: dict = {}
        self._lock = Lock()
        self.default_ttl = default_ttl

    def get(self, key: str):
        with self._lock:
            if key in self._store:
                if time.monotonic() < self._expiry[key]:
                    return self._store[key]
                del self._store[key]
                del self._expiry[key]
        return None

    def set(self, key: str, value, ttl: int | None = None) -> None:
        with self._lock:
            self._store[key] = value
            self._expiry[key] = time.monotonic() + (ttl or self.default_ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)
            self._expiry.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._expiry.clear()

    def purge_expired(self) -> int:
        now = time.monotonic()
        with self._lock:
            expired = [k for k, exp in self._expiry.items() if now >= exp]
            for k in expired:
                del self._store[k]
                del self._expiry[k]
        return len(expired)


# Singleton — imported by all services
chat_cache = TTLCache(default_ttl=300)   # 5 min default
