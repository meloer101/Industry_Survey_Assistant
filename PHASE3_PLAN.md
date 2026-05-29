# Phase 3 — Analysis Pipeline Extension: Detailed Implementation Plan

## Overview

**Goal**: Insert a domain-specific financial analysis layer between the research loop and report composer. After iterative web research completes, an `analysis_coordinator` reads the findings and intelligently routes them through up to three specialist agents (macro, fundamental, risk) before the final report is composed.

**Architecture Change**:
```
research_pipeline (SequentialAgent):
  section_planner
  section_researcher
  LoopAgent(research_evaluator, EscalationChecker, enhanced_search_executor)
  ──── NEW ────
  analysis_coordinator   ← reads section_research_findings from state
  ──────────────
  report_composer        ← updated to also read analysis outputs
```

---

## Pre-Implementation: Reference Study

Before writing code, read and understand these source prompts (READ-ONLY, never modify):

| Source File | What to Extract |
|-------------|----------------|
| `参考项目代码/fomc-research_副本/fomc_research/sub_agents/analysis_agent_prompt.py` | FOMC-specific analysis structure; how it reads artifacts from state; 1-2 page report format |
| `参考项目代码/financial-advisor_副本/financial_advisor/sub_agents/risk_analyst/prompt.py` | Full risk analysis framework (7 risk categories); legal disclaimer text (MUST preserve verbatim); user profile integration |
| `参考项目代码/financial-advisor_副本/financial_advisor/sub_agents/data_analyst/prompt.py` | Iterative search-then-synthesize pattern; 6-section report structure; SEC filings + sentiment + analyst opinions |

---

## Step 1: Create Directory Structure

```bash
mkdir -p backend/app/agents/analysis
touch backend/app/agents/__init__.py
touch backend/app/agents/analysis/__init__.py
```

Create 4 files:
- `backend/app/agents/analysis/macro_agent.py`
- `backend/app/agents/analysis/fundamental_agent.py`
- `backend/app/agents/analysis/risk_agent.py`
- `backend/app/agents/analysis/coordinator.py`

---

## Step 2: Macro Analysis Agent

**File**: `backend/app/agents/analysis/macro_agent.py`

### Prompt Design (adapted from fomc analysis_agent_prompt.py)

The original fomc prompt is FOMC-only. We need to generalise it to cover:
- Federal Reserve (FOMC) policy: rate decisions, dot plot, balance sheet
- ECB, PBOC, BOJ and other major central banks
- Inflation data (CPI, PPI, PCE)
- Employment data (NFP, unemployment rate, jobless claims)
- GDP and growth indicators
- Yield curve dynamics, credit spreads

**Key changes from original**:
- Replace hardcoded `{artifact.requested_statement_fulltext}` etc. with `{section_research_findings}` from session state
- Generalise from "FOMC meeting analysis" to "macroeconomic policy analysis"
- Keep the "be specific, use numbers" instruction — it's good
- Add instruction to use tools for supplemental data

### Agent Definition

```python
macro_analysis_agent = LlmAgent(
    model=config.worker_model,
    name="macro_analysis_agent",
    description="Analyses macroeconomic factors: central bank policy, interest rates, inflation, employment, and their market impact.",
    instruction=MACRO_ANALYSIS_PROMPT,  # defined in same file
    tools=[
        get_rate_move_probability,   # FRED rate data + implied probabilities
        fetch_fomc_transcript,       # FOMC meeting transcripts/minutes
        compare_fed_statements,      # PDF diff of consecutive FOMC statements
    ],
    output_key="macro_analysis_output",
)
```

### Prompt Template Structure

