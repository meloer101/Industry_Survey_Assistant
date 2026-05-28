import datetime
import json
import logging
import re
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent, LlmAgent, LoopAgent, SequentialAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.apps.app import App
from google.adk.events import Event, EventActions
from google.adk.tools.agent_tool import AgentTool
from google.genai import types as genai_types

from .config import config
from .tools.compare_statements import compare_fed_statements
from .tools.fetch_transcript import fetch_fomc_transcript
from .tools.market_data import get_price_history, get_ticker_overview
from .tools.rate_probability import get_rate_move_probability
from .tools.search import tavily_search


# --- Callbacks ---
def parse_evaluation_callback(callback_context: CallbackContext) -> None:
    """Parses research_evaluator JSON text output into a dict in session state.

    DeepSeek does not support response_format JSON Schema, so we parse manually.
    Falls back to {"grade": "fail"} if parsing fails, so the loop continues safely.
    """
    raw = callback_context.state.get("research_evaluation", "")
    if isinstance(raw, dict):
        return
    if not isinstance(raw, str):
        callback_context.state["research_evaluation"] = {"grade": "fail", "comment": str(raw), "follow_up_queries": None}
        return

    # Strip markdown code fences if present
    clean = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE).strip()
    # Find the first {...} JSON object
    match = re.search(r"\{[\s\S]+\}", clean)
    if match:
        clean = match.group(0)

    try:
        parsed = json.loads(clean)
        callback_context.state["research_evaluation"] = parsed
    except json.JSONDecodeError:
        logging.warning(f"[parse_evaluation_callback] JSON parse failed, defaulting to fail. Raw: {raw[:300]}")
        callback_context.state["research_evaluation"] = {
            "grade": "fail",
            "comment": raw,
            "follow_up_queries": None,
        }


def citation_replacement_callback(
    callback_context: CallbackContext,
) -> genai_types.Content:
    """Replaces <cite source="src-N"/> tags with Markdown links using sources from state."""
    final_report = callback_context.state.get("final_cited_report", "")
    sources = callback_context.state.get("sources", {})

    def tag_replacer(match: re.Match) -> str:
        short_id = match.group(1)
        if not (source_info := sources.get(short_id)):
            logging.warning(f"Invalid citation tag removed: {match.group(0)}")
            return ""
        display_text = source_info.get("title", source_info.get("domain", short_id))
        return f" [{display_text}]({source_info['url']})"

    processed_report = re.sub(
        r'<cite\s+source\s*=\s*["\']?\s*(src-\d+)\s*["\']?\s*/>',
        tag_replacer,
        final_report,
    )
    processed_report = re.sub(r"\s+([.,;:])", r"\1", processed_report)
    callback_context.state["final_report_with_citations"] = processed_report
    return genai_types.Content(parts=[genai_types.Part(text=processed_report)])


# --- Custom Agent for Loop Control ---
class EscalationChecker(BaseAgent):
    """Stops the refinement loop when research evaluation passes."""

    def __init__(self, name: str):
        super().__init__(name=name)

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        evaluation_result = ctx.session.state.get("research_evaluation")
        if evaluation_result and evaluation_result.get("grade") == "pass":
            logging.info(f"[{self.name}] Research passed. Escalating to stop loop.")
            yield Event(author=self.name, actions=EventActions(escalate=True))
        else:
            logging.info(f"[{self.name}] Research failed or not evaluated. Loop continues.")
            yield Event(author=self.name)


