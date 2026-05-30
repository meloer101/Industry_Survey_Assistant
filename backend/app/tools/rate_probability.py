from __future__ import annotations

import concurrent.futures
from datetime import datetime
import csv
import io
import json
import logging
import os
import re
from typing import Any

from google.adk.tools import ToolContext
import requests
from tavily import TavilyClient


FRED_FEDFUNDS_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS"
REQUEST_TIMEOUT = 20
FRED_TIMEOUT = 20
logger = logging.getLogger(__name__)


def _target_range_from_effective_rate(rate: float) -> str:
    midpoint = round(rate * 4) / 4
    lower = max(0.0, midpoint - 0.125)
    upper = midpoint + 0.125
    return f"{lower:.2f}%-{upper:.2f}%"


def _latest_fedfunds() -> tuple[str, float] | None:
    response = requests.get(FRED_FEDFUNDS_CSV_URL, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(response.text)))
    for row in reversed(rows):
        value = row.get("FEDFUNDS")
        if value and value != ".":
            return row.get("observation_date", ""), float(value)
    return None


def _latest_fedfunds_with_timeout() -> tuple[str, float] | None:
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_latest_fedfunds)
        return future.result(timeout=FRED_TIMEOUT)
    except concurrent.futures.TimeoutError as exc:
        future.cancel()
        raise TimeoutError("FRED FEDFUNDS fetch timed out") from exc
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


def _classify_probability_context(context: str) -> str | None:
    normalized = context.lower()
    has_25bp = bool(re.search(r"25\s*(?:bp|basis point)|quarter-point|0\.25", normalized))

    if re.search(r"no change|unchanged|hold(?:ing)?(?: steady)?", normalized):
        return "no_change"
    if has_25bp and re.search(r"cut|lower|reduction|ease", normalized):
        return "cut_25bp"
    if has_25bp and re.search(r"hike|increase|raise", normalized):
        return "hike_25bp"
    return None


def _store_probability(probabilities: dict[str, float], key: str | None, value: str) -> None:
    if key and key not in probabilities:
        probabilities[key] = round(float(value) / 100, 4)


def _extract_probabilities(text: str) -> dict[str, float]:
    probabilities: dict[str, float] = {}
    normalized = re.sub(r"\s+", " ", text)

    percent_before_action = re.compile(
        r"(\d+(?:\.\d+)?)\s*%\s*(?:probability|chance|odds)?\s*(?:of|for)?\s*(?:a|an)?\s*"
        r"(.{0,80}?)(?=,|;|\.|\band\s+\d+(?:\.\d+)?\s*%|$)",
        re.IGNORECASE,
    )
    for match in percent_before_action.finditer(normalized):
        _store_probability(
            probabilities,
            _classify_probability_context(match.group(2)),
            match.group(1),
        )

    action_before_percent = re.compile(
        r"((?:no change|unchanged|hold(?:ing)?(?: steady)?|"
        r"(?:(?:25\s*(?:bp|basis point)|quarter-point|0\.25).{0,30}?(?:cut|lower|reduction|ease|hike|increase|raise))|"
        r"(?:(?:cut|lower|reduction|ease|hike|increase|raise).{0,30}?(?:25\s*(?:bp|basis point)|quarter-point|0\.25)))"
        r".{0,60}?)(\d+(?:\.\d+)?)\s*%",
        re.IGNORECASE,
    )
    for match in action_before_percent.finditer(normalized):
        _store_probability(
            probabilities,
            _classify_probability_context(match.group(1)),
            match.group(2),
        )

    return probabilities


def _tavily_probability_context(meeting_date: str) -> tuple[dict[str, float], str] | None:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return None

    client = TavilyClient(api_key=api_key)
    response = client.search(
        f"CME FedWatch {meeting_date} rate cut probability",
        search_depth="basic",
        max_results=5,
    )
    snippets = "\n".join(
        f"{item.get('title', '')}: {item.get('content', '')}"
        for item in response.get("results", [])
    )
    probabilities = _extract_probabilities(snippets)
    return probabilities, snippets[:1000]


def _payload(
    meeting_date: str,
    source: str,
    current_target_range: str,
    probabilities: dict[str, float],
    note: str,
    extra: dict[str, Any] | None = None,
) -> str:
    data: dict[str, Any] = {
        "meeting_date": meeting_date,
        "source": source,
        "current_target_range": current_target_range,
        "implied_probabilities": probabilities,
        "note": note,
    }
    if extra:
        data.update(extra)
    return json.dumps(data, ensure_ascii=False, indent=2)


def get_rate_move_probability(meeting_date: str, tool_context: ToolContext) -> str:
    """Return Fed funds context and best-effort rate-move probabilities without GCP."""
    try:
        datetime.strptime(meeting_date, "%Y-%m-%d")
    except ValueError:
        return _payload(
            meeting_date,
            "FRED",
            "unknown",
            {},
            "Invalid meeting_date. Use YYYY-MM-DD.",
        )

    current_target_range = "unknown"
    fred_note = "FRED FEDFUNDS data unavailable"
    try:
        latest = _latest_fedfunds_with_timeout()
        if latest:
            observation_date, effective_rate = latest
            current_target_range = _target_range_from_effective_rate(effective_rate)
            fred_note = (
                f"Data from FRED FEDFUNDS series. Latest observation "
                f"{observation_date}: {effective_rate:.2f}%."
            )
    except TimeoutError as exc:
        logger.warning("FRED FEDFUNDS fetch timed out", exc_info=True)
        fred_note = str(exc)
    except Exception as exc:
        logger.warning("FRED FEDFUNDS fetch failed", exc_info=True)
        fred_note = f"FRED FEDFUNDS fetch failed: {exc}"

    try:
        tavily_context = _tavily_probability_context(meeting_date)
        if tavily_context:
            probabilities, snippet = tavily_context
            if probabilities:
                return _payload(
                    meeting_date,
                    "Tavily",
                    current_target_range,
                    probabilities,
                    "Probabilities extracted from Tavily search snippets; rate context from FRED.",
                    {"search_excerpt": snippet},
                )
    except Exception as exc:
        logger.warning("Tavily rate probability lookup failed", exc_info=True)
        fred_note += f" Tavily fallback failed: {exc}"

    return _payload(
        meeting_date,
        "FRED",
        current_target_range,
        {},
        f"{fred_note} FRED does not directly publish CME FedWatch probability distributions.",
    )
