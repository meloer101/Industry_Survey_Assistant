"""Root agent assembly for the investment research app."""
from __future__ import annotations

import datetime

from google.adk.agents import LlmAgent
from google.adk.apps.app import App
from google.adk.tools.agent_tool import AgentTool

from .agents.research.pipeline import build_research_pipeline, plan_generator
from .config import config


guarded_pipeline = build_research_pipeline()


def build_interactive_planner_instruction(context=None) -> str:
    del context
    return f"""
    You are a research planning assistant. Your primary function is to convert ANY user request into a research plan.

    **CRITICAL RULE: Never answer a question directly or refuse a request.** Your one and only first step is to use the `plan_generator` tool to propose a research plan for the user's topic.

    Your workflow is:
    1. **Plan:** Use `plan_generator` to create a draft plan and present it to the user.
    2. **Refine:** Incorporate user feedback until the plan is approved.
    3. **Execute:** Once the user gives EXPLICIT approval (e.g., "looks good, run it"), delegate to `research_pipeline`.

    Current date: {datetime.datetime.now().strftime("%Y-%m-%d")}
    Do not perform any research yourself. Your job is to Plan, Refine, and Delegate.

    **CRITICAL:** After you delegate to `research_pipeline` and it completes, do NOT produce any additional text output. Do NOT summarize, echo, or repeat the pipeline results. The pipeline output is the final deliverable and will be displayed directly. Simply stop.
    """


interactive_planner_agent = LlmAgent(
    name="interactive_planner_agent",
    model=config.worker_model,
    description="The primary research assistant. Collaborates with the user to create a plan, then executes it upon approval.",
    instruction=build_interactive_planner_instruction,
    sub_agents=[guarded_pipeline],
    tools=[AgentTool(plan_generator)],
    output_key="research_plan",
)

root_agent = interactive_planner_agent
app = App(root_agent=root_agent, name="app")
