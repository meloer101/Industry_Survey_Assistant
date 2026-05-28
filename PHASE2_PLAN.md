# Phase 2 执行计划 — Financial Domain Tools

> **状态追踪文件。** 每完成一个任务立即更新状态标记。
> 最后更新：2026-05-28

---

## 总览

**目标：** 为 AI Investment Research Platform 添加 4 个金融领域工具，替换 BigQuery 依赖，并将工具接入现有 research agent pipeline。

**前置条件：** Phase 1 骨架已可运行（`backend/app/agent.py` + frontend SSE 展示正常）。

**完成标准（Phase 2 全部通过）：**
- [x] `get_ticker_overview("NVDA")` 返回真实 yfinance 数据
- [x] `get_rate_move_probability(...)` 不依赖 GCP 即可运行
- [x] `compare_fed_statements(url1, url2)` 在两个 Fed PDF URL 上正常输出 diff
- [x] `fetch_fomc_transcript(year, month)` 返回会议记录文本
- [x] 所有工具集成进 research agent，可在对话中被自动调用
- [x] 4 个工具均有对应烟雾测试，`pytest` 全部通过
- [x] 代码库中无 `google.cloud.bigquery` 导入

---

## Pre-flight 修复（进入 Phase 2 第一件事）

### P0 · 修复 `u_999` 硬编码

**文件：** `frontend/src/App.tsx:64`

**问题：** Session ID 已动态生成（`uuidv4()`），但 user ID 路径仍硬编码为 `u_999`，违反 CLAUDE.md 约束。

**修法：** 在 `createSession()` 里用 `uuidv4()` 同时生成 `userId`，替换 URL 中的 `u_999`，并从 API 响应里读取服务器返回的 `userId`。

**状态：** `[x]` 已完成（当前代码已生成动态 userId 并读取 API 响应）

---

## 任务详情

### Task 1 — `backend/app/tools/market_data.py`

**依赖包：** `yfinance`（已在 `pyproject.toml` 中）

**实现两个函数：**

#### `get_ticker_overview(ticker: str, tool_context: ToolContext) -> str`

- 调用 `yfinance.Ticker(ticker).info` 获取元数据
- 返回格式化字符串，包含：
  - 公司名、行业/板块
  - 市值（human-readable，如 "2.3T"）
  - 市盈率（PE Ratio TTM）
  - 52 周区间（Low / High）
  - 当前价格与当日涨跌幅
  - 分析师目标价（targetMeanPrice，如存在）
- 异常处理：ticker 不存在时返回 `"No data found for ticker: {ticker}"`

#### `get_price_history(ticker: str, period: str, tool_context: ToolContext) -> str`

- 调用 `yfinance.download(ticker, period=period, auto_adjust=True)`
- `period` 合法值：`"5d"`, `"1mo"`, `"3mo"`, `"6mo"`, `"1y"`，默认 `"1mo"`
- 返回每行一条 OHLCV 记录的文本，格式：`Date | Open | High | Low | Close | Volume`
- 限制最多返回 30 行（LLM context 保护）

**ADK 工具注册：** 两个函数直接作为 ADK tool（接受 `ToolContext` 参数即可，无需额外装饰器）

**状态：** `[x]` 已完成

---

### Task 2 — `backend/app/tools/rate_probability.py`

**替代：** `fomc-research_副本/fomc_research/shared_libraries/price_utils.py`（BigQuery 实现）

**实现一个函数：**

#### `get_rate_move_probability(meeting_date: str, tool_context: ToolContext) -> str`

**执行策略（两级降级）：**

1. **主路径 — FRED API**
   - 请求 `https://api.stlouisfed.org/fred/series/observations`
   - Series ID：`FEDFUNDS`（实际联邦基金利率）+ `FF`（Fed Funds Futures，需 fallback）
   - 解析最近数据点，推算当前目标区间
   - 注：FRED 不直接提供 FedWatch 概率，此路径提供基准利率上下文

2. **备用路径 — Tavily 搜索**
   - 查询：`"CME FedWatch {meeting_date} rate cut probability"`
   - 从搜索结果中提取概率文本（LLM 友好格式）
   - 若搜索结果含明确数字，提取并返回结构化输出

**返回格式（JSON 字符串）：**
```json
{
  "meeting_date": "2025-03-19",
  "source": "FRED" | "Tavily",
  "current_target_range": "5.25%-5.50%",
  "implied_probabilities": {
    "no_change": 0.28,
    "cut_25bp": 0.72
  },
  "note": "Data from FRED FEDFUNDS series / Tavily search"
}
```

**状态：** `[x]` 已完成

---

### Task 3 — `backend/app/tools/compare_statements.py`

**参考：** `参考项目代码/fomc-research_副本/fomc_research/tools/compare_statements.py`
**改造方向：** 移除所有 GCS / ADK Artifact Store 依赖，改用本地临时文件。

**实现一个函数：**

#### `compare_fed_statements(url1: str, url2: str, tool_context: ToolContext) -> str`

**执行步骤：**
1. 用 `requests.get()` 下载两个 PDF 到 `tempfile.NamedTemporaryFile`
2. 用 `pypdf.PdfReader` 提取每页文本，拼接为完整字符串
3. 对两份文本按句/段分行，用 `difflib.unified_diff` 生成 diff
4. 返回 unified diff 字符串（纯文本，非 HTML）

**限制与容错：**
- 单个 PDF 大小超过 5MB 时拒绝处理，返回错误说明
- 提取文本为空时返回 `"Could not extract text from PDF: {url}"`
- diff 超过 200 行时截断并附注 `"[truncated — showing first 200 diff lines]"`

