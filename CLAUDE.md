# AI Investment Research Platform — CLAUDE.md

## Project Overview

A full-stack AI investment research assistant. The user inputs a research topic
(e.g., "美联储加息对科技股的影响") → the system proposes a structured research
plan → user approves via HITL → iterative web research with quality self-checking
→ domain-specific financial analysis pipeline → final cited report with source
attribution.

### Source Projects (READ-ONLY)

| Project | Role in this platform |
|---------|----------------------|
| `deep-search_副本` | **Backbone**: agent architecture, HITL planning, LoopAgent refinement, citation system, React frontend |
| `fomc-research_副本` | **Domain tools**: statement comparison (PDF diff), transcript fetching, rate probability (BigQuery replaced) |
| `financial-advisor_副本` | **Analysis prompts**: risk assessment, trading strategy, execution planning |

---

## ABSOLUTE CONSTRAINT

**NEVER modify any file under `参考项目代码/`.** This directory is read-only
reference material. All new code lives exclusively under `backend/` and `frontend/`.
Violation of this rule is not acceptable under any circumstance.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent framework | Google ADK (`google-adk`) |
| LLM | `gemini-2.5-pro` (worker) / `gemini-2.5-pro` (critic) — update to latest available |
| Backend server | ADK built-in `App` server (provides `/api/run_sse`, `/api/apps/...`) |
| Frontend | React 18 + TypeScript + Vite |
| UI components | shadcn/ui + Tailwind CSS |
| Streaming | SSE (Server-Sent Events) — existing pattern from deep-search |
| Market data | `yfinance` (price/fundamentals), FRED API (macro), CME FedWatch page scraping (rate probability) |
| PDF processing | `pypdf` or `pdfminer.six` (for statement comparison tool) |
| Package manager | `uv` (Python), `npm` (Node) |

---

## Directory Structure

```
/
├── 参考项目代码/              ← READ-ONLY, never touch
│   ├── deep-search_副本/
│   ├── fomc-research_副本/
│   └── financial-advisor_副本/
│
├── backend/
│   ├── pyproject.toml
│   └── app/
│       ├── __init__.py
│       ├── agent.py           ← root agent + all agent definitions
│       ├── config.py          ← model config, env loading
│       ├── agents/
│       │   ├── research/      ← research pipeline (ported from deep-search)
│       │   │   └── pipeline.py
│       │   └── analysis/      ← financial analysis coordinator + sub-agents
│       │       ├── coordinator.py
│       │       ├── macro_agent.py        (adapted from fomc analysis_agent)
│       │       ├── fundamental_agent.py  (adapted from financial-advisor data_analyst)
│       │       └── risk_agent.py         (adapted from financial-advisor risk_analyst)
│       └── tools/
│           ├── market_data.py      ← yfinance wrapper (replaces BigQuery)
│           ├── rate_probability.py ← CME FedWatch scraper (replaces price_utils.py)
│           ├── compare_statements.py ← ported from fomc, no cloud dependency
│           ├── fetch_transcript.py ← ported from fomc
│           └── news_search.py      ← financial news via google_search
│
├── frontend/                  ← ported from deep-search/frontend, extended
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── ActivityTimeline.tsx     ← ported, label map extended for finance
│       │   ├── ChatMessagesView.tsx     ← ported
│       │   ├── InputForm.tsx            ← ported, add ticker/topic fields
│       │   ├── WelcomeScreen.tsx        ← ported, investment-themed copy
│       │   ├── AnalysisPanel.tsx        ← NEW: tabbed analysis results view
│       │   └── ui/                      ← shadcn components, ported as-is
│       └── utils.ts
│
├── CLAUDE.md
└── PROJECT_PLAN.md
```

---

## Agent Architecture

### Hierarchy

```
root_agent  (interactive_planner_agent)
│   Pattern: LlmAgent — HITL plan-then-approve loop
│   Source: deep-search
│
├── plan_generator  [AgentTool]
│       Pattern: LlmAgent + google_search (limited)
│       Source: deep-search
│
└── research_pipeline  [SequentialAgent]
        Source: deep-search (extended)
        │
        ├── section_planner
        ├── section_researcher  (+ LoopAgent refinement)
        │   ├── research_evaluator  (output_schema=Feedback)
        │   ├── EscalationChecker   (custom BaseAgent)
        │   └── enhanced_search_executor
        │
        ├── analysis_coordinator   ← NEW insertion point
        │       Pattern: LlmAgent calling AgentTools
        │       Decides which analysis modules to invoke based on topic
        │       ├── macro_analysis_agent     [AgentTool]
        │       ├── fundamental_analysis_agent [AgentTool]
        │       └── risk_analysis_agent      [AgentTool]
        │
        └── report_composer  (citation_replacement_callback preserved)
```

