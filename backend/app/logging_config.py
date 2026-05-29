"""Logging configuration for the investment research platform."""
from __future__ import annotations

import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from types import TracebackType
from typing import TextIO


_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdContext:
    """Temporarily sets the request id visible to log records."""

    def __init__(self, request_id: str):
        self._request_id = request_id
        self._token = None

    def __enter__(self) -> None:
        self._token = _request_id_var.set(self._request_id)

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if self._token is not None:
            _request_id_var.reset(self._token)


class RequestIdFilter(logging.Filter):
    """Injects the current request id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_var.get("-")
        return True


class _TextFormatter(logging.Formatter):
    """Human-readable formatter with timestamp and level."""

    LEVEL_COLORS = {
        "DEBUG": "\033[36m",
        "INFO": "\033[32m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[35m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        timestamp = (
            datetime.fromtimestamp(record.created, tz=timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]
            + "Z"
        )
        color = self.LEVEL_COLORS.get(record.levelname, "")
        request_id = getattr(record, "request_id", "-")
        return (
            f"{timestamp} {color}{record.levelname:<8}{self.RESET} "
            f"[{record.name}] [req={request_id}] {record.getMessage()}"
        )


class _JsonFormatter(logging.Formatter):
    """JSON-lines formatter for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        import json

        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", None),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(stream: TextIO | None = None) -> None:
    """Configure root logging once for local text logs or JSON production logs."""

    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_format = os.environ.get("LOG_FORMAT", "text").lower()

    formatter: logging.Formatter
    if log_format == "json":
        formatter = _JsonFormatter()
    else:
        formatter = _TextFormatter()

    handler = logging.StreamHandler(stream or sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(RequestIdFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)

    for noisy in ("httpx", "httpcore", "yfinance", "urllib3", "charset_normalizer"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
