# Gap 2 错误处理 & 可靠性实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 2 列出的所有可靠性问题

---

## 核查结论（逐条调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| 外部工具无 timeout | `compare_statements.py`、`fetch_transcript.py`、`rate_probability.py` 的 `requests.get` 已有 `timeout=20/30` ✓；**yfinance** (`market_data.py`) 完全无 timeout 控制 ✗；**Tavily** (`search.py`) SDK 调用无 timeout ✗ |
| 无 per-agent 降级 | litellm `num_retries=3` 是全局的，任意 agent LLM 调用耗尽重试后异常会直接冒泡中止整个 pipeline |
| 前端取消机制缺失 | `handleCancel` 仅 `window.location.reload()`，后端 SSE stream 继续运行，浪费 LLM tokens |
| SequentialAgent 无 partial result | pipeline 任意步骤异常后，已写入 session state 的 `section_research_findings` / `macro_analysis_output` 等数据被丢弃，用户看到空白 |

---

## 修复项一览

```
Fix 1  yfinance 调用加 ThreadPoolExecutor timeout   backend/app/tools/market_data.py
Fix 2  Tavily 调用加 timeout                        backend/app/tools/search.py
Fix 3  前端 AbortController 取消机制                frontend/src/App.tsx
Fix 4  PipelineGuard：partial result 安全网          backend/app/agent.py
```

---

## Fix 1：yfinance timeout wrapper

**文件：** `backend/app/tools/market_data.py`

**问题：** yfinance 没有原生超时参数，底层 HTTP 请求可能无限挂起。
ADK 工具函数是同步调用的，不能直接用 `asyncio.wait_for`，
需用 `concurrent.futures.ThreadPoolExecutor` 加 `future.result(timeout=N)` 实现壁钟超时。

**TOOL_TIMEOUT = 15 秒**（yfinance 正常响应 < 3s，15s 是宽松上限）

**修改：** 抽取 `_fetch_ticker_overview` 和 `_fetch_price_history` 两个纯逻辑函数，
将 `get_ticker_overview` 和 `get_price_history` 的实际 yfinance 调用包裹在 executor timeout 中：

```python
import concurrent.futures

TOOL_TIMEOUT = 15  # seconds

def _fetch_ticker_overview(symbol: str) -> str:
    """Inner function — pure yfinance logic, no ToolContext."""
    stock = yf.Ticker(symbol)
    info = stock.info or {}
    # ... 原有格式化逻辑不变 ...

def get_ticker_overview(ticker: str, tool_context: ToolContext) -> str:
    symbol = ticker.strip().upper()
    if not symbol:
        return "No data found for ticker: "
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_fetch_ticker_overview, symbol)
            return future.result(timeout=TOOL_TIMEOUT)
    except concurrent.futures.TimeoutError:
        logger.warning("Timeout fetching ticker overview for %s", symbol)
        return f"Timeout fetching data for {symbol}. Market data temporarily unavailable."
    except Exception:
        logger.warning("Could not fetch ticker overview for %s", symbol, exc_info=True)
        return f"No data found for ticker: {symbol}"
```

`get_price_history` 同理包裹。

**注意：** `_fetch_ticker_overview` 内部发生的任何异常会通过 `future.result()` 重新抛出，
被外层 `except Exception` 捕获，行为与修改前一致。

---

## Fix 2：Tavily timeout

**文件：** `backend/app/tools/search.py`

**问题：** `TavilyClient.search()` 没有 timeout 参数（SDK 内部使用 `requests` 但不暴露 timeout）。
同样用 `ThreadPoolExecutor` 包裹。

**TAVILY_TIMEOUT = 20 秒**

```python
import concurrent.futures

TAVILY_TIMEOUT = 20

def tavily_search(query: str, tool_context: ToolContext) -> str:
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        return "Search unavailable: TAVILY_API_KEY is not configured."

    def _do_search():
        client = TavilyClient(api_key=api_key)
        return client.search(query, search_depth="basic", max_results=5)

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_do_search)
            response = future.result(timeout=TAVILY_TIMEOUT)
    except concurrent.futures.TimeoutError:
        logger.warning("Tavily search timed out for query: %s", query)
        return "Search unavailable: Tavily request timed out. Try again later."
    except Exception:
        logger.warning("Tavily search failed for query: %s", query, exc_info=True)
        return "Search unavailable: Tavily request failed. Try again later."

    # ... 原有 source ID 构建逻辑不变 ...
```

---

## Fix 3：前端 AbortController 取消机制

**文件：** `frontend/src/App.tsx`

**问题：**
1. `handleCancel` 调用 `window.location.reload()` — 重新加载整个页面，UX 差，且后端仍在运行。
2. 没有 `AbortController`，SSE fetch 无法被主动中止。

**修改方案：**

**新增 ref：**
```typescript
const abortControllerRef = useRef<AbortController | null>(null);
```

**`handleSubmit` 中创建 controller：**
```typescript
// 在 fetch 之前
abortControllerRef.current = new AbortController();

const response = await fetch("/api/run_sse", {
  method: "POST",
  headers: { ... },
  signal: abortControllerRef.current.signal,   // ← 新增
  body: JSON.stringify({ ... }),
});
```

**session 创建的 fetch 也挂上 signal：**
```typescript
const response = await fetch(`/api/apps/...`, {
  method: "POST",
  headers: { ... },
  signal: abortControllerRef.current?.signal,  // ← 新增
});
```

