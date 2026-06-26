import asyncio
import json

import pytest


class _FakeCallbackContext:
    def __init__(self, state: dict):
        self.state = state


@pytest.mark.asyncio
async def test_active_run_registry_cancels_registered_task():
    from app.run_control import ActiveRunRegistry, RunKey

    registry = ActiveRunRegistry()
    task = asyncio.create_task(asyncio.sleep(60))
    key = RunKey(app_name="app", user_id="u_1", session_id="s_1")

    registry.register(key, task)
    result = registry.cancel(key)

    assert result == {"cancelled": True}
    assert task.cancelled() or task.cancelling() > 0
    await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_run_cancellation_middleware_registers_run_sse_body():
    from app.run_control import ActiveRunRegistry, RunCancellationMiddleware, RunKey

    registry = ActiveRunRegistry()
    seen_body = b""

    async def downstream(scope, receive, send):
        nonlocal seen_body
        message = await receive()
        seen_body = message["body"]
        key = RunKey(app_name="app", user_id="u_1", session_id="s_1")
        assert registry.get(key) is asyncio.current_task()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = RunCancellationMiddleware(downstream, registry=registry)
    body = json.dumps(
        {"appName": "app", "userId": "u_1", "sessionId": "s_1"}
    ).encode()
    sent = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        sent.append(message)

    await middleware(
        {"type": "http", "method": "POST", "path": "/run_sse"},
        receive,
        send,
    )

    assert seen_body == body
    assert registry.get(RunKey("app", "u_1", "s_1")) is None
    assert sent[0]["status"] == 200


@pytest.mark.asyncio
async def test_run_cancellation_middleware_rejects_user_mismatch():
    from app.run_control import ActiveRunRegistry, RunCancellationMiddleware

    async def downstream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = RunCancellationMiddleware(downstream, registry=ActiveRunRegistry())
    body = json.dumps(
        {"appName": "app", "userId": "user_b", "sessionId": "s_1"}
    ).encode()
    sent = []

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message):
        sent.append(message)

    await middleware(
        {
            "type": "http",
            "method": "POST",
            "path": "/run_sse",
            "auth_user": {"user_id": "user_a"},
        },
        receive,
        send,
    )

    assert sent[0]["status"] == 403


def test_user_path_ownership_allows_matching_user():
    from app.auth import AuthenticatedUser, assert_user_owns_path

    assert_user_owns_path(
        "/apps/app/users/user_a/sessions/s_1",
        AuthenticatedUser(user_id="user_a", session_id="sess_1", auth_type="clerk"),
    )


def test_user_path_ownership_rejects_mismatched_user():
    from app.auth import AuthError, AuthenticatedUser, assert_user_owns_path

    with pytest.raises(AuthError) as exc:
        assert_user_owns_path(
            "/history/user_b",
            AuthenticatedUser(user_id="user_a", session_id="sess_1", auth_type="clerk"),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_api_key_middleware_skips_when_clerk_auth_is_disabled(monkeypatch):
    from app.main import ApiKeyMiddleware

    monkeypatch.setenv("CLERK_AUTH_ENABLED", "false")

    async def downstream(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = ApiKeyMiddleware(downstream)
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    await middleware(
        {"type": "http", "method": "GET", "path": "/history/dev_user", "headers": []},
        receive,
        send,
    )

    assert sent[0]["status"] == 200


@pytest.mark.asyncio
async def test_session_cleanup_loop_runs_until_cancelled():
    from app.tools.session_cleanup import run_cleanup_loop

    calls = 0
    first_call = asyncio.Event()

    def cleanup():
        nonlocal calls
        calls += 1
        first_call.set()
        return {"sessions": 0, "events": 0}

    task = asyncio.create_task(run_cleanup_loop(cleanup_func=cleanup, interval_seconds=60))
    await asyncio.wait_for(first_call.wait(), timeout=1)
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)

    assert calls == 1


def test_pipeline_callbacks_record_metrics_and_trace():
    from app.agents.custom import pipeline_end_callback, pipeline_start_callback
    from app.observability import active_trace_count, metrics_registry

    metrics_registry.reset()
    ctx = _FakeCallbackContext(state={"sources": {"src-1": {"url": "https://a.test"}}})

    pipeline_start_callback(ctx)
    assert ctx.state["_pipeline_trace_id"]
    assert active_trace_count() == 1

    pipeline_end_callback(ctx)
    output = metrics_registry.render_prometheus()

    assert "pipeline_runs_total 1.0" in output
    assert "pipeline_duration_seconds_count 1.0" in output
    assert "pipeline_sources_total 1.0" in output
    assert active_trace_count() == 0


def test_pipeline_failure_observability_records_failure_and_closes_trace():
    from app.observability import (
        active_trace_count,
        metrics_registry,
        record_pipeline_failure,
        start_pipeline_trace,
    )

    metrics_registry.reset()
    state = {
        "_pipeline_start_ts": 100.0,
        "sources": {"src-1": {"url": "https://a.test"}},
    }
    start_pipeline_trace(state)

    record_pipeline_failure(state, now=105.0)
    output = metrics_registry.render_prometheus()

    assert "pipeline_failures_total 1.0" in output
    assert "pipeline_duration_seconds_count 1.0" in output
    assert active_trace_count() == 0
