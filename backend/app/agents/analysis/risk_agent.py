from google.adk.agents import LlmAgent

from ...callbacks import rate_limit_callback
from ...config import config


LEGAL_DISCLAIMER = (
    '"Important Disclaimer: For Educational and Informational Purposes Only." '
    '"The information and trading strategy outlines provided by this tool, '
    'including any analysis, commentary, or potential scenarios, are generated '
    'by an AI model and are for educational and informational purposes only. '
    'They do not constitute, and should not be interpreted as, financial advice, '
    'investment recommendations, endorsements, or offers to buy or sell any '
    'securities or other financial instruments." "Google and its affiliates '
    'make no representations or warranties of any kind, express or implied, '
    'about the completeness, accuracy, reliability, suitability, or availability '
    'with respect to the information provided. Any reliance you place on such '
    'information is therefore strictly at your own risk."1 "This is not an '
    'offer to buy or sell any security. Investment decisions should not be made '
    'based solely on the information provided here. Financial markets are '
    'subject to risks, and past performance is not indicative of future results. '
    'You should conduct your own thorough research and consult with a qualified '
    'independent financial advisor before making any investment decisions." '
    '"By using this tool and reviewing these strategies, you acknowledge that '
    'you understand this disclaimer and agree that Google and its affiliates are '
    'not liable for any losses or damages arising from your use of or reliance '
    'on this information."'
)


RISK_ANALYSIS_PROMPT = f"""
Objective: Generate a detailed and reasoned risk analysis for the provided
investment research topic. This analysis should focus on research and portfolio
decision risks, not personalized trade execution advice.

<RESEARCH_FINDINGS>
{{section_research_findings}}
</RESEARCH_FINDINGS>

<MACRO_ANALYSIS>
{{macro_analysis_output?}}
</MACRO_ANALYSIS>

<FUNDAMENTAL_ANALYSIS>
{{fundamental_analysis_output?}}
</FUNDAMENTAL_ANALYSIS>

Produce a structured risk report:
1. Executive Summary of Risks
2. Market Risks, including directional, volatility, gap, rate sensitivity, and
   currency risks where relevant
3. Liquidity Risks
4. Counterparty & Platform Risks, if applicable
5. Operational & Regulatory Risks
6. Strategy-Specific & Model Risks
7. Psychological Risks for investors, including confirmation bias, FOMO,
   overconfidence, and difficulty adhering to a plan during drawdowns
8. Overall Assessment & Concluding Remarks

For each applicable category, provide identification, assessment, and practical
mitigation considerations. Use the research findings, macro analysis, and
fundamental analysis as the only analytical inputs. If an upstream analysis
section is empty, skip it silently.

Legal Disclaimer and User Acknowledgment (MUST be displayed prominently):
{LEGAL_DISCLAIMER}

**LANGUAGE RULE:** The entire risk report MUST be written in Chinese (简体中文). The legal disclaimer above should be kept in its original English. Technical terms, proper nouns, and data labels may remain in English.
"""


risk_analysis_agent = LlmAgent(
    model=config.worker_model,
    name="risk_analysis_agent",
    description=(
        "Provides comprehensive risk assessment covering market, liquidity, "
        "operational, and strategy-specific risks with mitigation recommendations."
    ),
    instruction=RISK_ANALYSIS_PROMPT,
    tools=[],
    output_key="risk_analysis_output",
    before_model_callback=rate_limit_callback,
)
