"""Shared ADK callbacks for model request handling."""

from __future__ import annotations

import logging
import os
import time

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest


logger = logging.getLogger(__name__)

RATE_LIMIT_SECS = 60
RPM_QUOTA = int(os.environ.get("LLM_RPM_QUOTA", "60"))


def rate_limit_callback(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> None:
    """Apply a session-wide rolling RPM limit before model calls."""
    del llm_request

    now = time.time()
    timer_start = callback_context.state.get("timer_start")
    request_count = callback_context.state.get("request_count", 0)

    if timer_start is None:
        callback_context.state["timer_start"] = now
        callback_context.state["request_count"] = 1
        logger.debug(
            "rate_limit_callback [timestamp: %i, request_count: 1, elapsed_secs: 0]",
            now,
        )
        return

    elapsed_secs = now - float(timer_start)
    if elapsed_secs >= RATE_LIMIT_SECS:
        callback_context.state["timer_start"] = now
        callback_context.state["request_count"] = 1
        logger.debug(
            "rate_limit_callback [timestamp: %i, request_count: 1, elapsed_secs: %.2f, reset=true]",
            now,
            elapsed_secs,
        )
        return

    request_count = int(request_count) + 1
    logger.debug(
        "rate_limit_callback [timestamp: %i, request_count: %i, elapsed_secs: %.2f]",
        now,
        request_count,
        elapsed_secs,
    )

    if request_count > RPM_QUOTA:
        delay = RATE_LIMIT_SECS - elapsed_secs + 1
        if delay > 0:
            logger.debug("rate_limit_callback sleeping for %.2f seconds", delay)
            time.sleep(delay)
        callback_context.state["timer_start"] = time.time()
        callback_context.state["request_count"] = 1
        return

    callback_context.state["request_count"] = request_count