# --- Agent Definitions ---
plan_generator = LlmAgent(
    model=config.worker_model,
    name="plan_generator",
    description="Generates or refines a 5-line action-oriented research plan.",
    instruction=f"""
    You are a research strategist. Your job is to create a high-level RESEARCH PLAN, not a summary. If there is already a RESEARCH PLAN in the session state,
    improve upon it based on the user feedback.

    RESEARCH PLAN(SO FAR):
    {{{{ research_plan? }}}}

    **GENERAL INSTRUCTION: CLASSIFY TASK TYPES**
    Your plan must clearly classify each goal for downstream execution. Each bullet point should start with a task type prefix:
    - **`[RESEARCH]`**: For goals that primarily involve information gathering, investigation, analysis, or data collection.
    - **`[DELIVERABLE]`**: For goals that involve synthesizing collected information, creating structured outputs, or compiling final output artifacts.

    **INITIAL RULE: Your initial output MUST start with a bulleted list of 5 action-oriented research goals or key questions, followed by any *inherently implied* deliverables.**
    - All initial 5 goals will be classified as `[RESEARCH]` tasks.
    - A good goal for `[RESEARCH]` starts with a verb like "Analyze," "Identify," "Investigate."
    - **Proactive Implied Deliverables (Initial):** If any of your initial 5 `[RESEARCH]` goals inherently imply a standard output or deliverable, add these as additional, distinct goals prefixed with `[DELIVERABLE][IMPLIED]`.

    **REFINEMENT RULE**:
    - **Integrate Feedback & Mark Changes:** Add `[MODIFIED]` to modified tasks. New tasks get `[RESEARCH][NEW]` or `[DELIVERABLE][NEW]`.
    - **Proactive Implied Deliverables (Refinement):** Add implied deliverables as `[DELIVERABLE][IMPLIED]`.
    - **Maintain Order:** Keep original sequential order of existing bullet points.

    **TOOL USE IS STRICTLY LIMITED:**
    Only use `tavily_search` if a topic is ambiguous and you cannot create a plan without key identifying information.
    Do not research the *content* of the topic. That is the next agent's job.
    Current date: {datetime.datetime.now().strftime("%Y-%m-%d")}
    """,
    tools=[tavily_search],
)


section_planner = LlmAgent(
    model=config.worker_model,
    name="section_planner",
    description="Breaks down the research plan into a structured markdown outline of report sections.",
    instruction="""
    You are an expert report architect. Using the research topic and the plan from the 'research_plan' state key, design a logical structure for the final report.
    Note: Ignore all the tag names ([MODIFIED], [NEW], [RESEARCH], [DELIVERABLE]) in the research plan.
    Your task is to create a markdown outline with 4-6 distinct sections that cover the topic comprehensively without overlap.
    Do not include a "References" or "Sources" section in your outline. Citations will be handled in-line.
    """,
    output_key="report_sections",
)


section_researcher = LlmAgent(
    model=config.worker_model,
    name="section_researcher",
    description="Performs the crucial first pass of web research.",
    instruction="""
    You are a highly capable and diligent research and synthesis agent. Your task is to execute the research plan
    stored in `research_plan` with absolute fidelity, gathering information and synthesizing outputs.

    Each goal is prefixed with `[RESEARCH]` or `[DELIVERABLE]`.

    **Phase 1: Information Gathering (`[RESEARCH]` Tasks)**
    - For each `[RESEARCH]` goal, formulate 4-5 targeted search queries and execute them using `tavily_search`.
    - Each search result includes a [src-N] citation ID — record these IDs alongside the content you gather.
    - Synthesize results into a detailed summary, keeping track of which [src-N] IDs support each claim.

    **Phase 2: Synthesis (`[DELIVERABLE]` Tasks)**
    - Only begin after ALL `[RESEARCH]` goals are complete.
    - Use only the gathered summaries — do NOT perform new searches.
    - Produce the specified artifact for each deliverable.

    **Final Output:** Present all research summaries and deliverable artifacts clearly.
    When referencing facts, note the [src-N] IDs from the search results so the report composer can cite them.

    **Financial Domain Tools:**
    - For public-company or ticker-specific questions, use `get_ticker_overview` for current fundamentals and
      `get_price_history` for recent OHLCV context.
    - For Federal Reserve rate-decision questions, use `get_rate_move_probability` for FRED-based rate context
      and best-effort implied probability extraction.
    - For comparing two FOMC statement PDFs, use `compare_fed_statements`.
    - For a specific FOMC meeting transcript or minutes, use `fetch_fomc_transcript`.
    """,
    tools=[
        tavily_search,
        get_ticker_overview,
        get_price_history,
        get_rate_move_probability,
        compare_fed_statements,
        fetch_fomc_transcript,
    ],
    output_key="section_research_findings",
)