### Orchestration Pattern Rationale

| Pipeline segment | Pattern | Why |
|-----------------|---------|-----|
| Research loop | `SequentialAgent` + `LoopAgent` | Deterministic quality-controlled flow; evaluator grades, EscalationChecker exits |
| Analysis modules | `AgentTool` inside `analysis_coordinator` | Topic-dependent: not every topic needs all three analysis types; LLM coordinator decides which to invoke and reads each result before proceeding |
| Root HITL | `LlmAgent` with `AgentTool(plan_generator)` | User must explicitly approve plan text before `research_pipeline` fires |

---

## Citation System (MUST be preserved)

The citation pipeline from deep-search is non-negotiable:

1. `collect_research_sources_callback` (after_agent_callback on research agents)
   — extracts `grounding_metadata` from Gemini responses, builds `sources` dict
   in session state, assigns short IDs (`src-1`, `src-2`, …)

2. `report_composer` writes `<cite source="src-N" />` inline tags

3. `citation_replacement_callback` (after_agent_callback on report_composer)
   — replaces tags with `[Title](URL)` markdown links

Never remove or bypass these callbacks. They are what makes research output
credible and traceable.

---

## BigQuery Replacement

`fomc-research_副本/fomc_research/shared_libraries/price_utils.py` uses
`google.cloud.bigquery` (hard dependency, initialises client at module load).
**Do not port this module.** Replace with:

- **CME FedWatch scraping** via `google_search` or direct HTTP fetch for
  implied rate move probabilities
- **FRED API** (`https://fred.stlouisfed.org/`) for macro time series
  (no auth required for public data)
- **`yfinance`** for futures prices if needed as a fallback

---

## HITL Checkpoints

**Phase 1 (MVP):** One checkpoint — user approves research plan before execution.
Exact behaviour mirrors `interactive_planner_agent` in deep-search.

**Phase 2 (future):** Second checkpoint — user reviews research findings summary
before the analysis coordinator fires. Requires adding a pause node in the
`SequentialAgent` pipeline.

---

## Key Reference Files

Read these before writing any new code:

```
参考项目代码/deep-search_副本/app/agent.py          ← full agent architecture to port
参考项目代码/deep-search_副本/frontend/src/App.tsx   ← SSE handling, session creation
参考项目代码/deep-search_副本/frontend/src/components/ActivityTimeline.tsx
参考项目代码/fomc-research_副本/fomc_research/tools/compare_statements.py
参考项目代码/fomc-research_副本/fomc_research/sub_agents/analysis_agent_prompt.py
参考项目代码/financial-advisor_副本/financial_advisor/sub_agents/risk_analyst/prompt.py
参考项目代码/financial-advisor_副本/financial_advisor/sub_agents/data_analyst/prompt.py
```

---

## Development Commands

```bash
# First-time setup: copy env templates
cp backend/app/.env.example backend/app/.env   # then fill in real API keys
cp frontend/.env.example frontend/.env          # set VITE_CLERK_PUBLISHABLE_KEY

# Backend (from project root)
cd backend
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (from project root)
cd frontend
npm install
npm run dev             # Vite dev server on :5173, proxied to :8000

# Run both together (from project root)
# Terminal 1: cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# Terminal 2: cd frontend && npm run dev
```

## Environment Variables (`backend/app/.env`)

See `backend/app/.env.example` for the full reference. Key variables:

```
DEEPSEEK_API_KEY=...         # Required: LLM provider
TAVILY_API_KEY=...            # Required: web search
CLERK_AUTH_ENABLED=true       # Browser user auth via Clerk Bearer tokens
CLERK_JWT_PUBLIC_KEY=...      # Clerk JWT public key / PEM
CLERK_AUTHORIZED_PARTIES=http://localhost:5173,http://127.0.0.1:5173
APP_API_KEY=...               # Optional internal/dev compatibility key
ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

---

## What NOT to Do

- **Do not import from `参考项目代码/`** — copy relevant code into `backend/`
- **Do not add `google.cloud.bigquery`** anywhere in the new codebase
- **Do not hardcode `u_999` as userId** — the frontend must use dynamic session IDs
  (the deep-search frontend already does this correctly with `uuidv4()`)
- **Do not use bare `Agent`** when `LlmAgent` will do — `LlmAgent` supports
  `output_key`, `output_schema`, `planner`, `disallow_transfer_to_*`
- **Do not remove `include_contents="none"` from `report_composer`** — it forces
  the composer to read only from session state, keeping output deterministic
- **Do not strip disclaimers from analysis agents** — financial advice disclaimers
  are required (source: financial-advisor prompts)
