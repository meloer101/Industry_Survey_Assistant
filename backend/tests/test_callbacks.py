"""Unit tests for callback pure functions in callbacks.py.

parse_evaluation_callback operates on state["research_evaluation"].
citation_replacement_callback operates on state["final_cited_report"] + state["sources"],
writes to state["final_report_with_citations"], and returns a genai Content.
"""

import json

from app.callbacks import (
    parse_evaluation_callback,
    citation_replacement_callback,
)


class _FakeCallbackContext:
    """Minimal stand-in for CallbackContext — only .state is accessed."""

    def __init__(self, state: dict):
        self.state = state


# ---------------------------------------------------------------------------
# parse_evaluation_callback
# ---------------------------------------------------------------------------

class TestParseEvaluationCallback:
    def test_valid_json_string(self):
        raw = json.dumps({"grade": "pass", "comment": "good"})
        ctx = _FakeCallbackContext(state={"research_evaluation": raw})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "pass"

    def test_markdown_fenced_json(self):
        raw = '```json\n{"grade": "needs_improvement", "comment": "shallow"}\n```'
        ctx = _FakeCallbackContext(state={"research_evaluation": raw})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "needs_improvement"

    def test_already_dict(self):
        original = {"grade": "pass", "comment": "ok"}
        ctx = _FakeCallbackContext(state={"research_evaluation": original})

        parse_evaluation_callback(ctx)

        assert ctx.state["research_evaluation"] is original

    def test_invalid_json_fallback(self):
        ctx = _FakeCallbackContext(state={"research_evaluation": "garbage text"})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "fail"
        assert "garbage text" in result.get("comment", "")

    def test_non_string_fallback(self):
        ctx = _FakeCallbackContext(state={"research_evaluation": 42})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "fail"

    def test_empty_string_fallback(self):
        ctx = _FakeCallbackContext(state={"research_evaluation": ""})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "fail"

    def test_json_with_surrounding_text(self):
        raw = 'Here is my evaluation: {"grade": "pass", "comment": "solid"} end.'
        ctx = _FakeCallbackContext(state={"research_evaluation": raw})

        parse_evaluation_callback(ctx)

        result = ctx.state["research_evaluation"]
        assert isinstance(result, dict)
        assert result["grade"] == "pass"


# ---------------------------------------------------------------------------
# citation_replacement_callback
# ---------------------------------------------------------------------------

class TestCitationReplacementCallback:
    def test_single_source(self):
        ctx = _FakeCallbackContext(state={
            "final_cited_report": 'Hello <cite source="src-1" /> world.',
            "sources": {
                "src-1": {"title": "Reuters", "url": "https://reuters.com/article"},
            },
        })

        citation_replacement_callback(ctx)

        report = ctx.state["final_report_with_citations"]
        assert "[Reuters](https://reuters.com/article)" in report
        assert "<cite" not in report

    def test_missing_source_removed(self):
        ctx = _FakeCallbackContext(state={
            "final_cited_report": 'Hello <cite source="src-99" /> world.',
            "sources": {},
        })

        citation_replacement_callback(ctx)

        report = ctx.state["final_report_with_citations"]
        assert "<cite" not in report

    def test_multiple_sources(self):
        ctx = _FakeCallbackContext(state={
            "final_cited_report": (
                'A <cite source="src-1" /> B <cite source="src-2" /> C.'
            ),
            "sources": {
                "src-1": {"title": "Source A", "url": "https://a.com"},
                "src-2": {"title": "Source B", "url": "https://b.com"},
            },
        })

        citation_replacement_callback(ctx)

        report = ctx.state["final_report_with_citations"]
        assert "[Source A](https://a.com)" in report
        assert "[Source B](https://b.com)" in report

    def test_no_report_no_error(self):
        ctx = _FakeCallbackContext(state={})

        citation_replacement_callback(ctx)

        report = ctx.state.get("final_report_with_citations", "")
        assert "<cite" not in report

    def test_whitespace_cleanup(self):
        ctx = _FakeCallbackContext(state={
            "final_cited_report": 'Hello <cite source="src-1" />  .',
            "sources": {
                "src-1": {"title": "T", "url": "https://t.com"},
            },
        })

        citation_replacement_callback(ctx)

        report = ctx.state["final_report_with_citations"]
        assert "  ." not in report

    def test_returns_content_object(self):
        ctx = _FakeCallbackContext(state={
            "final_cited_report": 'Test <cite source="src-1" />.',
            "sources": {
                "src-1": {"title": "X", "url": "https://x.com"},
            },
        })

        result = citation_replacement_callback(ctx)

        assert result is not None
        assert hasattr(result, "parts")
