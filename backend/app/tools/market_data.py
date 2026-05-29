from __future__ import annotations

import logging
from typing import Any

from google.adk.tools import ToolContext
import yfinance as yf


logger = logging.getLogger(__name__)
VALID_PERIODS = {"5d", "1mo", "3mo", "6mo", "1y"}


def _human_number(value: Any) -> str:
    if value is None:
        return "N/A"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)

    abs_number = abs(number)
    for suffix, divisor in (("T", 1_000_000_000_000), ("B", 1_000_000_000), ("M", 1_000_000)):
        if abs_number >= divisor:
            return f"{number / divisor:.2f}{suffix}"
    return f"{number:,.0f}"


def _format_percent(value: Any) -> str:
    if value is None:
        return "N/A"
    try:
        return f"{float(value):.2f}%"
    except (TypeError, ValueError):
        return str(value)


def _format_price(value: Any) -> str:
    if value is None:
        return "N/A"
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return str(value)


def get_ticker_overview(ticker: str, tool_context: ToolContext) -> str:
    """Return a concise yfinance overview for a public ticker."""
    symbol = ticker.strip().upper()
    if not symbol:
        return "No data found for ticker: "

    try:
        stock = yf.Ticker(symbol)
        info = stock.info or {}
    except Exception:
        logger.warning("Could not fetch ticker overview for %s", symbol, exc_info=True)
        return f"No data found for ticker: {symbol}"

    quote_type = info.get("quoteType")
    name = info.get("longName") or info.get("shortName")
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if not name and not price and quote_type in (None, "NONE"):
        return f"No data found for ticker: {symbol}"

    previous_close = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change_pct = None
    try:
        if price is not None and previous_close:
            change_pct = ((float(price) - float(previous_close)) / float(previous_close)) * 100
    except (TypeError, ValueError, ZeroDivisionError):
        change_pct = None

    return "\n".join(
        [
            f"Ticker: {symbol}",
            f"Company: {name or 'N/A'}",
            f"Sector / Industry: {info.get('sector', 'N/A')} / {info.get('industry', 'N/A')}",
            f"Market Cap: {_human_number(info.get('marketCap'))}",
            f"PE Ratio TTM: {_format_price(info.get('trailingPE'))}",
            "52 Week Range: "
            f"{_format_price(info.get('fiftyTwoWeekLow'))} / {_format_price(info.get('fiftyTwoWeekHigh'))}",
            f"Current Price: {_format_price(price)}",
            f"Daily Change: {_format_percent(change_pct)}",
            f"Analyst Target Mean Price: {_format_price(info.get('targetMeanPrice'))}",
        ]
    )


def get_price_history(ticker: str, period: str, tool_context: ToolContext) -> str:
    """Return up to 30 OHLCV rows for a ticker."""
    symbol = ticker.strip().upper()
    normalized_period = period if period in VALID_PERIODS else "1mo"
    if not symbol:
        return "No price history found for ticker: "

    try:
        history = yf.download(symbol, period=normalized_period, auto_adjust=True, progress=False)
    except Exception as exc:
        logger.warning("Could not fetch price history for %s", symbol, exc_info=True)
        return f"Could not fetch price history for {symbol}: {exc}"

    if history.empty:
        return f"No price history found for ticker: {symbol}"

    if hasattr(history.columns, "nlevels") and history.columns.nlevels > 1:
        history.columns = history.columns.get_level_values(0)

    rows = ["Date | Open | High | Low | Close | Volume"]
    for date, row in history.tail(30).iterrows():
        rows.append(
            " | ".join(
                [
                    date.strftime("%Y-%m-%d"),
                    _format_price(row.get("Open")),
                    _format_price(row.get("High")),
                    _format_price(row.get("Low")),
                    _format_price(row.get("Close")),
                    _human_number(row.get("Volume")),
                ]
            )
        )

    return "\n".join(rows)
