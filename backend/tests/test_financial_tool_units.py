from app.tools.fetch_transcript import _candidate_urls
from app.tools.rate_probability import _extract_probabilities
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


def test_tavily_search_missing_key_returns_friendly_error(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    result = tavily_search("Fed rate outlook", tool_context=None)

    assert result == "Search unavailable: TAVILY_API_KEY is not configured."


def test_max_search_iterations_reads_environment(monkeypatch):
    monkeypatch.setenv("MAX_SEARCH_ITERATIONS", "1")

    test_config = ResearchConfiguration()

    assert test_config.max_search_iterations == 1
