from __future__ import annotations

from datetime import datetime
import csv
import io
import json
import os
import re
from typing import Any

from google.adk.tools import ToolContext
import requests
from tavily import TavilyClient


FRED_FEDFUNDS_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS"
REQUEST_TIMEOUT = 20


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


def _extract_probabilities(text: str) -> dict[str, float]:
    lower_text = text.lower()
    probabilities: dict[str, float] = {}
    patterns = {
        "cut_25bp": r"(?:25\s*(?:bp|basis point)|quarter-point|0\.25).*?(\d+(?:\.\d+)?)\s*%",
        "no_change": r"(?:no change|hold|unchanged).*?(\d+(?:\.\d+)?)\s*%",
        "hike_25bp": r"(?:hike|increase).*?(?:25\s*(?:bp|basis point)|quarter-point|0\.25).*?(\d+(?:\.\d+)?)\s*%",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, lower_text)
        if match:
            probabilities[key] = round(float(match.group(1)) / 100, 4)
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
        latest = _latest_fedfunds()
        if latest:
            observation_date, effective_rate = latest
            current_target_range = _target_range_from_effective_rate(effective_rate)
            fred_note = (
                f"Data from FRED FEDFUNDS series. Latest observation "
                f"{observation_date}: {effective_rate:.2f}%."
            )
    except Exception as exc:
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
        fred_note += f" Tavily fallback failed: {exc}"

    return _payload(
        meeting_date,
        "FRED",
        current_target_range,
        {},
        f"{fred_note} FRED does not directly publish CME FedWatch probability distributions.",
    )
