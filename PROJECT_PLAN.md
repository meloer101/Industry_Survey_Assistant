# Project Plan: AI Investment Research Platform

## Goal

Build a portfolio-grade, full-stack AI investment research assistant by composing
three Google ADK sample projects:

- **Backbone**: deep-search (architecture, HITL, frontend, citation system)
- **Domain tools**: fomc-research (statement comparison, transcript, rate probability)
- **Analysis content**: financial-advisor (risk, trading strategy, execution prompts)

---

## Phases at a Glance

| Phase | Name | Deliverable | Est. Complexity |
|-------|------|-------------|-----------------|
| 0 | Environment Setup | Dev environment running | Low |
| 1 | Deep Search Port | Working full-stack baseline (no finance changes) | Medium |
| 2 | Financial Domain Tools | 3 new backend tools replacing BigQuery + adding data sources | Medium |
| 3 | Analysis Pipeline | `analysis_coordinator` + 3 analysis sub-agents wired in | High |
| 4 | Frontend: Investment UX | Finance-specific UI enhancements on top of deep-search frontend | Medium |
| 5 | Integration & Polish | End-to-end testing, error handling, disclaimers, README | Medium |

---

## Phase 0 — Environment Setup

**Goal**: Both backend and frontend can start cleanly on a fresh machine.

### Tasks

- [ ] Create `backend/` directory with `pyproject.toml`
  - Dependencies: `google-adk`, `python-dotenv`, `yfinance`, `pypdf`, `requests`
  - Python 3.11+, managed with `uv`
- [ ] Create `backend/app/.env` (from `.env.example` in deep-search reference)
- [ ] Create `frontend/` directory by copying deep-search's `frontend/` structure
  - Copy `package.json`, `vite.config.ts`, `tsconfig.json`, `components.json`
  - Copy all `src/` files as a starting baseline
- [ ] Verify `uv run adk web` starts in `backend/`
- [ ] Verify `npm run dev` starts in `frontend/` and proxies to backend

### Acceptance Criteria

- `http://localhost:5173` loads the Deep Search welcome screen (copied as-is)
- Backend health check at `http://localhost:8000/api/docs` returns 200

---

## Phase 1 — Deep Search Port (Full-Stack Baseline)

**Goal**: A working clone of deep-search under our new project structure, with
zero modifications to the reference source. This validates the architecture
before any investment-specific changes.

### Tasks

#### Backend

- [ ] Create `backend/app/config.py`
  — Copy logic from `deep-search_副本/app/config.py`
  — Change model names to latest available (`gemini-2.5-pro` for both worker/critic)
  — Keep `max_search_iterations: int = 3` as default (tune later)

- [ ] Create `backend/app/agent.py`
  — Port all agent definitions from `deep-search_副本/app/agent.py`
  — Agents to port (in dependency order):
    1. Pydantic models: `SearchQuery`, `Feedback`
    2. Callbacks: `collect_research_sources_callback`, `citation_replacement_callback`
    3. Custom agent: `EscalationChecker`
    4. LLM agents: `plan_generator`, `section_planner`, `section_researcher`,
       `research_evaluator`, `enhanced_search_executor`, `report_composer`
    5. Composite agents: `research_pipeline` (SequentialAgent), `interactive_planner_agent`
    6. `root_agent = interactive_planner_agent` and `app = App(root_agent, name="app")`

- [ ] Create `backend/app/__init__.py`

#### Frontend

- [ ] Copy `deep-search_副本/frontend/src/` into `frontend/src/` as starting baseline
- [ ] Verify SSE event parsing handles all agent names correctly
  (check `getEventTitle` switch in `App.tsx` covers all ported agent names)
- [ ] Verify citation links render in the final report

### Acceptance Criteria

- User can enter a research topic, approve the generated plan, and receive a
  full cited report in the browser
- ActivityTimeline shows each agent step in real-time
- Final report contains clickable `[Source Title](URL)` citation links
- No code in `参考项目代码/` has been modified

---

## Phase 2 — Financial Domain Tools

**Goal**: Replace BigQuery dependency with lightweight alternatives, and add
financial data sources that make the research more domain-specific.

### Tasks

#### Tool 1: Market Data (`backend/app/tools/market_data.py`)

- [ ] Implement `get_ticker_overview(ticker: str)` using `yfinance`
  — Returns: company name, sector, market cap, P/E, 52-week range, recent price