```
You are an experienced macroeconomic analyst...

<RESEARCH_FINDINGS>
{section_research_findings}
</RESEARCH_FINDINGS>

Your job:
1. Identify the macro policy themes in the research findings
2. Use your tools to gather supplemental data — but ONLY when the findings
   contain a specific meeting date, year-month, or Fed PDF URL. Do NOT guess
   tool parameters; if no clear date/meeting reference exists, skip tool calls
   and work from the research findings alone.
3. Produce a structured analysis covering:
   - Current Policy Stance & Recent Actions
   - Forward Guidance & Market Expectations
   - Key Economic Indicators (inflation, employment, growth)
   - Cross-Central-Bank Comparison (if relevant)
   - Market Impact Assessment
4. Be specific — use numbers, dates, percentages. Avoid vague statements.
5. When citing data from tools (FRED, Fed PDFs), note the data source name
   inline (e.g., "according to FRED effective federal funds rate data" or
   "per the January 2025 FOMC statement"). These tool-sourced claims do NOT
   use [src-N] citation IDs — only web research findings carry those.
6. Output 1-2 pages of analysis.
```

### State I/O

| Direction | State Key | Description |
|-----------|----------|-------------|
| Input | `section_research_findings` | Research text from Phase 1/2 pipeline |
| Output | `macro_analysis_output` | Macro analysis report text |

---

## Step 3: Fundamental Analysis Agent

**File**: `backend/app/agents/analysis/fundamental_agent.py`

### Prompt Design (adapted from financial-advisor data_analyst prompt)

The original data_analyst prompt uses Google Search iteratively to gather SEC filings, news, sentiment. Our adaptation:
- **Remove** the iterative search pattern — research is already done upstream
- **Keep** the 6-section report structure (Executive Summary, SEC Filings, News/Sentiment, Analyst Commentary, Risks & Opportunities, Key References)
- **Add** instruction to use `get_ticker_overview` and `get_price_history` tools for live market data
- **Read** `section_research_findings` + optional ticker from state

### Agent Definition

```python
fundamental_analysis_agent = LlmAgent(
    model=config.worker_model,
    name="fundamental_analysis_agent",
    description="Analyses company fundamentals: earnings, revenue, margins, valuation, and analyst consensus for a given ticker.",
    instruction=FUNDAMENTAL_ANALYSIS_PROMPT,
    tools=[
        get_ticker_overview,   # yfinance: P/E, market cap, margins, etc.
        get_price_history,     # yfinance: recent OHLCV data
    ],
    output_key="fundamental_analysis_output",
)
```

### Ticker Resolution

The pipeline does NOT have a dedicated step that writes `ticker` to session state.
Instead, the fundamental agent must **extract the ticker from research findings**:

- Scan `section_research_findings` for stock ticker references (e.g., "NVDA",
  "AAPL", "$TSLA", "ticker: MSFT")
- If exactly one ticker is clearly identifiable → use it with `get_ticker_overview`
  and `get_price_history`
- If multiple tickers are mentioned → pick the primary subject of the research,
  or analyse the most prominent one and note others
- If no ticker is identifiable → do NOT call yfinance tools; base analysis
  entirely on the research findings

This avoids a hard dependency on a `{ticker}` state key that may not exist.

### Prompt Template Structure

```
You are a senior equity research analyst...

<RESEARCH_FINDINGS>
{section_research_findings}
</RESEARCH_FINDINGS>

Your job:
1. First, identify the primary stock ticker from the research findings.
   Look for explicit ticker symbols (e.g., NVDA, AAPL, $TSLA) or company names
   that map to a known ticker. If no clear ticker is identifiable, skip tool calls
   and work from the research findings alone.
2. If a ticker is identified, use get_ticker_overview and get_price_history
   to enrich your analysis with live market data.
3. Synthesize research findings with tool data into a structured report:
   - Executive Summary (3-5 bullet points)
   - Financial Performance & Earnings Analysis
   - Valuation Assessment (P/E, P/S, EV/EBITDA context)
   - Market Sentiment & Analyst Consensus
   - Key Risks & Opportunities
4. Base analysis solely on research findings + tool data.
5. Be specific with numbers. No vague statements.
6. When citing data from yfinance tools, note the source inline (e.g.,
   "according to Yahoo Finance data as of [date]"). These tool-sourced claims
   do NOT use [src-N] citation IDs — only web research findings carry those.
```

### State I/O