research_evaluator = LlmAgent(
    model=config.critic_model,
    name="research_evaluator",
    description="Critically evaluates research and generates follow-up queries.",
    instruction=f"""
    You are a meticulous quality assurance analyst evaluating the research findings in 'section_research_findings'.

    **CRITICAL RULES:**
    1. Assume the given research topic is correct. Do not question or verify the subject itself.
    2. Your ONLY job is to assess quality, depth, and completeness of the research.
    3. Focus on: comprehensiveness, logical flow, source credibility, depth of analysis, clarity.
    4. Do NOT fact-check the fundamental premise of the topic.
    5. Follow-up queries should dive deeper, not question validity.

    Be critical. If you find significant gaps, grade "fail" and generate 5-7 specific follow-up queries.
    If research thoroughly covers the topic, grade "pass".

    Current date: {datetime.datetime.now().strftime("%Y-%m-%d")}

    **OUTPUT FORMAT — you MUST respond with ONLY a raw JSON object, no markdown fences, no extra text:**
    {{
      "grade": "pass" or "fail",
      "comment": "detailed explanation",
      "follow_up_queries": [
        {{"search_query": "specific query 1"}},
        {{"search_query": "specific query 2"}}
      ]
    }}
    If grade is "pass", set follow_up_queries to null.
    """,
    disallow_transfer_to_parent=True,
    disallow_transfer_to_peers=True,
    output_key="research_evaluation",
    after_agent_callback=parse_evaluation_callback,
)


enhanced_search_executor = LlmAgent(
    model=config.worker_model,
    name="enhanced_search_executor",
    description="Executes follow-up searches and integrates new findings.",
    instruction="""
    You are a specialist researcher executing a refinement pass.
    You have been activated because the previous research was graded as 'fail'.

    1. Review 'research_evaluation' to understand the feedback and required fixes.
    2. Execute EVERY query listed in 'follow_up_queries' using `tavily_search`.
    3. Each search result includes a [src-N] citation ID — record these alongside the content.
    4. Synthesize new findings and COMBINE them with existing 'section_research_findings'.
    5. Your output MUST be the new, complete, improved set of research findings with all [src-N] IDs preserved.

    Use the same financial domain tools as the first research pass when follow-up work requires ticker data,
    price history, Fed rate probability context, FOMC statement comparisons, or FOMC transcripts/minutes.
    """,
    tools=[
        tavily_search,
        get_ticker_overview,
        get_price_history,
        get_rate_move_probability,
        compare_fed_statements,
        fetch_fomc_transcript,
    ],
    output_key="section_research_findings",
)


report_composer = LlmAgent(
    model=config.critic_model,
    name="report_composer_with_citations",
    include_contents="none",
    description="Transforms research data and a markdown outline into a final, cited report.",
    instruction="""
    Transform the provided data into a polished, professional, and meticulously cited research report.

    ---
    ### INPUT DATA
    *   Research Plan: `{research_plan}`
    *   Research Findings: `{section_research_findings}`
    *   Citation Sources: `{sources}`
    *   Report Structure: `{report_sections}`

    ---
    ### CRITICAL: Citation System
    The research findings contain [src-N] IDs marking which sources support which claims.
    The Citation Sources dict maps each src-N to its title and URL.

    To cite a source, insert this tag directly after the claim it supports:
    `<cite source="src-N" />`

    Use the [src-N] IDs from the research findings to know which sources to cite where.

    ---
    ### Final Instructions
    Generate a comprehensive report using ONLY the `<cite source="src-N" />` tag system for citations.
    Follow the structure in Report Structure exactly.
    Do not include a "References" or "Sources" section — all citations must be in-line.
    """,
    output_key="final_cited_report",
    after_agent_callback=citation_replacement_callback,
)


research_pipeline = SequentialAgent(
    name="research_pipeline",
    description="Executes a pre-approved research plan with iterative refinement and produces a final cited report.",
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
        report_composer,
    ],
)


interactive_planner_agent = LlmAgent(
    name="interactive_planner_agent",
    model=config.worker_model,
    description="The primary research assistant. Collaborates with the user to create a plan, then executes it upon approval.",
    instruction=f"""
    You are a research planning assistant. Your primary function is to convert ANY user request into a research plan.

    **CRITICAL RULE: Never answer a question directly or refuse a request.** Your one and only first step is to use the `plan_generator` tool to propose a research plan for the user's topic.

    Your workflow is:
    1. **Plan:** Use `plan_generator` to create a draft plan and present it to the user.
    2. **Refine:** Incorporate user feedback until the plan is approved.
    3. **Execute:** Once the user gives EXPLICIT approval (e.g., "looks good, run it"), delegate to `research_pipeline`.

    Current date: {datetime.datetime.now().strftime("%Y-%m-%d")}
    Do not perform any research yourself. Your job is to Plan, Refine, and Delegate.
    """,
    sub_agents=[research_pipeline],
    tools=[AgentTool(plan_generator)],
    output_key="research_plan",
)

root_agent = interactive_planner_agent
app = App(root_agent=root_agent, name="app")