- [ ] Implement `get_price_history(ticker: str, period: str)` using `yfinance`
  — Returns: OHLCV data as formatted text for LLM consumption
- [ ] Register as ADK tool with `ToolContext`

#### Tool 2: Rate Move Probability (`backend/app/tools/rate_probability.py`)

Replaces `fomc-research_副本/fomc_research/shared_libraries/price_utils.py` (BigQuery).

- [ ] Implement `get_rate_move_probability(meeting_date: str)` by:
  - Fetching CME FedWatch page via `google_search` or HTTP GET
  - Parsing the implied probability text from the page
  - Falling back to FRED API for Fed Funds futures data if needed
- [ ] Return same output format as original: `{"odds of 25bp cut": 0.72, "odds of no cut": 0.28}`
- [ ] Register as ADK tool

#### Tool 3: Statement Comparison (`backend/app/tools/compare_statements.py`)

Adapted from `fomc-research_副本/fomc_research/tools/compare_statements.py`.

- [ ] Port PDF download + text extraction (remove all GCS/artifact store dependencies)
  — Use local temp files instead of ADK artifact store
  — Use `pypdf` for PDF text extraction
- [ ] Port `create_html_redline` diff logic from `fomc-research_副本/fomc_research/shared_libraries/file_utils.py`
- [ ] Return redline diff as plain text (unified diff format) rather than HTML artifact
- [ ] Register as ADK tool

#### Tool 4: FOMC Transcript Fetcher (`backend/app/tools/fetch_transcript.py`)

- [ ] Port `fetch_transcript_tool` from `fomc-research_副本/fomc_research/tools/fetch_transcript.py`
- [ ] Remove ADK artifact store dependency — return transcript text directly
- [ ] Register as ADK tool

#### Integration

- [ ] Add tools to `section_researcher` and/or `enhanced_search_executor` tool list
  so the research agents can use financial data sources when relevant
- [ ] Test each tool independently with a known ticker/date before wiring into agents

### Acceptance Criteria

- `get_ticker_overview("NVDA")` returns valid data from yfinance
- `get_rate_move_probability("2025-03-19")` returns probability dict without BigQuery
- Statement comparison works on two Fed PDF URLs without GCP credentials
- Research agents use financial tools when the topic is finance-related

---

## Phase 3 — Analysis Pipeline Extension

**Goal**: After the research pipeline completes, route findings through
domain-specific financial analysis agents before report composition.

### Architecture Change

Insert `analysis_coordinator` into `research_pipeline` (SequentialAgent) between
`enhanced_search_executor` (end of LoopAgent) and `report_composer`:

```
research_pipeline (SequentialAgent):
  section_planner
  section_researcher
  LoopAgent(research_evaluator, EscalationChecker, enhanced_search_executor)
  ──── NEW ────
  analysis_coordinator   ← reads section_research_findings from state
  ──────────────
  report_composer
```

### Tasks

#### Macro Analysis Agent (`backend/app/agents/analysis/macro_agent.py`)

- [ ] Port and adapt `fomc-research_副本/fomc_research/sub_agents/analysis_agent_prompt.py`
- [ ] Generalise prompt from FOMC-only to broader macro policy analysis
  (Fed, ECB, PBOC; inflation, rates, employment data)
- [ ] Input: reads `section_research_findings` from session state
- [ ] Output: `output_key="macro_analysis_output"`
- [ ] Add `rate_probability_tool` and `fetch_transcript_tool` to tool list

#### Fundamental Analysis Agent (`backend/app/agents/analysis/fundamental_agent.py`)

- [ ] Adapt `financial-advisor_副本/financial_advisor/sub_agents/data_analyst/prompt.py`
- [ ] Focus on: earnings, revenue, margins, valuation multiples, analyst consensus
- [ ] Input: reads `section_research_findings` + ticker from session state (if present)
- [ ] Output: `output_key="fundamental_analysis_output"`
- [ ] Add `market_data_tool` (yfinance wrapper) to tool list

#### Risk Analysis Agent (`backend/app/agents/analysis/risk_agent.py`)

- [ ] Port `financial-advisor_副本/financial_advisor/sub_agents/risk_analyst/prompt.py`
  — This prompt is already very high quality; keep it mostly intact