| Direction | State Key | Description |
|-----------|----------|-------------|
| Input | `section_research_findings` | Research text |
| Output | `fundamental_analysis_output` | Fundamental analysis report text |

Note: No `ticker` state key dependency. The agent extracts tickers from findings.

---

## Step 4: Risk Analysis Agent

**File**: `backend/app/agents/analysis/risk_agent.py`

### Prompt Design (adapted from financial-advisor risk_analyst prompt)

The original risk_analyst prompt is **very high quality** — 7 risk categories, detailed assessment/mitigation structure. Key adaptations:
- **Remove** dependency on `provided_trading_strategy`, `provided_execution_strategy`, `user_risk_attitude` etc. — these inputs don't exist in our pipeline
- **Replace** with reading `section_research_findings`, `macro_analysis_output`, `fundamental_analysis_output` from state
- **Keep** the 7 risk category framework (Market, Liquidity, Counterparty, Operational, Strategy, Psychological, Overall Alignment)
- **Simplify** to focus on investment research risk assessment rather than trade execution risk
- **MUST preserve** the legal disclaimer verbatim from the original prompt

### Agent Definition

```python
risk_analysis_agent = LlmAgent(
    model=config.worker_model,
    name="risk_analysis_agent",
    description="Provides comprehensive risk assessment covering market, liquidity, operational, and strategy-specific risks with mitigation recommendations.",
    instruction=RISK_ANALYSIS_PROMPT,
    tools=[],  # No tools needed — synthesises from upstream outputs
    output_key="risk_analysis_output",
)
```

### Prompt Template Structure

```
Objective: Generate a detailed risk analysis for the investment research topic...

<RESEARCH_FINDINGS>
{section_research_findings}
</RESEARCH_FINDINGS>

<MACRO_ANALYSIS>
{macro_analysis_output?}
</MACRO_ANALYSIS>

<FUNDAMENTAL_ANALYSIS>
{fundamental_analysis_output?}
</FUNDAMENTAL_ANALYSIS>

Note: Use `{key?}` (optional placeholder) for macro/fundamental outputs since
these agents may be skipped by the coordinator. ADK silently replaces missing
optional keys with empty string instead of throwing KeyError.

Produce a structured risk report:
1. Executive Summary of Risks
2. Market Risks (directional, volatility, gap, rate sensitivity, currency)
3. Liquidity Risks
4. Counterparty & Platform Risks (if applicable)
5. Operational & Regulatory Risks
6. Strategy-Specific & Model Risks
7. Overall Assessment & Concluding Remarks

[LEGAL DISCLAIMER — verbatim from original prompt]
"Important Disclaimer: For Educational and Informational Purposes Only..."
(full text preserved exactly as in risk_analyst/prompt.py)
```

### State I/O

| Direction | State Key | Description |
|-----------|----------|-------------|
| Input | `section_research_findings` | Research text |
| Input | `macro_analysis_output` | May be empty if macro agent was skipped |
| Input | `fundamental_analysis_output` | May be empty if fundamental agent was skipped |
| Output | `risk_analysis_output` | Risk analysis report with disclaimer |

---

## Step 5: Analysis Coordinator

**File**: `backend/app/agents/analysis/coordinator.py`

### Role

The coordinator is an LlmAgent that:
1. Reads the research topic and `section_research_findings` from state
2. Classifies the topic type (macro / equity / mixed / general)
3. Decides which analysis agents to invoke via AgentTool
4. Calls them in logical order (macro → fundamental → risk)
5. Writes a brief `analysis_summary` to state

### Agent Definition

```python
from google.adk.tools.agent_tool import AgentTool

analysis_coordinator = LlmAgent(
    model=config.worker_model,
    name="analysis_coordinator",
    description="Coordinates domain-specific financial analysis by routing research findings to the appropriate specialist agents.",
    instruction=COORDINATOR_PROMPT,
    tools=[
        AgentTool(macro_analysis_agent),
        AgentTool(fundamental_analysis_agent),
        AgentTool(risk_analysis_agent),
    ],
    output_key="analysis_summary",
)
```

