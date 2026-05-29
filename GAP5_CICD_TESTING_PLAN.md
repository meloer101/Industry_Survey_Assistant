# Gap 5 CI/CD & 测试实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 5 列出的测试与 CI/CD 缺失问题

---

## 核查结论（调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| 测试数量 | 4 个测试文件，19 个 test case，全部后端 Python |
| Smoke tests 网络依赖 | `test_tools_smoke.py`（6 tests）调用真实 yfinance / FRED / Fed 网站，不可离线运行 |
| 纯函数未测试 | `parse_evaluation_callback`、`citation_replacement_callback`、`_split_for_diff`、`_clean_text` 均无测试 |
| 前端零测试 | 无任何 React 组件测试或 SSE 解析逻辑测试 |
| 无 CI/CD | 无 `.github/` 目录，无任何自动化流程 |
| TypeScript 编译 | `tsc --noEmit` 已通过，`strict: true` 已开启 |
| 现有 lint | `package.json` 有 `eslint`，但无 CI 触发 |

---

## 修复项一览

```
Fix 1  后端 callback/parser 单元测试        backend/tests/test_callbacks.py          (新)
Fix 2  后端 tool pure-function 单元测试      backend/tests/test_tool_pure_functions.py (新)
Fix 3  后端 smoke tests 离线化              backend/tests/test_tools_smoke.py        (修改)
Fix 4  前端 SSE parser 测试                 frontend/src/__tests__/sse-parser.test.ts (新)
Fix 5  前端测试框架搭建                      frontend/package.json, vitest.config.ts
Fix 6  GitHub Actions CI pipeline           .github/workflows/ci.yml                 (新)
```

---

## Fix 1：后端 callback/parser 单元测试

**新文件：** `backend/tests/test_callbacks.py`

测试目标（全部为纯函数，无外部依赖）：

**`parse_evaluation_callback`:**
```python
def test_parse_evaluation_valid_json():
    """Raw JSON string in state → parsed dict."""

def test_parse_evaluation_markdown_fenced_json():
    """```json {...}``` wrapped output → correctly stripped and parsed."""

def test_parse_evaluation_already_dict():
    """Already a dict → no-op, state unchanged."""

def test_parse_evaluation_invalid_json():
    """Garbage text → fallback {"grade":"fail"} with raw text in comment."""

def test_parse_evaluation_non_string():
    """Integer/None → fallback with str() in comment."""
```

**`citation_replacement_callback`:**
```python
def test_citation_single_source():
    """<cite source="src-1"/> → [Title](url) markdown link."""

def test_citation_missing_source():
    """<cite source="src-99"/> → removed (warning logged)."""

def test_citation_cleanup_whitespace():
    """Extra spaces before punctuation → collapsed ("text ." → "text.")."""

def test_citation_multiple_sources():
    """Multiple tags in one report → all replaced correctly."""
```

**实现注意：** 两个 callback 都接受 `CallbackContext`，但只读写 `state`。
创建一个 `_FakeCallbackContext` 包装一个 `dict` 即可 mock。

```python
class _FakeCallbackContext:
    def __init__(self, state: dict):
        self.state = state
```

---

## Fix 2：后端 tool pure-function 单元测试

**新文件：** `backend/tests/test_tool_pure_functions.py`

| 函数 | 来源 | 测试内容 |
|------|------|----------|
| `_human_number` | `market_data.py` | 1T, 1.5B, 800M, 12345, None, "abc" |
| `_format_percent` | `market_data.py` | 12.345 → "12.35%", None → "N/A" |
| `_format_price` | `market_data.py` | 150.1234 → "150.12", None → "N/A" |
| `_split_for_diff` | `compare_statements.py` | 句号分割、多空格压缩、空行折叠 |
| `_clean_text` | `fetch_transcript.py` | 重复行去除、纯数字行跳过、空格压缩 |
| `_target_range_from_effective_rate` | `rate_probability.py` | 5.33 → "5.25%-5.50%"（已知标准值） |
| `_classify_probability_context` | `rate_probability.py` | "25 bp cut" → "cut_25bp", "no change" → "no_change", 无关文本 → None |

全部是无 IO、无副作用的纯函数，可离线运行。

---

## Fix 3：Smoke tests 离线化

**文件：** `backend/tests/test_tools_smoke.py`