- [ ] Adapt to read from research findings rather than coordinator-provided inputs
- [ ] Input: reads `section_research_findings`, `macro_analysis_output`,
  `fundamental_analysis_output` from session state
- [ ] Output: `output_key="risk_analysis_output"`
- [ ] Financial disclaimer must remain in the prompt (from original)

#### Analysis Coordinator (`backend/app/agents/analysis/coordinator.py`)

- [ ] Create `analysis_coordinator` as `LlmAgent` with `AgentTool` wrappers
- [ ] Coordinator prompt must:
  - Read the research topic and findings from session state
  - Decide which of the three analysis agents are relevant to the topic
    (macro-only, fundamental-only, macro+risk, all three, etc.)
  - Call relevant agents via AgentTool in logical order
  - Write a brief synthesis note to `analysis_summary` state key
- [ ] Register `macro_analysis_agent`, `fundamental_analysis_agent`,
  `risk_analysis_agent` as `AgentTool` items in coordinator's `tools=[]`

#### Wire Into Pipeline

- [ ] Add `analysis_coordinator` to `research_pipeline` SequentialAgent
  between LoopAgent and `report_composer`
- [ ] Update `report_composer` instruction to include analysis outputs:
  `{macro_analysis_output}`, `{fundamental_analysis_output}`, `{risk_analysis_output}`
  as additional INPUT DATA sections

#### Frontend: Agent Label Map

- [ ] Extend `getEventTitle()` in `App.tsx` with new agent names:
  `"analysis_coordinator"`, `"macro_analysis_agent"`,
  `"fundamental_analysis_agent"`, `"risk_analysis_agent"`

### Acceptance Criteria

- For a macro topic (e.g., "Fed rate cuts impact on bonds"), coordinator invokes
  macro + risk agents but skips fundamental
- For a stock topic (e.g., "NVDA earnings"), coordinator invokes fundamental + risk
- Final report includes analysis section with citations AND risk disclaimer
- ActivityTimeline shows analysis agents firing after research completes

---

## Phase 4 — Frontend: Investment UX

**Goal**: Differentiate the UI from generic deep-search to feel like an investment
research tool, without breaking the underlying SSE/session machinery.

### Tasks

#### Welcome Screen

- [ ] Update `WelcomeScreen.tsx` copy: platform name, tagline, example queries
  (replace generic examples with financial topics)
- [ ] Add example query chips: "美联储降息路径分析", "NVDA Q4财报解读",
  "中美贸易摩擦对半导体的影响"

#### Input Form

- [ ] Add optional ticker symbol field to `InputForm.tsx`
  — If provided, appended to the research query as context
- [ ] Add research type selector (Macro / Equity / General) — hints to
  `analysis_coordinator` which agents to prioritise

#### Analysis Panel (`frontend/src/components/AnalysisPanel.tsx`)

- [ ] NEW component: tabbed panel showing analysis outputs separately
  - Tab 1: Full report (existing `report_composer` output)
  - Tab 2: Macro analysis (if present)
  - Tab 3: Fundamental (if present)
  - Tab 4: Risk Assessment (if present)
- [ ] Panel appears only when analysis outputs are present in SSE state delta

#### Activity Timeline

- [ ] Extend icon/label mapping in `ActivityTimeline.tsx` for financial agents
- [ ] Add colour differentiation: blue for research steps, amber for analysis steps

#### Session Management

- [ ] Verify `uuidv4()` session IDs work correctly (already in deep-search source)
- [ ] Do NOT add user auth in this phase — single anonymous user is fine for portfolio

### Acceptance Criteria

- Welcome screen shows investment-themed examples
- Optional ticker field passes context into the research query
- Tabbed analysis panel shows when analysis agents have fired
- ActivityTimeline colour-codes research vs analysis steps

---

## Phase 5 — Integration, Polish & Documentation

**Goal**: Production-quality error handling, end-to-end test scenarios, and a
README suitable for a portfolio.

### Tasks

#### Error Handling

- [ ] Backend: wrap financial tool calls in try/except; return graceful error
  messages to agents (not stack traces)
- [ ] Backend: add rate limit callback (port `rate_limit_callback` from
  `fomc-research_副本/fomc_research/shared_libraries/callbacks.py`) to
  analysis agents
- [ ] Frontend: handle backend unavailable state (already in deep-search source,
  verify it works with new backend)

