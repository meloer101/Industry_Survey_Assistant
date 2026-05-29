"""Smoke tests for the Phase 3 analysis pipeline extension."""


def test_analysis_agents_import_cleanly():
    from app.agents.analysis.coordinator import analysis_coordinator
    from app.agents.analysis.fundamental_agent import fundamental_analysis_agent
    from app.agents.analysis.macro_agent import macro_analysis_agent
    from app.agents.analysis.risk_agent import risk_analysis_agent

    assert macro_analysis_agent.name == "macro_analysis_agent"
    assert fundamental_analysis_agent.name == "fundamental_analysis_agent"
    assert risk_analysis_agent.name == "risk_analysis_agent"
    assert analysis_coordinator.name == "analysis_coordinator"


def test_optional_keys_in_analysis_prompts():
    """Skipped analysis outputs should not cause ADK state-injection KeyError."""
    from app.agents.analysis.risk_agent import RISK_ANALYSIS_PROMPT
    from app.agents.research.pipeline import report_composer

    assert "{macro_analysis_output?}" in RISK_ANALYSIS_PROMPT
    assert "{fundamental_analysis_output?}" in RISK_ANALYSIS_PROMPT
    assert "{macro_analysis_output?}" in report_composer.instruction
    assert "{fundamental_analysis_output?}" in report_composer.instruction
    assert "{risk_analysis_output?}" in report_composer.instruction
    assert "{analysis_summary?}" in report_composer.instruction


def test_pipeline_includes_analysis_coordinator_before_report_composer():
    from app.agents.research.pipeline import research_pipeline

    agent_names = [agent.name for agent in research_pipeline.sub_agents]

    assert "analysis_coordinator" in agent_names
    assert agent_names.index("analysis_coordinator") < agent_names.index(
        "report_composer_with_citations"
    )