### Prompt Template

```
You are a senior investment research coordinator. Your job is to route completed
research findings through the appropriate specialist analysis agents.

<RESEARCH_TOPIC>
{research_plan}
</RESEARCH_TOPIC>

<RESEARCH_FINDINGS>
{section_research_findings}
</RESEARCH_FINDINGS>

## Decision Logic

Classify the research topic and invoke the appropriate agents:

1. **Macro/Policy topic** (central bank policy, interest rates, inflation, GDP, trade policy):
   → Call macro_analysis_agent, then risk_analysis_agent
   → Skip fundamental_analysis_agent

2. **Equity/Company topic** (specific stock, earnings, company analysis, sector comparison):
   → Call fundamental_analysis_agent, then risk_analysis_agent
   → Skip macro_analysis_agent

3. **Mixed topic** (e.g., "Fed rate impact on tech stocks", "inflation effect on AAPL"):
   → Call macro_analysis_agent, then fundamental_analysis_agent, then risk_analysis_agent

4. **General/Other topic** (geopolitics, industry trends without specific ticker):
   → Call risk_analysis_agent only

## Rules
- ALWAYS call risk_analysis_agent last (it reads outputs from the other two)
- ALWAYS call at least risk_analysis_agent
- Pass the research findings as context when calling each agent
- After all agents complete, write a 3-5 sentence synthesis summarising the key takeaways

## Output Format
First, state your routing decision explicitly:
```
Routing: macro=true/false, fundamental=true/false, risk=true
Topic classification: [macro|equity|mixed|general]
```
Then invoke the agents in order. After all complete, write a brief analysis
summary that ties together the outputs from all invoked agents.
```

### State I/O

| Direction | State Key | Description |
|-----------|----------|-------------|
| Input | `research_plan` | The approved research plan |
| Input | `section_research_findings` | Completed research |
| Output | `analysis_summary` | Brief coordination summary |
| Side-effect | `macro_analysis_output` | Set by macro agent if invoked |
| Side-effect | `fundamental_analysis_output` | Set by fundamental agent if invoked |
| Side-effect | `risk_analysis_output` | Set by risk agent if invoked |

---

## Step 6: Wire Into Pipeline (backend/app/agent.py)

### 6a. Import the coordinator

```python
from .agents.analysis.coordinator import analysis_coordinator
```

### 6b. Insert into research_pipeline

Change the `research_pipeline` SequentialAgent to include `analysis_coordinator` between the LoopAgent and `report_composer`:

```python
research_pipeline = SequentialAgent(
    name="research_pipeline",
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
        analysis_coordinator,   # ← NEW
        report_composer,
    ],
)
```

### 6c. Update report_composer instruction

Add analysis outputs as additional INPUT DATA sections. **All analysis keys MUST
use optional placeholder syntax `{key?}`** since any analysis agent may be skipped:

```python
instruction="""
    ...
    ### INPUT DATA
    *   Research Plan: `{research_plan}`
    *   Research Findings: `{section_research_findings}`
    *   Citation Sources: `{sources}`
    *   Report Structure: `{report_sections}`
    *   Macro Analysis: `{macro_analysis_output?}`            ← NEW (optional)
    *   Fundamental Analysis: `{fundamental_analysis_output?}` ← NEW (optional)
    *   Risk Analysis: `{risk_analysis_output?}`               ← NEW (optional)
    *   Analysis Summary: `{analysis_summary?}`                ← NEW (optional)
    ...

    ### NEW: Analysis Integration
    If analysis outputs are present (non-empty), integrate them into the report:
    - Follow the Report Structure as the primary skeleton. If the structure
      does not contain an analysis chapter, append a "Financial Analysis &
      Risk Assessment" chapter at the end (before any conclusion).
    - Integrate analysis findings into the report using the research [src-N]
      citation IDs where the analysis references web-sourced claims.
    - For data sourced from financial tools (yfinance, FRED, Fed PDFs), the
      analysis agents have already noted the source inline (e.g., "according
      to Yahoo Finance data"). Do NOT fabricate [src-N] IDs for these — leave
      the inline attribution as-is.
    - ALWAYS include the risk disclaimer from the risk analysis output at the
      end of the report.
    - If an analysis output is empty/missing, skip that subsection silently.
    ...
"""
```

