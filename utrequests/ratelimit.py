"""Fixed-window, in-process rate limiting.

Counters are per instance and reset on cold start, an accepted weakness: the
deploy caps ``--max-instances``, so Gemini spend is bounded by
``limit x instances`` per window. lure's Firestore-backed enforcer is the
upgrade path if abuse shows up.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    remaining: int
    retry_after: int  # seconds until the window resets; 0 when allowed


def window_bucket(now: float, window_seconds: int) -> int:
    return int(now // window_seconds)


def evaluate(
    count_before: int, limit: int, now: float, window_seconds: int
) -> RateDecision:
    """``retry_after`` is floored to 1 so a 429 never says ``Retry-After: 0``."""
    bucket = window_bucket(now, window_seconds)
    window_end = (bucket + 1) * window_seconds
    retry_after = max(1, math.ceil(window_end - now))
    if count_before >= limit:
        return RateDecision(allowed=False, remaining=0, retry_after=retry_after)
    return RateDecision(
        allowed=True, remaining=limit - (count_before + 1), retry_after=0
    )


def parse_client_ip(xff: str | None, remote_addr: str | None = None) -> str:
    """Leftmost ``X-Forwarded-For`` entry, the original client.

    It is client-controllable, so per-IP limits are best effort; the hard
    backstop is ``--max-instances``.
    """
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    if remote_addr and remote_addr.strip():
        return remote_addr.strip()
    return "unknown"


# key -> (bucket, count)
_counters: dict[str, tuple[int, int]] = {}
_MAX_KEYS = 10_000


def check(
    key: str, limit: int, window_seconds: int, now: float | None = None
) -> RateDecision:
    if now is None:
        now = time.time()
    bucket = window_bucket(now, window_seconds)
    prev_bucket, count = _counters.get(key, (bucket, 0))
    if prev_bucket != bucket:
        count = 0
    decision = evaluate(count, limit, now, window_seconds)
    if decision.allowed and (key in _counters or _room_for_new_key(bucket)):
        _counters[key] = (bucket, count + 1)
    return decision


def _room_for_new_key(current_bucket: int) -> bool:
    """Prunes stale windows, but never evicts a live counter.

    Evicting would let anyone flood _MAX_KEYS fresh keys to reset everyone's
    budget. A table still full stops tracking new keys until the window turns.
    """
    if len(_counters) < _MAX_KEYS:
        return True
    for k in [k for k, (b, _) in _counters.items() if b != current_bucket]:
        del _counters[k]
    return len(_counters) < _MAX_KEYS


def clear() -> None:
    _counters.clear()
