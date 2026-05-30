# P1 Operability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Resolve the P1 operability gaps: cancel backend runs, schedule session cleanup, expose metrics, and add request/pipeline tracing.

**Architecture:** Keep changes local to the existing FastAPI/ADK wrapper and pipeline callbacks. Use a small ASGI middleware to track active `/run_sse` request tasks by `(appName, userId, sessionId)`, background startup/shutdown hooks for cleanup, and lightweight observability helpers with no new network-dependent services.

**Tech Stack:** FastAPI/Starlette ASGI middleware, asyncio, React/Vite fetch API, pytest, Vitest, OpenTelemetry API.

---

### Task 1: Backend Run Cancellation

**Files:**
- Create: `backend/app/run_control.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_operability.py`

- [x] **Step 1: Write failing tests**
  - Verify `ActiveRunRegistry.register()` stores a run and `cancel()` cancels its task.
  - Verify `RunCancellationMiddleware` registers a `/run_sse` request using JSON body fields.
  - Verify the active run registry returns a JSON-compatible cancellation result.

- [x] **Step 2: Implement run registry and middleware**
  - Add `RunKey`, `ActiveRunRegistry`, and `RunCancellationMiddleware`.
  - Buffer and replay the request body so ADK still receives the original `/run_sse` payload.

- [x] **Step 3: Wire FastAPI**
  - Add middleware in `create_app()`.
  - Add DELETE route that calls the shared registry.

### Task 2: Session Cleanup Scheduler

**Files:**
- Modify: `backend/app/tools/session_cleanup.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_operability.py`

- [x] **Step 1: Write failing tests**
  - Verify a cleanup loop calls the provided cleanup function at startup.
  - Verify shutdown cancels the cleanup task.

- [x] **Step 2: Implement scheduler helpers**
  - Add `run_cleanup_loop()`, `start_session_cleanup_task()`, and `stop_session_cleanup_task()`.
  - Read interval from `SESSION_CLEANUP_INTERVAL_SECONDS`, defaulting to 86400.

- [x] **Step 3: Wire startup/shutdown**
  - Register a FastAPI lifespan wrapper without replacing ADK's existing lifespan.

### Task 3: Metrics Endpoint

**Files:**
- Create: `backend/app/observability.py`
- Modify: `backend/app/agents/custom.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_operability.py`

- [x] **Step 1: Write failing tests**
  - Verify pipeline callbacks increment run counters and duration sums.
  - Verify `/metrics` renders Prometheus text format.

- [x] **Step 2: Implement minimal metrics registry**
  - Track `pipeline_runs_total`, `pipeline_failures_total`, `pipeline_duration_seconds_count`, `pipeline_duration_seconds_sum`, and `pipeline_sources_total`.

- [x] **Step 3: Wire callbacks and endpoint**
  - Record start/end in pipeline callbacks.
  - Exempt `/metrics` from API key auth.

### Task 4: Pipeline Tracing

**Files:**
- Modify: `backend/app/observability.py`
- Modify: `backend/app/agents/custom.py`
- Test: `backend/tests/test_operability.py`

- [x] **Step 1: Write failing tests**
  - Verify pipeline start stores a trace id in session state.
  - Verify pipeline end clears the active span registry entry.

- [x] **Step 2: Implement trace helpers**
  - Use `opentelemetry.trace.get_tracer(__name__)` when available.
  - Fall back to generated trace ids if OpenTelemetry is not configured.

### Task 5: Frontend Cancel Notification

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/__tests__/api.test.ts`

- [x] **Step 1: Write failing test**
  - Verify `cancelRun(appName, userId, sessionId)` issues `DELETE /api/apps/{app}/users/{user}/sessions/{session}/run`.

- [x] **Step 2: Implement API helper and wire `handleCancel`**
  - Call cancel before clearing UI state when identifiers exist.
  - Ignore cancellation request failures because local abort/reset must still proceed.

### Task 6: Documentation and Verification

**Files:**
- Modify: `CURRENT_GAP_ANALYSIS.md`

- [x] **Step 1: Move P1 items to resolved table**
- [x] **Step 2: Run verification**
  - `cd backend && uv run pytest -q`
  - `cd frontend && npm test`
  - `cd frontend && npx tsc --noEmit`
  - `cd frontend && npm run lint`
