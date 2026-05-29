"""Unit tests for pure helper functions in tool modules.

All functions tested here are free of I/O and side effects.
"""

from app.tools.market_data import _human_number, _format_percent, _format_price
from app.tools.compare_statements import _split_for_diff
from app.tools.fetch_transcript import _clean_text
from app.tools.rate_probability import (
    _target_range_from_effective_rate,
    _classify_probability_context,
)


# ---------------------------------------------------------------------------
# market_data helpers
# ---------------------------------------------------------------------------

class TestHumanNumber:
    def test_trillion(self):
        assert _human_number(1_500_000_000_000) == "1.50T"

    def test_billion(self):
        assert _human_number(2_300_000_000) == "2.30B"

    def test_million(self):
        assert _human_number(800_000_000) == "800.00M"

    def test_small_number(self):
        assert _human_number(12345) == "12,345"

    def test_none(self):
        assert _human_number(None) == "N/A"

    def test_non_numeric_string(self):
        assert _human_number("abc") == "abc"

    def test_negative_billion(self):
        assert _human_number(-1_000_000_000) == "-1.00B"


class TestFormatPercent:
    def test_normal(self):
        assert _format_percent(12.345) == "12.35%"

    def test_none(self):
        assert _format_percent(None) == "N/A"

    def test_non_numeric(self):
        assert _format_percent("abc") == "abc"


class TestFormatPrice:
    def test_normal(self):
        assert _format_price(150.1234) == "150.12"

    def test_none(self):
        assert _format_price(None) == "N/A"

    def test_non_numeric(self):
        assert _format_price("abc") == "abc"


# ---------------------------------------------------------------------------
# compare_statements helpers
# ---------------------------------------------------------------------------

class TestSplitForDiff:
    def test_sentence_split(self):
        text = "First sentence. Second sentence. Third."
        result = _split_for_diff(text)
        assert len(result) >= 3

    def test_multi_space_compression(self):
        text = "Hello    world.   Test   sentence."
        result = _split_for_diff(text)
        for chunk in result:
            assert "    " not in chunk

    def test_empty_input(self):
        assert _split_for_diff("") == []

    def test_blank_line_folding(self):
        text = "A.\n\n\n\nB."
        result = _split_for_diff(text)
        assert len(result) == 2


# ---------------------------------------------------------------------------
# fetch_transcript helpers
# ---------------------------------------------------------------------------

class TestCleanText:
    def test_duplicate_line_removal(self):
        text = "Line one\nLine one\nLine two"
        result = _clean_text(text)
        assert result.count("Line one") == 1

    def test_pure_digit_line_skipped(self):
        text = "Hello\n123\nWorld"
        result = _clean_text(text)
        assert "123" not in result

    def test_whitespace_compression(self):
        text = "Hello    world"
        result = _clean_text(text)
        assert "Hello world" in result

    def test_empty_lines_removed(self):
        text = "A\n\n\nB"
        result = _clean_text(text)
        lines = result.split("\n")
        assert all(line.strip() for line in lines)


# ---------------------------------------------------------------------------
# rate_probability helpers
# ---------------------------------------------------------------------------

class TestTargetRangeFromEffectiveRate:
    def test_known_rate_5_33(self):
        result = _target_range_from_effective_rate(5.33)
        assert result == "5.12%-5.38%"

    def test_known_rate_4_58(self):
        result = _target_range_from_effective_rate(4.58)
        assert result == "4.38%-4.62%"

    def test_zero_rate(self):
        result = _target_range_from_effective_rate(0.08)
        assert "0.00%" in result


class TestClassifyProbabilityContext:
    def test_cut_25bp(self):
        assert _classify_probability_context("a 25 bp rate cut") == "cut_25bp"

    def test_no_change(self):
        assert _classify_probability_context("no change expected") == "no_change"

    def test_hike_25bp(self):
        assert _classify_probability_context("25 bp rate hike") == "hike_25bp"

    def test_unrelated_text(self):
        assert _classify_probability_context("sunny weather today") is None

    def test_hold_steady(self):
        assert _classify_probability_context("Fed is holding steady") == "no_change"
