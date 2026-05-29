"""Shared ADK callbacks for model request handling."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest
from google.genai import types as genai_types


logger = logging.getLogger(__name__)

RATE_LIMIT_SECS = 60
RPM_QUOTA = int(os.environ.get("LLM_RPM_QUOTA", "60"))


async def rate_limit_callback(
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
            await asyncio.sleep(delay)
        callback_context.state["timer_start"] = time.time()
        callback_context.state["request_count"] = 1
        return

    callback_context.state["request_count"] = request_count


def parse_evaluation_callback(callback_context: CallbackContext) -> None:
    """Parse research_evaluator JSON text output into session state."""

    raw = callback_context.state.get("research_evaluation", "")
    if isinstance(raw, dict):
        return
    if not isinstance(raw, str):
        callback_context.state["research_evaluation"] = {
            "grade": "fail",
            "comment": str(raw),
            "follow_up_queries": None,
        }
        return

    clean = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        raw.strip(),
        flags=re.MULTILINE,
    ).strip()
    match = re.search(r"\{[\s\S]+\}", clean)
    if match:
        clean = match.group(0)

    try:
        parsed = json.loads(clean)
        callback_context.state["research_evaluation"] = parsed
    except json.JSONDecodeError:
        logger.warning(
            "[parse_evaluation_callback] JSON parse failed, defaulting to fail. Raw: %.300s",
            raw,
        )
        callback_context.state["research_evaluation"] = {
            "grade": "fail",
            "comment": raw,
            "follow_up_queries": None,
        }


def citation_replacement_callback(
    callback_context: CallbackContext,
) -> genai_types.Content:
    """Replace <cite source="src-N"/> tags with markdown links from state."""

    final_report = callback_context.state.get("final_cited_report", "")
    sources = callback_context.state.get("sources", {})

    def tag_replacer(match: re.Match) -> str:
        short_id = match.group(1)
        if not (source_info := sources.get(short_id)):
            logger.warning("Invalid citation tag removed: %s", match.group(0))
            return ""
        display_text = source_info.get("title", source_info.get("domain", short_id))
        return f" [{display_text}]({source_info['url']})"

    processed_report = re.sub(
        r'<cite\s+source\s*=\s*["\']?\s*(src-\d+)\s*["\']?\s*/>',
        tag_replacer,
        final_report,
    )
    processed_report = re.sub(r"\s+([.,;:])", r"\1", processed_report)
    callback_context.state["final_report_with_citations"] = processed_report
    return genai_types.Content(parts=[genai_types.Part(text=processed_report)])
