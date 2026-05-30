import asyncio
import time

import pytest
from google.adk.agents import BaseAgent

from app.agents.custom import PipelineGuard
from app.tools import market_data
from app.tools.fetch_transcript import _candidate_urls
from app.tools import rate_probability
from app.tools.rate_probability import _extract_probabilities
from app.tools import search
from app.tools.search import tavily_search
from app.config import ResearchConfiguration


def test_candidate_urls_avoid_full_month_scan():
    urls = _candidate_urls(2024, 12)

    assert len(urls) <= 13
    assert urls[0].endswith("/FOMC202412meeting.pdf")
    assert any(url.endswith("/fomcminutes20241218.pdf") for url in urls)
    assert any(url.endswith("/fomcminutes20241231.pdf") for url in urls)


def test_extract_probabilities_handles_percentage_before_action():
    text = "CME FedWatch showed a 72.3% probability of a 25 bp rate cut and 27.7% probability of no change."

    probabilities = _extract_probabilities(text)

    assert probabilities["cut_25bp"] == 0.723
    assert probabilities["no_change"] == 0.277


def test_rate_probability_times_out_slow_fred_fetch(monkeypatch):
    def slow_latest_fedfunds():
        time.sleep(0.05)
        return ("2026-01-01", 4.33)

    monkeypatch.setattr(rate_probability, "_latest_fedfunds", slow_latest_fedfunds)
    monkeypatch.setattr(rate_probability, "_tavily_probability_context", lambda meeting_date: None)
    monkeypatch.setattr(rate_probability, "FRED_TIMEOUT", 0.001, raising=False)

    result = rate_probability.get_rate_move_probability("2026-03-18", tool_context=None)

    assert "FRED FEDFUNDS fetch timed out" in result


def test_tavily_search_missing_key_returns_friendly_error(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    result = tavily_search("Fed rate outlook", tool_context=None)

    assert result == "Search unavailable: TAVILY_API_KEY is not configured."


def test_tavily_search_timeout_returns_friendly_error(monkeypatch):
    class SlowTavilyClient:
        def __init__(self, api_key: str):
            self.api_key = api_key

        def search(self, query: str, search_depth: str, max_results: int):
            time.sleep(0.05)
            return {"results": []}

    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    monkeypatch.setattr(search, "TavilyClient", SlowTavilyClient)
    monkeypatch.setattr(search, "TAVILY_TIMEOUT", 0.001)

    result = tavily_search("Fed rate outlook", tool_context=None)

    assert result == "Search unavailable: Tavily request timed out. Try again later."


def test_market_data_timeout_returns_friendly_error(monkeypatch):
    def slow_fetch(symbol: str):
        time.sleep(0.05)
        return "unexpected"

    monkeypatch.setattr(market_data, "_fetch_ticker_overview", slow_fetch)
    monkeypatch.setattr(market_data, "TOOL_TIMEOUT", 0.001)

    result = market_data.get_ticker_overview("NVDA", tool_context=None)

    assert result == "Timeout fetching data for NVDA. Market data temporarily unavailable."


def test_pipeline_guard_builds_partial_report_from_state():
    state = {
        "section_research_findings": "Finding A",
        "macro_analysis_output": "Macro B",
    }

    result = PipelineGuard._build_partial_report(state, RuntimeError("boom"))

    assert "# Research interrupted" in result
    assert "## Research Findings\n\nFinding A" in result
    assert "## Macro Analysis\n\nMacro B" in result
    assert "boom" not in result


def test_max_search_iterations_reads_environment(monkeypatch):
    monkeypatch.setenv("MAX_SEARCH_ITERATIONS", "1")

    test_config = ResearchConfiguration()

    assert test_config.max_search_iterations == 1


def test_model_names_read_environment(monkeypatch):
    monkeypatch.setenv("WORKER_MODEL", "deepseek/test-worker")
    monkeypatch.setenv("CRITIC_MODEL", "deepseek/test-critic")

    test_config = ResearchConfiguration()

    assert test_config.worker_model.model == "deepseek/test-worker"
    assert test_config.critic_model.model == "deepseek/test-critic"


@pytest.mark.asyncio
async def test_pipeline_guard_emits_partial_report_on_cancelled_pipeline():
    class CancelledPipeline(BaseAgent):
        def __init__(self):
            super().__init__(name="cancelled_pipeline")

        async def _run_async_impl(self, ctx):
            raise asyncio.CancelledError
            yield

    class FakeSession:
        state = {"section_research_findings": "Partial findings"}

    class FakeContext:
        session = FakeSession()

    guard = PipelineGuard(CancelledPipeline())

    events = [event async for event in guard._run_async_impl(FakeContext())]

    assert len(events) == 1
    assert events[0].actions.state_delta["final_report_with_citations"].startswith(
        "# Research interrupted"
    )
