"""Custom BaseAgent subclasses for pipeline control flow."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions

from ..observability import (
    end_pipeline_trace,
    metrics_registry,
    now,
    record_pipeline_failure,
    start_pipeline_trace,
)

logger = logging.getLogger(__name__)


class EscalationChecker(BaseAgent):
    """Stops the refinement loop when research evaluation passes."""

    def __init__(self, name: str):
        super().__init__(name=name)

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        evaluation_result = ctx.session.state.get("research_evaluation")
        if evaluation_result and evaluation_result.get("grade") == "pass":
            logger.info("[%s] Research passed. Escalating to stop loop.", self.name)
            yield Event(author=self.name, actions=EventActions(escalate=True))
        else:
            logger.info("[%s] Research failed or not evaluated. Loop continues.", self.name)
            yield Event(author=self.name)


class PipelineGuard(BaseAgent):
    """Wraps the research pipeline and emits partial results on failure."""

    def __init__(self, pipeline: BaseAgent):
        super().__init__(name="pipeline_guard", sub_agents=[pipeline])
        self._pipeline = pipeline

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        try:
            async for event in self._pipeline.run_async(ctx):
                yield event
        except asyncio.CancelledError:
            logger.warning("[PipelineGuard] Pipeline cancelled during shutdown")
            state = ctx.session.state
            record_pipeline_failure(state)
            partial_report = self._build_partial_report(
                state,
                RuntimeError("Pipeline cancelled during shutdown"),
            )
            state["final_cited_report"] = partial_report
            state["final_report_with_citations"] = partial_report
            yield Event(
                author=self.name,
                actions=EventActions(
                    state_delta={"final_report_with_citations": partial_report}
                ),
            )
        except Exception as exc:
            logger.error("[PipelineGuard] Pipeline failed: %s", exc, exc_info=True)
            state = ctx.session.state
            record_pipeline_failure(state)
            partial_report = self._build_partial_report(state, exc)
            state["final_cited_report"] = partial_report
            state["final_report_with_citations"] = partial_report
            yield Event(
                author=self.name,
                actions=EventActions(
                    state_delta={"final_report_with_citations": partial_report}
                ),
            )

    @staticmethod
    def _build_partial_report(state: dict, exc: Exception) -> str:
        parts = [
            "# Research interrupted\n\n"
            "The research pipeline stopped before the final report could be completed. "
            "Partial results available before the interruption are shown below.\n"
        ]

        if findings := state.get("section_research_findings"):
            parts.append(f"## Research Findings\n\n{findings}\n")
        if macro := state.get("macro_analysis_output"):
            parts.append(f"## Macro Analysis\n\n{macro}\n")
        if fundamental := state.get("fundamental_analysis_output"):
            parts.append(f"## Fundamental Analysis\n\n{fundamental}\n")
        if risk := state.get("risk_analysis_output"):
            parts.append(f"## Risk Assessment\n\n{risk}\n")

        if len(parts) == 1:
            parts.append(
                "The pipeline stopped before it produced usable intermediate results.\n\n"
                f"Error: {exc}"
            )

        return "\n".join(parts)


def pipeline_start_callback(callback_context: CallbackContext) -> None:
    callback_context.state["_pipeline_start_ts"] = now()
    start_pipeline_trace(callback_context.state)
    logger.info("[pipeline] research_pipeline started")


def pipeline_end_callback(callback_context: CallbackContext) -> None:
    start = callback_context.state.get("_pipeline_start_ts")
    if not start:
        return

    elapsed = now() - float(start)
    source_count = len(callback_context.state.get("sources", {}))
    metrics_registry.record_pipeline_end(
        duration_seconds=elapsed,
        source_count=source_count,
    )
    end_pipeline_trace(
        callback_context.state,
        elapsed_seconds=elapsed,
        source_count=source_count,
    )
    logger.info(
        "[pipeline] research_pipeline finished in %.1fs, sources=%d",
        elapsed,
        source_count,
    )