---

## Step 7: Frontend — Agent Label Map & Function Call Mapping

**File**: `frontend/src/App.tsx`

### 7a. Update `getEventTitle` switch (around line 177)

```typescript
const getEventTitle = (agentName: string): string => {
    switch (agentName) {
      // ... existing cases ...
      case "analysis_coordinator":
        return "Coordinating Financial Analysis";
      case "macro_analysis_agent":
        return "Macro Policy Analysis";
      case "fundamental_analysis_agent":
        return "Fundamental Analysis";
      case "risk_analysis_agent":
        return "Risk Assessment";
      default:
        return `Processing (${agentName || 'Unknown Agent'})`;
    }
  };
```

### 7b. Map AgentTool function calls to friendly titles

**Important**: When `analysis_coordinator` invokes sub-agents via `AgentTool`,
the SSE events arrive as `functionCall.name` / `functionResponse.name` (e.g.,
`"macro_analysis_agent"`), NOT as separate agent text events. The current code
at line 214-230 already renders these as `"Function Call: macro_analysis_agent"`.

Update the function call/response title generation to use friendly names:

```typescript
// Add a helper function for mapping function names to friendly titles
const getFunctionTitle = (funcName: string, type: 'call' | 'response'): string => {
    const friendlyNames: Record<string, string> = {
        "macro_analysis_agent": "Macro Policy Analysis",
        "fundamental_analysis_agent": "Fundamental Analysis",
        "risk_analysis_agent": "Risk Assessment",
    };
    const prefix = type === 'call' ? '▶' : '✓';
    if (friendlyNames[funcName]) {
        return `${prefix} ${friendlyNames[funcName]}`;
    }
    return `Function ${type === 'call' ? 'Call' : 'Response'}: ${funcName}`;
};
```

Then replace the hardcoded `Function Call: ${functionCall.name}` and
`Function Response: ${functionResponse.name}` with calls to `getFunctionTitle`.

---

## Implementation Order & Dependencies

```
Step 1: Directory setup                          (no deps)
  │
  ├── Step 2: macro_agent.py                     (needs tools already in backend/app/tools/)
  ├── Step 3: fundamental_agent.py               (needs tools already in backend/app/tools/)
  ├── Step 4: risk_agent.py                      (no tool deps)
  │
  └── Step 5: coordinator.py                     (depends on Steps 2-4)
        │
        └── Step 6: Wire into agent.py           (depends on Step 5)
              │
              └── Step 7: Frontend label map     (depends on Step 6 for testing)
```

Steps 2, 3, 4 can be done in parallel. Steps 5-7 are sequential.

---

## Testing Plan

### Automated Smoke Tests (`uv run pytest`)

Before manual testing, add a minimal test file `backend/tests/test_analysis_imports.py`:

```python
"""Smoke tests: analysis modules import cleanly and agents are well-formed."""

def test_imports():
    from app.agents.analysis.macro_agent import macro_analysis_agent
    from app.agents.analysis.fundamental_agent import fundamental_analysis_agent
    from app.agents.analysis.risk_agent import risk_analysis_agent
    from app.agents.analysis.coordinator import analysis_coordinator
    assert macro_analysis_agent.name == "macro_analysis_agent"
    assert fundamental_analysis_agent.name == "fundamental_analysis_agent"
    assert risk_analysis_agent.name == "risk_analysis_agent"
    assert analysis_coordinator.name == "analysis_coordinator"

def test_optional_keys_in_prompts():
    """Verify that skipped analysis outputs won't cause KeyError."""
    from app.agents.analysis.risk_agent import RISK_ANALYSIS_PROMPT
    assert "{macro_analysis_output?}" in RISK_ANALYSIS_PROMPT
    assert "{fundamental_analysis_output?}" in RISK_ANALYSIS_PROMPT

def test_pipeline_includes_coordinator():
    from app.agent import research_pipeline
    agent_names = [a.name for a in research_pipeline.sub_agents]
    assert "analysis_coordinator" in agent_names
    assert agent_names.index("analysis_coordinator") < agent_names.index("report_composer_with_citations")
```

