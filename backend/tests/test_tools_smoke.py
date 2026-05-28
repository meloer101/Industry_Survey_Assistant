from unittest.mock import MagicMock

from app.tools.compare_statements import compare_fed_statements
from app.tools.fetch_transcript import fetch_fomc_transcript
from app.tools.market_data import get_price_history, get_ticker_overview
from app.tools.rate_probability import get_rate_move_probability


def test_market_data_overview():
    result = get_ticker_overview("AAPL", MagicMock())

    assert result
    assert "Apple" in result or "AAPL" in result


def test_market_data_history():
    result = get_price_history("AAPL", "5d", MagicMock())

    assert result
    assert "Close" in result or "Date" in result


def test_rate_probability():
    result = get_rate_move_probability("2025-03-19", MagicMock())

    assert result
    assert "probability" in result.lower() or any(char.isdigit() for char in result)


def test_compare_statements():
    result = compare_fed_statements(
        "https://www.federalreserve.gov/monetarypolicy/files/monetary20250129a1.pdf",
        "https://www.federalreserve.gov/monetarypolicy/files/monetary20250319a1.pdf",
        MagicMock(),
    )

    assert result
    assert "---" in result or "+++" in result


def test_fetch_transcript():
    result = fetch_fomc_transcript(2024, 12, MagicMock())

    assert len(result) > 100


def test_ticker_invalid():
    result = get_ticker_overview("INVALIDXYZ999", MagicMock())

    assert "No data found for ticker: INVALIDXYZ999" in result
