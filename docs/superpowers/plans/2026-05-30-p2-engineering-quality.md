# P2 Engineering Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the P2 engineering quality gaps: real backend linting, dev-only frontend logs, paginated history, and Tavily client reuse.

**Architecture:** Keep backend changes focused in persistence/search/main and CI config. Keep frontend changes in API/logging helpers and HistoryPanel without changing the app's routing or chat state model.

**Tech Stack:** Python 3.12, pytest, ruff, GitHub Actions, React/Vite/Vitest.

---

### Task 1: Backend Ruff Lint

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `.github/workflows/ci.yml`
- Test: `backend/tests/test_ci_config.py`

- [x] **Step 1: Write failing static tests**
  - Assert `ruff` exists in the backend dev dependency group.
  - Assert CI runs `uv run ruff check .`.

- [x] **Step 2: Add ruff**
  - Add `ruff>=0.8.0` to `backend/pyproject.toml`.
  - Replace the manual `py_compile` lint list with `uv run ruff check .`.

### Task 2: Tavily Client Singleton

**Files:**
- Modify: `backend/app/tools/search.py`
- Test: `backend/tests/test_financial_tool_units.py`

- [x] **Step 1: Write failing test**
  - Monkeypatch `TavilyClient` with a fake class and call `tavily_search()` twice.
  - Assert only one client instance is constructed for the same API key.

- [x] **Step 2: Implement cache**
  - Add module-level `_client` and `_client_api_key`.
  - Add `_get_tavily_client(api_key)` to reuse the client until the key changes.

### Task 3: History Pagination

**Files:**
- Modify: `backend/app/persistence.py`
- Modify: `backend/app/main.py`
- Modify: `frontend/src/components/HistoryPanel.tsx`
- Test: `backend/tests/test_observability_persistence.py`
- Test: `frontend/src/__tests__/history-panel.test.tsx`

- [x] **Step 1: Write failing backend test**
  - Insert three sessions and call `list_research_history(limit=1, offset=1)`.
  - Assert it returns the second newest session.

- [x] **Step 2: Implement backend pagination**
  - Add `offset` parameter to `list_research_history`.
  - Add `limit` and `offset` query parameters to `/history/{user_id}`.

- [x] **Step 3: Write failing frontend test**
  - Render `HistoryPanel`, mock two pages, click “加载更多”, assert appended sessions.

- [x] **Step 4: Implement frontend load-more**
  - Track offset, `hasMore`, and incremental loading state.
  - Fetch `/api/history/{userId}?limit=20&offset=N`.

### Task 4: Dev-Only Frontend Logging

**Files:**
- Create: `frontend/src/lib/logging.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/vite.config.ts`
- Test: `frontend/src/__tests__/api.test.ts`

- [x] **Step 1: Write failing tests**
  - Assert retry logging is suppressed when dev logging is disabled.
  - Assert `shouldLogInDev({ DEV: true, MODE: "development" })` is true and production/test are false.

- [x] **Step 2: Implement logging helper**
  - Add `shouldLogInDev()` and `devWarn()`.
  - Replace retry/cancel warnings with `devWarn`.
  - Gate Vite proxy logs behind `VITE_PROXY_DEBUG === "true"`.

### Task 5: Documentation and Verification

**Files:**
- Modify: `CURRENT_GAP_ANALYSIS.md`

- [x] **Step 1: Move P2 items to resolved table**
- [x] **Step 2: Run verification**
  - `cd backend && uv run pytest -q`
  - `cd backend && uv run ruff check .`
  - `cd frontend && npm test`
  - `cd frontend && npx tsc --noEmit`
  - `cd frontend && npm run lint`