**状态：** `[x]` 已完成

---

### Task 4 — `backend/app/tools/fetch_transcript.py`

**参考：** `参考项目代码/fomc-research_副本/fomc_research/tools/fetch_transcript.py`
**改造方向：** 移除 Artifact Store 依赖，直接返回文本。

**实现一个函数：**

#### `fetch_fomc_transcript(year: int, month: int, tool_context: ToolContext) -> str`

**执行步骤：**
1. 构造 Fed.gov PDF URL（格式：`https://www.federalreserve.gov/monetarypolicy/files/FOMC{year}{month:02d}meeting.pdf`）
2. 用 `requests.get()` 下载（设 timeout=30s）
3. 用 `pypdf.PdfReader` 提取文本
4. 清理文本（去除多余空白行、页眉页脚重复文本）
5. 返回前 8000 字符的文本（保护 LLM context），附注总字符数

**容错：**
- 404 → `"No FOMC transcript found for {year}-{month:02d}"`
- 超时 → `"Timeout fetching transcript. Try again or use a different date."`

**状态：** `[x]` 已完成

---

### Task 5 — 工具集成进 Agent Pipeline

**修改文件：** `backend/app/agent.py`

**具体变更：**

1. **导入新工具（文件顶部）：**
   ```python
   from .tools.market_data import get_ticker_overview, get_price_history
   from .tools.rate_probability import get_rate_move_probability
   from .tools.compare_statements import compare_fed_statements
   from .tools.fetch_transcript import fetch_fomc_transcript
   ```

2. **更新 `section_researcher.tools`：**
   当前只有 `[tavily_search]`，扩展为：
   ```python
   tools=[
       tavily_search,
       get_ticker_overview,
       get_price_history,
       get_rate_move_probability,
       compare_fed_statements,
       fetch_fomc_transcript,
   ]
   ```

3. **同样更新 `enhanced_search_executor.tools`（refinement loop 同等能力）**

4. **更新工具使用提示（`section_researcher` instruction）：**
   在现有 instruction 末尾追加工具说明段落，告知 agent 何时使用哪个工具：
   - 涉及个股时 → `get_ticker_overview` + `get_price_history`
   - 涉及 Fed 利率决策时 → `get_rate_move_probability`
   - 涉及两份 FOMC 声明对比时 → `compare_fed_statements`
   - 涉及特定 FOMC 会议记录时 → `fetch_fomc_transcript`

**状态：** `[x]` 已完成

---

### Task 6 — 烟雾测试

**新建目录：** `backend/tests/`
**新建文件：** `backend/tests/test_tools_smoke.py`

**测试内容（每个工具一个 smoke test）：**

```
test_market_data_overview        — get_ticker_overview("AAPL") 返回非空字符串，含 "Apple" 或 "AAPL"
test_market_data_history         — get_price_history("AAPL", "5d") 返回含 "Close" 或日期的字符串
test_rate_probability            — get_rate_move_probability("2025-03-19") 返回含 "probability" 或数字的字符串
test_compare_statements          — 用两个已知 Fed PDF URL，返回字符串含 "---" 或 "+++"
test_fetch_transcript            — fetch_fomc_transcript(2024, 12) 返回长度 > 100 的字符串
test_ticker_invalid              — get_ticker_overview("INVALIDXYZ999") 返回错误说明而不抛异常
```

**注意：** 测试直接调用函数（传入 `MagicMock` 作为 `tool_context`），不启动 ADK server。

**状态：** `[x]` 已完成

---

## 执行顺序

```
P0 修复 u_999
  ↓
Task 1 market_data.py（最简单，先建立工具模式）
  ↓
Task 4 fetch_transcript.py（纯 HTTP + pypdf，无复杂逻辑）
  ↓
Task 3 compare_statements.py（依赖 pypdf 经验，复杂度中等）
  ↓
Task 2 rate_probability.py（最复杂，需调试降级逻辑）
  ↓
Task 5 集成进 agent.py
  ↓
Task 6 烟雾测试
  ↓
Phase 2 验收
```

---

## 进度追踪

| 任务 | 状态 | 完成时间 | 备注 |
|------|------|---------|------|
| P0 · 修复 u_999 | ✅ 已完成 | 2026-05-28 | 当前 App.tsx 已使用动态 userId |
| Task 1 · market_data.py | ✅ 已完成 | 2026-05-28 | yfinance overview/history |
| Task 2 · rate_probability.py | ✅ 已完成 | 2026-05-28 | FRED + Tavily fallback |
| Task 3 · compare_statements.py | ✅ 已完成 | 2026-05-28 | 本地 PDF diff |
| Task 4 · fetch_transcript.py | ✅ 已完成 | 2026-05-28 | Fed PDF 文本提取，含 minutes fallback |
| Task 5 · 工具集成进 agent | ✅ 已完成 | 2026-05-28 | section_researcher + enhanced_search_executor |
| Task 6 · 烟雾测试 | ✅ 已完成 | 2026-05-28 | `uv run pytest tests/test_tools_smoke.py` |
| **Phase 2 验收** | ✅ 已完成 | 2026-05-28 | pytest、agent import、frontend build 已通过 |

---

## 关键约束（摘自 CLAUDE.md）

- `参考项目代码/` 下所有文件**只读**，不得修改
- 不得引入 `google.cloud.bigquery`
- citation 系统（`src-N` → `<cite>` → markdown link）不得改动
- `report_composer` 的 `include_contents="none"` 不得移除
- 分析类 agent 的免责声明不得删除
