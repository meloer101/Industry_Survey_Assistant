"""Custom startup entry point: wraps ADK's FastAPI app with auth + CORS."""
from __future__ import annotations

import logging
import os
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .logging_config import RequestIdContext, configure_logging
from .persistence import get_session_db_url, get_sqlite_path_from_url, list_research_history

load_dotenv(Path(__file__).parent / ".env")
configure_logging()

APP_API_KEY = os.environ.get("APP_API_KEY", "")
_startup_time = time.time()
logger = logging.getLogger(__name__)

# Paths that bypass API key auth (health checks, API docs)
_EXEMPT_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Require X-API-Key header on all non-exempt routes.

    When APP_API_KEY is not set, auth is skipped entirely (local dev mode).
    """

    async def dispatch(self, request: Request, call_next):
        if not APP_API_KEY:
            return await call_next(request)
        path = request.url.path
        if any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            return await call_next(request)
        if request.headers.get("X-API-Key", "") != APP_API_KEY:
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

    @fast_api_app.get("/history/{user_id}", include_in_schema=True)
    async def history(user_id: str) -> JSONResponse:
        db_path = get_sqlite_path_from_url()
        if db_path is None:
            logger.warning("history endpoint supports local SQLite session storage only")
            return JSONResponse({"sessions": []})
        sessions = list_research_history(db_path=db_path, user_id=user_id, limit=20)
        return JSONResponse({"sessions": sessions})

    return fast_api_app


app = create_app()