#### End-to-End Test Scenarios

Run these manually and verify output quality:

- [ ] **Macro scenario**: "分析美联储2025年降息对美债的影响"
  - Expect: macro + risk agents fire, no fundamental analysis
- [ ] **Equity scenario**: "解读英伟达2025财年业绩及前景"
  - Expect: fundamental + risk agents fire, market_data_tool used
- [ ] **Cross-topic scenario**: "美联储加息背景下科技股的估值压力"
  - Expect: all three analysis agents fire
- [ ] **FOMC-specific scenario**: "分析2025年3月FOMC会议声明变化"
  - Expect: statement comparison tool and transcript tool used

#### Configuration Tuning

- [ ] Tune `max_search_iterations` based on quality/latency balance (start: 3)
- [ ] Tune `plan_generator` prompt for financial topics (add finance-specific
  plan goal examples)
- [ ] Review `research_evaluator` prompt — add finance-specific quality criteria
  (e.g., check for data recency, source credibility for financial claims)

#### README

- [ ] Write `README.md` with: project description, architecture diagram (ASCII),
  setup instructions, example queries, tech stack credits
- [ ] Add architecture diagram showing agent hierarchy

### Acceptance Criteria

- All 4 test scenarios produce complete, cited reports with relevant analysis
- No unhandled exceptions reach the frontend
- README is clear enough for a portfolio reviewer to understand the system

---

## Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backbone project | deep-search | More sophisticated ADK patterns (LoopAgent, BuiltInPlanner, structured output, full frontend) |
| BigQuery replacement | yfinance + FRED API + CME scraping | No GCP infra dependency; public data; works locally |
| Orchestration pattern | Hybrid: SequentialAgent+LoopAgent for research, AgentTool for analysis | Research needs deterministic quality loop; analysis needs topic-conditional flexible invocation |
| HITL scope (v1) | Plan-approve only (deep-search pattern) | Simpler to implement correctly; analysis HITL is Phase 2 |
| Citation system | Preserved exactly from deep-search | Critical for research credibility; non-negotiable |
| Analysis agent type | `LlmAgent` with `AgentTool` wrappers | Coordinator reads each result before deciding next step |
| User auth | Skipped (single anonymous user) | Portfolio focus; add OAuth in future if needed |
| LLM backend | DeepSeek via LiteLLM (`google.adk.models.lite_llm.LiteLlm`) | No Google API dependency; DeepSeek cost-effective; LiteLLM acts as OpenAI-compatible translation layer |
| Model selection | worker/critic → `deepseek/deepseek-v4-flash`; evaluator/reasoner → `deepseek/deepseek-v4-pro` | v4-flash: fast + cheap for high-frequency calls; v4-pro: thinking mode for quality-critical evaluation |
| Web search tool | Tavily Search API (replacing Gemini-native `google_search`) | `google_search` grounding is Gemini-exclusive; Tavily returns full page content (not just snippets), purpose-built for AI agents, 1000 free calls/month |

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| CME FedWatch page structure changes, scraper breaks | Medium | Implement FRED fallback; document the data source |
| `yfinance` rate limits during heavy testing | Low | Add `time.sleep` between calls; cache results in session state |
| Gemini grounding_metadata format changes, citation system breaks | Low | Pin ADK version; add fallback (report without citations) |
| Analysis coordinator calls wrong agents or skips analysis entirely | Medium | Strong coordinator prompt with explicit examples; add output validation |
| `LoopAgent` runs `max_search_iterations` every time, slow for simple queries | Medium | Tune prompt: evaluator should grade "pass" quickly for simple topics |
| `GET /dev/apps/app/build_graph` returns 500 (ADK Dev UI "Info" tab broken) | Confirmed | **Known ADK + LiteLLM integration limitation** — `LiteLlm` objects are not Pydantic-serializable; ADK tries to serialize the full agent definition including the `model` field. `build_graph_image` (visual graph) works fine (200 OK). Agent execution, SSE streaming, and sessions are completely unaffected. Revisit in Phase 5 when ADK may have patched this; no architecture change warranted. |
| DeepSeek API transient connection drops (`ssl: [None]`) mid-pipeline | Medium | Transient network issue; retry the session. Future mitigation: add `num_retries=3` to `LiteLlm(...)` in `config.py` during Phase 5 polish. |