from utrequests import ratelimit


def test_window_bucket():
    assert ratelimit.window_bucket(0.0, 60) == 0
    assert ratelimit.window_bucket(59.9, 60) == 0
    assert ratelimit.window_bucket(60.0, 60) == 1


def test_evaluate_allows_under_limit():
    decision = ratelimit.evaluate(0, 2, now=10.0, window_seconds=60)
    assert decision.allowed
    assert decision.remaining == 1
    assert decision.retry_after == 0


def test_evaluate_denies_at_limit_with_retry_after():
    decision = ratelimit.evaluate(2, 2, now=10.0, window_seconds=60)
    assert not decision.allowed
    assert decision.remaining == 0
    assert decision.retry_after == 50


def test_evaluate_retry_after_never_zero():
    decision = ratelimit.evaluate(2, 2, now=59.999, window_seconds=60)
    assert not decision.allowed
    assert decision.retry_after >= 1


def test_check_counts_per_key():
    assert ratelimit.check("a", 2, 60, now=10.0).allowed
    assert ratelimit.check("a", 2, 60, now=11.0).allowed
    assert not ratelimit.check("a", 2, 60, now=12.0).allowed
    # Other keys are unaffected.
    assert ratelimit.check("b", 2, 60, now=12.0).allowed


def test_check_resets_on_new_window():
    assert ratelimit.check("a", 1, 60, now=10.0).allowed
    assert not ratelimit.check("a", 1, 60, now=20.0).allowed
    assert ratelimit.check("a", 1, 60, now=70.0).allowed


def test_check_denied_requests_do_not_consume_budget():
    assert ratelimit.check("a", 1, 60, now=10.0).allowed
    for _ in range(5):
        assert not ratelimit.check("a", 1, 60, now=11.0).allowed
    # Next window still opens normally.
    assert ratelimit.check("a", 1, 60, now=61.0).allowed


def test_parse_client_ip():
    assert ratelimit.parse_client_ip("1.2.3.4, 5.6.7.8") == "1.2.3.4"
    assert ratelimit.parse_client_ip(" 1.2.3.4 ") == "1.2.3.4"
    assert ratelimit.parse_client_ip(None, "9.9.9.9") == "9.9.9.9"
    assert ratelimit.parse_client_ip("", "") == "unknown"
    assert ratelimit.parse_client_ip(None, None) == "unknown"


def test_flooding_new_keys_does_not_reset_an_existing_counter():
    # The table used to clear() wholesale when it filled, so flooding fresh keys
    # handed any caller a way to zero everyone else's budget.
    assert ratelimit.check("victim", 1, 60, now=10.0).allowed
    assert not ratelimit.check("victim", 1, 60, now=10.0).allowed
    for i in range(ratelimit._MAX_KEYS + 100):
        ratelimit.check(f"flood-{i}", 1, 60, now=10.0)
    assert not ratelimit.check("victim", 1, 60, now=10.0).allowed


def test_stale_windows_are_pruned_so_the_table_stays_bounded():
    for i in range(ratelimit._MAX_KEYS):
        ratelimit.check(f"old-{i}", 1, 60, now=10.0)
    # A later window: the stale entries make room rather than accumulating.
    ratelimit.check("fresh", 1, 60, now=1000.0)
    assert len(ratelimit._counters) == 1