### Integration Tests (manual via `uv run adk web`)

1. **Macro-only topic**: Query "美联储最新利率决议分析"
   - Expected: coordinator outputs `Routing: macro=true, fundamental=false, risk=true`
   - Verify: `macro_analysis_output` and `risk_analysis_output` in state
   - Verify: Final report includes macro analysis section + risk disclaimer

2. **Equity topic**: Query "NVDA 最新财报深度解读"
   - Expected: coordinator outputs `Routing: macro=false, fundamental=true, risk=true`
   - Verify: `fundamental_analysis_output` and `risk_analysis_output` in state
   - Verify: fundamental agent extracts "NVDA" from findings and calls yfinance tools
   - Verify: Final report includes fundamental analysis + risk disclaimer

3. **Mixed topic**: Query "美联储加息对科技股的影响"
   - Expected: coordinator calls all three agents
   - Verify: All three outputs present in state
   - Verify: Final report includes all analysis sections

4. **Frontend**: ActivityTimeline shows friendly labels for AgentTool function
   calls (e.g., "▶ Macro Policy Analysis" instead of "Function Call: macro_analysis_agent")

### Regression Checks

- Citation system still works: `tavily_search` writes `sources` dict with
  `[src-N]` IDs → `report_composer` uses `<cite source="src-N" />` tags →
  `citation_replacement_callback` replaces with markdown links. Verify that
  analysis integration does not corrupt existing source IDs.
- HITL plan-approval flow unaffected
- Report composer still uses `include_contents="none"` and reads from state only
- Existing tools (tavily_search, yfinance, etc.) still function normally
- Skipped analysis agents produce no `KeyError` — optional placeholders `{key?}` resolve to empty string

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Analysis agents add significant latency | User waits longer | Coordinator skips irrelevant agents; keep prompts concise |
| AgentTool state isolation | Sub-agents can't read parent state | ADK AgentTool shares session state by default — verify in testing |
| Missing state keys cause KeyError | Runtime crash | All analysis keys use `{key?}` optional syntax; smoke test validates |
| Tool data gets fake citation IDs | Misleading references | Prompts explicitly state tool data uses inline attribution, not `[src-N]` |
| Risk disclaimer gets lost | Legal/compliance issue | Hardcode disclaimer in risk_agent prompt; report_composer always appends it |
| Coordinator misclassifies topic | Wrong agents invoked | Require explicit `Routing:` output; always run risk as fallback |
| No ticker in state for fundamental agent | yfinance tools not called | Agent extracts ticker from research findings; no state dependency |
| Frontend doesn't show specialist agents | Invisible analysis progress | Map both `getEventTitle` and `functionCall.name` to friendly labels |

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/app/agents/__init__.py` | CREATE | Empty init |
| `backend/app/agents/analysis/__init__.py` | CREATE | Empty init |
| `backend/app/agents/analysis/macro_agent.py` | CREATE | Macro analysis LlmAgent + prompt |
| `backend/app/agents/analysis/fundamental_agent.py` | CREATE | Fundamental analysis LlmAgent + prompt |
| `backend/app/agents/analysis/risk_agent.py` | CREATE | Risk analysis LlmAgent + prompt |
| `backend/app/agents/analysis/coordinator.py` | CREATE | Coordinator LlmAgent + AgentTool wiring |
| `backend/app/agent.py` | MODIFY | Import coordinator; insert into pipeline; update report_composer prompt with `{key?}` optional placeholders |
| `backend/tests/test_analysis_imports.py` | CREATE | Smoke tests: imports, optional keys, pipeline order |
| `frontend/src/App.tsx` | MODIFY | Add 4 new cases to getEventTitle; add `getFunctionTitle` helper for AgentTool SSE events |