当前 6 个 smoke test 直接调用真实 API。在 CI 环境中不可靠且会被限速。

**方案：** 用 `pytest.mark.network` 标记现有 smoke test，CI 中默认跳过：

```python
import pytest

pytestmark = pytest.mark.network

@pytest.mark.network
def test_market_data_overview():
    ...
```

**`pyproject.toml` 新增：**
```toml
[tool.pytest.ini_options]
markers = [
    "network: tests that require external network access (deselect with -m 'not network')",
]
```

**CI 运行：** `pytest -m "not network"`
**本地全量：** `pytest`（含网络 smoke test）

---

## Fix 4：前端 SSE parser 测试

**新文件：** `frontend/src/__tests__/sse-parser.test.ts`

`extractDataFromSSE` 是 App.tsx 中最复杂的纯函数（~70 行），当前零测试。

**方案：** 将 `extractDataFromSSE` 和 `getEventTitle` 提取到 `frontend/src/lib/sse.ts`，
便于单独导入和测试。

**`frontend/src/lib/sse.ts`：**（从 App.tsx 中提取，逻辑不变）
```typescript
export function extractDataFromSSE(data: string): SseExtractResult { ... }
export function getEventTitle(agentName: string): string { ... }
export function getFunctionTitle(funcName: string, type: 'call' | 'response'): string { ... }
```

**`App.tsx` 改为：**
```typescript
import { extractDataFromSSE, getEventTitle, getFunctionTitle } from "@/lib/sse";
```

**测试用例：**
```typescript
describe("extractDataFromSSE", () => {
  it("extracts text parts from content.parts")
  it("extracts agent from author field")
  it("extracts final report from stateDelta")
  it("extracts source count from url_to_short_id")
  it("extracts analysis outputs from stateDelta")
  it("returns empty result on invalid JSON")
  it("handles event with no content.parts gracefully")
})

describe("getEventTitle", () => {
  it("maps known agent names to Chinese-friendly titles")
  it("returns fallback for unknown agents")
})
```

---

## Fix 5：前端测试框架搭建

**安装 vitest：**
```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**新文件：** `frontend/vitest.config.ts`
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**`package.json` 新增 script：**
```json
"test": "vitest run",
"test:watch": "vitest"
```

---

## Fix 6：GitHub Actions CI pipeline

**新文件：** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
        with:
          version: "latest"
      - run: uv sync
      - run: uv run pytest -m "not network" -v

  backend-lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v4
        with:
          version: "latest"
      - run: uv sync
      - run: uv run python -m py_compile app/main.py
      - run: uv run python -m py_compile app/agent.py
      - run: uv run python -m py_compile app/callbacks.py

  frontend-check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm test
```

**3 个并行 job：**
- `backend-test`：`pytest -m "not network"` 跑所有非网络测试（~15 tests）
- `backend-lint`：`py_compile` 验证语法（暂不引入 ruff/mypy，避免过度配置）
- `frontend-check`：TypeScript 编译 + ESLint + Vitest

---

## 实施顺序

```
步骤 1  backend/tests/test_callbacks.py              callback 单元测试
步骤 2  backend/tests/test_tool_pure_functions.py     纯函数单元测试
步骤 3  backend/tests/test_tools_smoke.py             添加 @network marker
步骤 4  backend/pyproject.toml                        pytest marker 配置
步骤 5  frontend: 安装 vitest, 创建 vitest.config.ts
步骤 6  frontend/src/lib/sse.ts                       提取 SSE parser
步骤 7  frontend/src/App.tsx                          引用提取后的函数
步骤 8  frontend/src/__tests__/sse-parser.test.ts     SSE parser 测试
步骤 9  .github/workflows/ci.yml                     CI pipeline
步骤 10 手动回归测试
```

---

## 测试检查清单

```
□ 后端
    □ pytest -m "not network" -v → 全部通过（含新的 callback/pure-function 测试）
    □ pytest -v → 全部通过（含 smoke test，需要网络）
    □ 新增 test 数量目标：≥ 15 个新 test case

□ 前端
    □ npm test → vitest 运行通过
    □ npx tsc --noEmit → 无类型错误
    □ App.tsx 从 lib/sse.ts 导入后功能不变

□ CI
    □ 推送到 main 后 GitHub Actions 自动触发
    □ 3 个 job 全部绿色
```
