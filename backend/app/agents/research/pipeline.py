"""Research pipeline agent definitions."""
from __future__ import annotations

from google.adk.agents import LlmAgent, LoopAgent, SequentialAgent

from ...agents.analysis.coordinator import analysis_coordinator
from ...callbacks import (
    citation_replacement_callback,
    parse_evaluation_callback,
    rate_limit_callback,
)
from ...config import config
from ...tools.compare_statements import compare_fed_statements
from ...tools.fetch_transcript import fetch_fomc_transcript
from ...tools.market_data import get_price_history, get_ticker_overview
from ...tools.rate_probability import get_rate_move_probability
from ...tools.search import tavily_search
from ..custom import (
    EscalationChecker,
    PipelineGuard,
    pipeline_end_callback,
    pipeline_start_callback,
)
from .prompts import (
    ENHANCED_SEARCH_PROMPT,
    PLAN_GENERATOR_PROMPT,
    REPORT_COMPOSER_PROMPT,
    RESEARCH_EVALUATOR_PROMPT,
    SECTION_PLANNER_PROMPT,
    SECTION_RESEARCHER_PROMPT,
)


plan_generator = LlmAgent(
    model=config.worker_model,
    name="plan_generator",
    description="Generates or refines a 5-line action-oriented research plan.",
    instruction=PLAN_GENERATOR_PROMPT,
    tools=[tavily_search],
)


section_planner = LlmAgent(
    model=config.worker_model,
    name="section_planner",
    description="Breaks down the research plan into a structured markdown outline of report sections.",
    instruction=SECTION_PLANNER_PROMPT,
    output_key="report_sections",
)


section_researcher = LlmAgent(
    model=config.worker_model,
    name="section_researcher",
    description="Performs the crucial first pass of web research.",
    instruction=SECTION_RESEARCHER_PROMPT,
    tools=[
        tavily_search,
        get_ticker_overview,
        get_price_history,
        get_rate_move_probability,
        compare_fed_statements,
        fetch_fomc_transcript,
    ],
    output_key="section_research_findings",
    before_model_callback=rate_limit_callback,
)


research_evaluator = LlmAgent(
    model=config.critic_model,
    name="research_evaluator",
    description="Critically evaluates research and generates follow-up queries.",
    instruction=RESEARCH_EVALUATOR_PROMPT,
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
    output_key="research_evaluation",
    before_model_callback=rate_limit_callback,
    after_agent_callback=parse_evaluation_callback,
)


enhanced_search_executor = LlmAgent(
    model=config.worker_model,
    name="enhanced_search_executor",
    description="Executes follow-up searches and integrates new findings.",
    instruction=ENHANCED_SEARCH_PROMPT,
    tools=[
        tavily_search,
        get_ticker_overview,
        get_price_history,
        get_rate_move_probability,
        compare_fed_statements,
        fetch_fomc_transcript,
    ],
    output_key="section_research_findings",
    before_model_callback=rate_limit_callback,
)


report_composer = LlmAgent(
    model=config.critic_model,
    name="report_composer_with_citations",
    include_contents="none",
    description="Transforms research data and a markdown outline into a final, cited report.",
    instruction=REPORT_COMPOSER_PROMPT,
    output_key="final_cited_report",
    after_agent_callback=citation_replacement_callback,
)


research_pipeline = SequentialAgent(
    name="research_pipeline",
    description="Executes a pre-approved research plan with iterative refinement and produces a final cited report.",
    before_agent_callback=pipeline_start_callback,
    after_agent_callback=pipeline_end_callback,
    sub_agents=[
        section_planner,
        section_researcher,
        LoopAgent(
            name="iterative_refinement_loop",
            max_iterations=config.max_search_iterations,
            sub_agents=[
                research_evaluator,
                EscalationChecker(name="escalation_checker"),
                enhanced_search_executor,
            ],
        ),
        analysis_coordinator,
        report_composer,
    ],
)


def build_research_pipeline() -> PipelineGuard:
    """Assemble and return the guarded research pipeline."""

    return PipelineGuard(research_pipeline)