**`handleCancel` 改写：**
```typescript
const handleCancel = useCallback(() => {
  // 中止正在进行的 fetch/SSE stream
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;

  // 清理 UI 状态（与原有逻辑一致）
  setMessages([]);
  setDisplayData(null);
  setMessageEvents(new Map());
  setWebsiteCount(0);
  setIsLoading(false);
  analysisOutputsRef.current = {};
  // 不再 window.location.reload()
}, []);
```

**SSE 读取循环中处理 abort：**
```typescript
try {
  while (true) {
    const { done, value } = await reader.read();
    // ... 现有逻辑 ...
    if (done) break;
  }
} catch (error) {
  if (error instanceof DOMException && error.name === "AbortError") {
    // 用户主动取消，静默处理
    return;
  }
  throw error;  // 其他错误继续向上抛
}
```

**效果：**
- `AbortController.abort()` 触发后，`reader.read()` 会抛出 `AbortError`，SSE 流立即停止。
- 后端检测到连接断开（Starlette SSE generator 的 `yield` 会触发 `GeneratorExit`），runner 自然停止。
- UI 状态干净清除，无需页面刷新。

---

## Fix 4：PipelineGuard — partial result 安全网

**文件：** `backend/app/agent.py`

**问题：** `SequentialAgent` 中任意步骤抛出异常，整个 pipeline 中断，
用户收到空白响应。已完成的 agent 数据仍在 session state，但 `report_composer` 从未运行。

**方案：** 新增自定义 `PipelineGuard(BaseAgent)`，包裹 `research_pipeline`：

- 正常路径：直接 yield 所有 `research_pipeline` 的事件，行为不变。
- 异常路径：捕获异常，将 session state 中已有的 partial 数据整理成降级报告，
  写入 `final_report_with_citations`，让前端能显示"研究已中断，以下是目前已获得的结果"。

```python
class PipelineGuard(BaseAgent):
    """Wraps research_pipeline and writes a graceful partial report on failure."""

    def __init__(self, pipeline: BaseAgent):
        super().__init__(name="pipeline_guard", sub_agents=[pipeline])
        self._pipeline = pipeline

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        try:
            async for event in self._pipeline.run_async(ctx):
                yield event
        except Exception as exc:
            logging.error("[PipelineGuard] Pipeline failed: %s", exc, exc_info=True)
            state = ctx.session.state
            parts = ["# ⚠️ 研究流程中断\n\n以下是中断前已获得的部分结果。\n"]

            if findings := state.get("section_research_findings"):
                parts.append(f"## 研究发现\n\n{findings}\n")
            if macro := state.get("macro_analysis_output"):
                parts.append(f"## 宏观分析\n\n{macro}\n")
            if fundamental := state.get("fundamental_analysis_output"):
                parts.append(f"## 基本面分析\n\n{fundamental}\n")
            if risk := state.get("risk_analysis_output"):
                parts.append(f"## 风险评估\n\n{risk}\n")

            if len(parts) == 1:
                parts.append(f"研究在初期阶段中断，未能生成有效内容。错误信息：{exc}")

            partial_report = "\n".join(parts)
            state["final_cited_report"] = partial_report
            state["final_report_with_citations"] = partial_report

            yield Event(
                author=self.name,
                actions=EventActions(
                    state_delta={"final_report_with_citations": partial_report}
                ),
            )
```

**接入方式：**

```python
# agent.py 中替换
research_pipeline = SequentialAgent(...)      # 保持不变

# interactive_planner_agent 改用 guard 包裹后的 pipeline
guarded_pipeline = PipelineGuard(research_pipeline)

interactive_planner_agent = LlmAgent(
    ...
    sub_agents=[guarded_pipeline],   # ← 原来是 [research_pipeline]
    ...
)
```

---

## 实施顺序

```
步骤 1  backend/app/tools/market_data.py     yfinance ThreadPoolExecutor timeout
步骤 2  backend/app/tools/search.py          Tavily ThreadPoolExecutor timeout
步骤 3  frontend/src/App.tsx                 AbortController + handleCancel 改写
步骤 4  backend/app/agent.py                 PipelineGuard 新增 + 接入
步骤 5  手动回归测试                          按测试检查清单验证
```

---

## 测试检查清单

```
□ 工具 timeout 验证
    □ 断网环境下调用 get_ticker_overview("AAPL", ...) → 15s 内返回 timeout 提示，不挂起
    □ 断网环境下调用 tavily_search("test", ...) → 20s 内返回 timeout 提示

□ 前端取消验证
    □ 发起 research 请求后立即点击取消 → SSE 流中断，UI 状态清空，无页面刷新
    □ 取消后可以立即发起新请求，不需要手动刷新

□ PipelineGuard 验证
    □ 手动向 section_researcher 注入异常（或临时 raise） → 前端收到 partial 报告
    □ partial 报告包含 "研究流程中断" 标题和已完成步骤的数据
    □ 正常 pipeline 路径不受影响，报告与修改前一致

□ 回归测试
    □ 完整的 research 请求（AAPL 或宏观话题）正常完成，报告带有 citations
    □ backend smoke tests 全部通过：uv run pytest tests/ -v
```

---

## 不在此次修复范围内的事项

- **per-agent LLM 重试策略**：litellm `num_retries=3` 足够 demo 场景；更细粒度的配置
  （指数退避、per-agent 上限）属于 Gap 3 可观测性中的 metrics 驱动优化。
- **backend 主动取消 running runner**：ADK 目前不暴露 runner cancel API；
  AbortController 触发连接断开已足够让 runner 自然退出（GeneratorExit）。
- **FOMC PDF download timeout**：`compare_statements.py` 和 `fetch_transcript.py`
  已有 `requests.get(..., timeout=30)`，不需要额外修改。
