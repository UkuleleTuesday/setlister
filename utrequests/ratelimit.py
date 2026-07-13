"""Fixed-window, in-process rate limiting for the API.

The pure decision layer (``window_bucket``, ``evaluate``, ``parse_client_ip``)
is adapted from lure's ``functions/ratelimit.py``. The counter store here is a
plain module-level dict rather than Firestore: it is per-instance and resets on
every cold start, which is an accepted weakness — the deploy caps
``--max-instances``, so worst-case spend on the paid Gemini call is bounded by
``limit x instances`` per window. If real abuse ever shows up, lure's
Firestore-backed enforcer is the drop-in upgrade path.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class RateDecision:
    """Outcome of a rate-limit check."""

    allowed: bool
    remaining: int
    retry_after: int  # seconds until the window resets; 0 when allowed


def window_bucket(now: float, window_seconds: int) -> int:
    """Integer index of the fixed window containing ``now``."""
    return int(now // window_seconds)


def evaluate(
    count_before: int, limit: int, now: float, window_seconds: int
) -> RateDecision:
    """Decide whether the request that brings the window count to
    ``count_before + 1`` is allowed. Pure — no I/O.

    ``retry_after`` is the time to the end of the current window, floored to 1
    so a 429 never advertises ``Retry-After: 0``.
    """
    bucket = window_bucket(now, window_seconds)
    window_end = (bucket + 1) * window_seconds
    retry_after = max(1, math.ceil(window_end - now))
    if count_before >= limit:
        return RateDecision(allowed=False, remaining=0, retry_after=retry_after)
    return RateDecision(
        allowed=True, remaining=limit - (count_before + 1), retry_after=0
    )


def parse_client_ip(xff: str | None, remote_addr: str | None = None) -> str:
    """Best-effort client IP from an ``X-Forwarded-For`` header.

    Cloud Functions' front end appends the connecting client to XFF, so the
    original client is the leftmost entry. That hop is client-controllable, so
    this only supports best-effort per-IP limits (the hard backstop is
    ``--max-instances``). Falls back to ``remote_addr`` and finally the literal
    ``"unknown"`` so every request maps to some identifier.
    """
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if remote_addr and remote_addr.strip():
        return remote_addr.strip()
    return "unknown"


# key -> (bucket, count). Entries from past windows are replaced on the next
# hit for the same key; the dict is bounded by _MAX_KEYS as a memory backstop.
_counters: dict[str, tuple[int, int]] = {}
_MAX_KEYS = 10_000


def check(
    key: str, limit: int, window_seconds: int, now: float | None = None
) -> RateDecision:
    """Record one request for ``key`` and return the decision."""
    if now is None:
        now = time.time()
    bucket = window_bucket(now, window_seconds)
    prev_bucket, count = _counters.get(key, (bucket, 0))
    if prev_bucket != bucket:
        count = 0
    decision = evaluate(count, limit, now, window_seconds)
    if decision.allowed:
        if len(_counters) >= _MAX_KEYS and key not in _counters:
            _counters.clear()
        _counters[key] = (bucket, count + 1)
    return decision


def clear() -> None:
    """Reset all counters (test helper)."""
    _counters.clear()
