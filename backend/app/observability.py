"""Lightweight metrics and tracing helpers for the research pipeline."""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

try:
    from opentelemetry import trace
except ImportError:  # pragma: no cover - exercised only in minimal deployments.
    trace = None


@dataclass
class PipelineMetrics:
    runs_total: float = 0.0
    failures_total: float = 0.0
    duration_count: float = 0.0
    duration_sum: float = 0.0
    sources_total: float = 0.0


class MetricsRegistry:
    def __init__(self) -> None:
        self._metrics = PipelineMetrics()

    def reset(self) -> None:
        self._metrics = PipelineMetrics()

    def record_pipeline_end(
        self,
        *,
        duration_seconds: float,
        source_count: int,
        failed: bool = False,
    ) -> None:
        self._metrics.runs_total += 1
        self._metrics.duration_count += 1
        self._metrics.duration_sum += max(0.0, duration_seconds)
        self._metrics.sources_total += max(0, source_count)
        if failed:
            self._metrics.failures_total += 1

    def render_prometheus(self) -> str:
        metrics = self._metrics
        lines = [
            "# HELP pipeline_runs_total Total completed research pipeline runs.",
            "# TYPE pipeline_runs_total counter",
            f"pipeline_runs_total {metrics.runs_total}",
            "# HELP pipeline_failures_total Total failed research pipeline runs.",
            "# TYPE pipeline_failures_total counter",
            f"pipeline_failures_total {metrics.failures_total}",
            "# HELP pipeline_duration_seconds Research pipeline duration.",
            "# TYPE pipeline_duration_seconds summary",
            f"pipeline_duration_seconds_count {metrics.duration_count}",
            f"pipeline_duration_seconds_sum {metrics.duration_sum}",
            "# HELP pipeline_sources_total Total cited sources collected by completed pipelines.",
            "# TYPE pipeline_sources_total counter",
            f"pipeline_sources_total {metrics.sources_total}",
        ]
        return "\n".join(lines) + "\n"


metrics_registry = MetricsRegistry()
_tracer = trace.get_tracer("investment_research_platform") if trace else None
_active_spans: dict[str, object] = {}


def start_pipeline_trace(state: dict) -> None:
    trace_id = uuid.uuid4().hex
    state["_pipeline_trace_id"] = trace_id
    if _tracer is None:
        return
    span_cm = _tracer.start_as_current_span("research_pipeline")
    span = span_cm.__enter__()
    span.set_attribute("pipeline.trace_id", trace_id)
    _active_spans[trace_id] = span_cm


def end_pipeline_trace(state: dict, *, elapsed_seconds: float, source_count: int) -> None:
    trace_id = state.get("_pipeline_trace_id")
    span_cm = _active_spans.pop(trace_id, None)
    if span_cm is None:
        return
    span = trace.get_current_span() if trace else None
    if span is not None:
        span.set_attribute("pipeline.elapsed_seconds", elapsed_seconds)
        span.set_attribute("pipeline.source_count", source_count)
    span_cm.__exit__(None, None, None)


def record_pipeline_failure(state: dict, *, now: float | None = None) -> None:
    start = state.get("_pipeline_start_ts")
    elapsed = 0.0 if not start else (time.time() if now is None else now) - float(start)
    source_count = len(state.get("sources", {}))
    metrics_registry.record_pipeline_end(
        duration_seconds=elapsed,
        source_count=source_count,
        failed=True,
    )
    end_pipeline_trace(
        state,
        elapsed_seconds=elapsed,
        source_count=source_count,
    )


def active_trace_count() -> int:
    return len(_active_spans)


def now() -> float:
    return time.time()
