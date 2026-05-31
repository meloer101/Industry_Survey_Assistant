"""Custom startup entry point: wraps ADK's FastAPI app with auth + CORS.

Middlewares are implemented as pure ASGI (not BaseHTTPMiddleware) to avoid
blocking SSE StreamingResponse — BaseHTTPMiddleware buffers the response
body in a background task which deadlocks streaming endpoints like /run_sse.
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from fastapi.responses import JSONResponse
from fastapi.responses import Response

from .logging_config import RequestIdContext, configure_logging
from .observability import metrics_registry
from .persistence import get_session_db_url, get_sqlite_path_from_url, list_research_history
from .run_control import RunCancellationMiddleware, RunKey, active_run_registry
from .tools.session_cleanup import start_session_cleanup_task, stop_session_cleanup_task

load_dotenv(Path(__file__).parent / ".env")
configure_logging()

APP_API_KEY = os.environ.get("APP_API_KEY", "")
_startup_time = time.time()
logger = logging.getLogger(__name__)
API_KEY_HEADER_NAME = "X-API-Key"
COOKIE_AUTH_SUPPORTED = False

_EXEMPT_PREFIXES = ("/health", "/metrics", "/docs", "/redoc", "/openapi.json")

Receive = Callable[[], Awaitable[dict[str, Any]]]
Send = Callable[[dict[str, Any]], Awaitable[None]]
ASGIApp = Callable[[dict[str, Any], Receive, Send], Awaitable[None]]


class ApiKeyMiddleware:
    """Pure-ASGI middleware: require X-API-Key header on non-exempt routes.

    When APP_API_KEY is not set, auth is skipped entirely (local dev mode).
    Auth is intentionally header-only: this service does not accept cookies for
    API authentication, keeping browser CSRF out of the current threat model.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Receive, send: Send) -> None:
        if scope.get("type") != "http" or not APP_API_KEY:
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        api_key = headers.get(API_KEY_HEADER_NAME.lower().encode(), b"").decode()
        if api_key != APP_API_KEY:
            response = JSONResponse(
                {"detail": "Invalid or missing API key"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


class RequestIdMiddleware:
    """Pure-ASGI middleware: assign a request id to every HTTP request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        request_id = (
            headers.get(b"x-request-id", b"").decode() or uuid.uuid4().hex[:12]
        )

        async def send_with_request_id(message: dict[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                resp_headers = list(message.get("headers", []))
                resp_headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": resp_headers}
            await send(message)

        with RequestIdContext(request_id):
            await self.app(scope, receive, send_with_request_id)


def create_app():
    from google.adk.cli.fast_api import get_fast_api_app

    allow_origins_raw = os.environ.get(
        "ALLOW_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    allow_origins = [o.strip() for o in allow_origins_raw.split(",") if o.strip()]

    fast_api_app = get_fast_api_app(
        agents_dir=str(Path(__file__).parent.parent),
        web=False,
        allow_origins=allow_origins,
        session_service_uri=get_session_db_url(),
    )

    # Auth middleware is added after CORS so that preflight OPTIONS requests
    # are handled by CORS before reaching the auth check.
    fast_api_app.add_middleware(RunCancellationMiddleware)
    fast_api_app.add_middleware(ApiKeyMiddleware)
    fast_api_app.add_middleware(RequestIdMiddleware)

    fast_api_app.router.routes = [
        route
        for route in fast_api_app.router.routes
        if getattr(route, "path", None) != "/health"
    ]

    @fast_api_app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse(
            {
                "status": "ok",
                "uptime_seconds": round(time.time() - _startup_time, 1),
            }
        )

    @fast_api_app.get("/metrics", include_in_schema=False)
    async def metrics() -> Response:
        return Response(
            content=metrics_registry.render_prometheus(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    @fast_api_app.delete(
        "/apps/{app_name}/users/{user_id}/sessions/{session_id}/run",
        include_in_schema=True,
    )
    async def cancel_run(app_name: str, user_id: str, session_id: str) -> JSONResponse:
        result = active_run_registry.cancel(
            RunKey(app_name=app_name, user_id=user_id, session_id=session_id)
        )
        return JSONResponse(result, status_code=202 if result["cancelled"] else 404)

    @fast_api_app.get("/history/{user_id}", include_in_schema=True)
    async def history(user_id: str, limit: int = 20, offset: int = 0) -> JSONResponse:
        db_path = get_sqlite_path_from_url()
        if db_path is None:
            logger.warning("history endpoint supports local SQLite session storage only")
            return JSONResponse({"sessions": [], "has_more": False})

        normalized_limit = min(max(limit, 1), 100)
        normalized_offset = max(offset, 0)
        sessions = list_research_history(
            db_path=db_path,
            user_id=user_id,
            limit=normalized_limit + 1,
            offset=normalized_offset,
        )
        return JSONResponse(
            {
                "sessions": sessions[:normalized_limit],
                "has_more": len(sessions) > normalized_limit,
            }
        )

    install_session_cleanup_lifespan(fast_api_app)

    return fast_api_app


def install_session_cleanup_lifespan(fast_api_app) -> None:
    """Wrap the existing app lifespan with session cleanup startup/shutdown."""

    existing_lifespan = fast_api_app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(app):
        async with existing_lifespan(app):
            app.state.session_cleanup_task = start_session_cleanup_task()
            try:
                yield
            finally:
                await stop_session_cleanup_task(
                    getattr(app.state, "session_cleanup_task", None)
                )

    fast_api_app.router.lifespan_context = lifespan


app = create_app()
