"""Custom startup entry point: wraps ADK's FastAPI app with auth + CORS."""
from __future__ import annotations

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware

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

# Paths that bypass API key auth (health checks, API docs)
_EXEMPT_PREFIXES = ("/health", "/metrics", "/docs", "/redoc", "/openapi.json")


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Require X-API-Key header on all non-exempt routes.

    When APP_API_KEY is not set, auth is skipped entirely (local dev mode).
    Auth is intentionally header-only: this service does not accept cookies for
    API authentication, keeping browser CSRF out of the current threat model.
    """

    async def dispatch(self, request: Request, call_next):
        if not APP_API_KEY:
            return await call_next(request)
        path = request.url.path
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)
        if request.headers.get(API_KEY_HEADER_NAME, "") != APP_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key",
            )
        return await call_next(request)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a request id to every HTTP request and response."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
        with RequestIdContext(request_id):
            response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response


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
    async def history(user_id: str) -> JSONResponse:
        db_path = get_sqlite_path_from_url()
        if db_path is None:
            logger.warning("history endpoint supports local SQLite session storage only")
            return JSONResponse({"sessions": []})
        sessions = list_research_history(db_path=db_path, user_id=user_id, limit=20)
        return JSONResponse({"sessions": sessions})

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
