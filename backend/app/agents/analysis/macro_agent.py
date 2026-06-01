from google.adk.agents import LlmAgent

from ...callbacks import rate_limit_callback
from ...config import config
from ...tools.compare_statements import compare_fed_statements
from ...tools.fetch_transcript import fetch_fomc_transcript
from ...tools.rate_probability import get_rate_move_probability


MACRO_ANALYSIS_PROMPT = """
You are an experienced macroeconomic analyst. Analyze the completed research
findings and produce a concise, specific macro policy analysis.

<RESEARCH_FINDINGS>
{section_research_findings}
</RESEARCH_FINDINGS>

Your job:
1. Identify the macro policy themes in the research findings.
2. Use your tools for supplemental data only when the findings contain a
   specific meeting date, year-month, or Fed PDF URL. Do not guess tool
   parameters. If no clear date or meeting reference exists, skip tool calls
   and work from the research findings alone.
3. Produce a structured analysis covering:
   - Current Policy Stance & Recent Actions
   - Forward Guidance & Market Expectations
   - Key Economic Indicators, including inflation, employment, and growth
   - Cross-Central-Bank Comparison, if relevant
   - Market Impact Assessment
4. Be specific. Use numbers, dates, percentages, and named policy actions when
   available. Avoid vague statements.
5. When citing data from tools such as FRED or Federal Reserve PDFs, note the
   source name inline. Tool-sourced claims do not use [src-N] citation IDs.
   Only web research findings carry [src-N] IDs.
6. Output 1-2 pages of analysis.

**LANGUAGE RULE:** The entire analysis MUST be written in Chinese (简体中文). Technical terms, proper nouns, and data labels may remain in English.
"""


macro_analysis_agent = LlmAgent(
    model=config.worker_model,
    name="macro_analysis_agent",
    description=(
        "Analyses macroeconomic factors: central bank policy, interest rates, "
        "inflation, employment, and their market impact."
    ),
    instruction=MACRO_ANALYSIS_PROMPT,
    tools=[
        get_rate_move_probability,
        fetch_fomc_transcript,
        compare_fed_statements,
    ],
    output_key="macro_analysis_output",
    before_model_callback=rate_limit_callback,
)
