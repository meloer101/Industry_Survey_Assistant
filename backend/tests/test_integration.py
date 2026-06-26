"""Integration tests: real HTTP requests against the ASGI app via httpx."""
from __future__ import annotations

import httpx
import pytest

DEV_USER = "test_dev_user"


@pytest.fixture(autouse=True)
def _disable_clerk_auth(monkeypatch):
    """Disable Clerk auth so all requests resolve to the dev user."""
    monkeypatch.setenv("CLERK_AUTH_ENABLED", "false")
    monkeypatch.setenv("CLERK_DEV_USER_ID", DEV_USER)


@pytest.fixture()
def client():
    from app.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_health_endpoint(client):
    async with client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body


@pytest.mark.asyncio
async def test_metrics_endpoint(client):
    async with client:
        resp = await client.get("/metrics")
    assert resp.status_code == 200
    assert "pipeline_runs_total" in resp.text
    assert "pipeline_failures_total" in resp.text


@pytest.mark.asyncio
async def test_history_returns_empty_for_dev_user(client):
    async with client:
        resp = await client.get(f"/history/{DEV_USER}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sessions"] == []
    assert body["has_more"] is False


@pytest.mark.asyncio
async def test_history_limit_clamping(client):
    async with client:
        resp = await client.get(f"/history/{DEV_USER}?limit=999&offset=0")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_history_rejects_wrong_user(client):
    """Dev user is test_dev_user; accessing another user's history should 403."""
    async with client:
        resp = await client.get("/history/someone_else")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cancel_run_nonexistent_returns_404(client):
    async with client:
        resp = await client.delete(f"/apps/app/users/{DEV_USER}/sessions/s/run")
    assert resp.status_code == 404
    body = resp.json()
    assert body["cancelled"] is False


@pytest.mark.asyncio
async def test_exempt_paths_skip_auth(client, monkeypatch):
    """Health, metrics should be accessible even when Clerk is enabled."""
    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    from app.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/health")
        assert resp.status_code == 200

        resp = await c.get("/metrics")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_request_id_header_present(client):
    async with client:
        resp = await client.get("/health")
    assert "x-request-id" in resp.headers
    assert len(resp.headers["x-request-id"]) > 0


@pytest.mark.asyncio
async def test_api_key_allows_non_user_paths(monkeypatch):
    """With Clerk enabled, an X-API-Key request reaches non-user-scoped paths (e.g. /health)."""
    api_key = "test-secret-key"
    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("APP_API_KEY", api_key)

    from app.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/health", headers={"X-API-Key": api_key})
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_key_blocked_on_user_scoped_path(monkeypatch):
    """API keys carry no user identity and must not access user-scoped paths."""
    api_key = "test-secret-key"
    monkeypatch.setenv("CLERK_AUTH_ENABLED", "true")
    monkeypatch.setenv("APP_API_KEY", api_key)

    from app.main import create_app

    app = create_app()
    transport = httpx.ASGITransport(app=app)  # type: ignore[arg-type]
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        resp = await c.get("/history/some_user", headers={"X-API-Key": api_key})
        assert resp.status_code == 401
