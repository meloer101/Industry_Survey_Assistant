# Phase 5 — Integration, Polish & Documentation

## 目标

将前四个阶段的成果整合为一个生产级别的端到端系统：健壮的错误处理、
LLM 请求速率控制、配置调优、完整的端到端测试验证，以及一份可用于 portfolio
展示的 README。

---

## 任务总览

| # | 任务 | 涉及文件 | 复杂度 |
|---|------|---------|--------|
| 1 | 后端：金融工具 try/except 保护 | `tools/*.py` | 低 |
| 2 | 后端：rate_limit_callback 移植 | 新建 `backend/app/callbacks.py`，修改 `agent.py` | 中 |
| 3 | 后端：LiteLlm 重试配置 | `config.py` | 低 |
| 4 | 后端：plan_generator prompt 金融调优 | `agent.py` | 低 |
| 5 | 后端：research_evaluator prompt 金融质量标准 | `agent.py` | 低 |
| 6 | 后端：max_search_iterations 可配置化 | `config.py` | 低 |
| 7 | 前端：后端不可用状态验证 | `App.tsx` | 低 |
| 8 | 端到端测试：4 个场景手动验证 | 无代码修改（运行 & 验证） | 高 |
| 9 | README 编写 | 新建 `README.md` | 中 |

---

## 任务详细描述

### 任务 1：后端金融工具 try/except 保护

**目标**：所有金融工具函数（market_data、rate_probability、compare_statements、
fetch_transcript）的外层已有部分 try/except，需审查并确保：
- 所有对外部 API/网络请求的调用都被 try/except 包裹
- 异常时返回用户友好的错误字符串，而非 Python stack trace
- 不吞没日志——用 `logging.warning` 记录完整异常

**涉及文件**：
- `backend/app/tools/market_data.py`
- `backend/app/tools/rate_probability.py`
- `backend/app/tools/compare_statements.py`
- `backend/app/tools/fetch_transcript.py`
- `backend/app/tools/search.py`（tavily_search）

**具体检查点**：

| 工具文件 | 当前状态 | 需要补充 |
|---------|---------|---------|
| `market_data.py` | `get_ticker_overview` 有 try/except；`get_price_history` 有 try/except | 审查是否覆盖所有 yfinance 调用路径，确保 `yf.download` 网络超时有合理处理 |
| `rate_probability.py` | 内部函数 `_latest_fedfunds` 和 `_tavily_probability_context` 在调用处已被 try/except 包裹 | 审查 `requests.get` 是否可能抛出未捕获的 `ConnectionError`；确认 Tavily client 异常已覆盖 |
| `compare_statements.py` | `compare_fed_statements` 顶层有 try/except，捕获 `requests.Timeout` 和通用 `Exception` | 已较完善，审查 `_download_pdf` 内部边界 |
| `fetch_transcript.py` | `fetch_fomc_transcript` 有 `requests.Timeout` 和通用 `Exception` 捕获 | 已较完善 |
| `search.py` | `tavily_search` 无 try/except！ | **必须添加**：包裹 `TavilyClient.search()` 调用，`TAVILY_API_KEY` 缺失时返回友好提示 |

**验收标准**：
- `tavily_search` 在 API key 缺失 / 网络不可用时返回可读错误字符串
- 其余工具的现有保护经审查确认充分，添加 `logging.warning` 到关键异常路径

---

### 任务 2：rate_limit_callback 移植

**目标**：从 `参考项目代码/fomc-research_副本/fomc_research/shared_libraries/callbacks.py`
移植速率限制回调，挂载到高频 LLM 调用的 agent 上，防止 DeepSeek API 限流。

**参考实现分析**：
- 使用 session state 跟踪 `timer_start` 和 `request_count`
- 当请求数超过 `RPM_QUOTA`（原值 1000）时，`time.sleep()` 到窗口结束
- 签名：`(callback_context: CallbackContext, llm_request: LlmRequest) -> None`
- 挂载方式：`before_model_callback`

**实施步骤**：
1. 新建 `backend/app/callbacks.py`
2. 移植 `rate_limit_callback`，调整 `RPM_QUOTA` 为 DeepSeek 的实际限制（初始保守设 60 RPM）
3. 在 `agent.py` 中为以下 agent 添加 `before_model_callback=rate_limit_callback`：
   - `section_researcher`（高频搜索 + 工具调用）
   - `enhanced_search_executor`（同上）
   - `research_evaluator`（critic 模型，单独限流）
   - `analysis_coordinator`（调用多个子 agent）
   - 三个 analysis sub-agents（`macro_analysis_agent`, `fundamental_analysis_agent`, `risk_analysis_agent`）

**注意**：`rate_limit_callback` 使用 `callback_context.state` 存储计时器，
session state 在同一 session 内共享，所以所有挂载此回调的 agent 共享同一个
计数器——这正是我们想要的全局限流行为。

**验收标准**：
- 回调成功挂载，日志中可看到 `rate_limit_callback` 的 debug 输出
- 高频请求场景下不会触发 DeepSeek 429 错误

---

### 任务 3：LiteLlm 重试配置

**目标**：PROJECT_PLAN.md 风险登记中记录了 DeepSeek API 偶发连接中断
（`ssl: [None]`），需要在 `LiteLlm` 构造时添加 `num_retries` 参数。

**实施**：
```python
# config.py
worker_model: LiteLlm = field(
    default_factory=lambda: LiteLlm(model="deepseek/deepseek-v4-flash", num_retries=3)
)
critic_model: LiteLlm = field(
    default_factory=lambda: LiteLlm(model="deepseek/deepseek-v4-pro", num_retries=3)
)
```

**验收标准**：
- 确认 `LiteLlm` 构造函数接受 `num_retries` 参数（查阅 ADK 文档或源码）
- 如果不支持，改用 `litellm` 全局配置 `litellm.num_retries = 3`

---

### 任务 4：plan_generator prompt 金融调优

**目标**：当前 `plan_generator` 的 instruction 是通用研究规划，缺乏金融领域引导。
添加金融特定的 plan 示例和引导词。

**修改内容**：在 plan_generator instruction 末尾添加金融领域指引：

```
**FINANCIAL TOPIC GUIDANCE:**
When the research topic involves financial markets, investments, or economic policy:
- Include a [RESEARCH] goal for quantitative data gathering (prices, ratios, rates)
- Include a [RESEARCH] goal for recent news and analyst opinions
- For macro topics: include a goal on central bank policy stance and forward guidance
- For equity topics: include a goal on recent earnings and valuation metrics
- Always include a [DELIVERABLE] for risk assessment

Examples of good financial research goals:
- [RESEARCH] Analyze the Federal Reserve's recent rate decisions and dot plot projections
- [RESEARCH] Investigate NVDA's Q4 earnings beat/miss and management guidance
- [RESEARCH] Compare current P/E multiples to 5-year sector averages
- [DELIVERABLE] Compile a risk-return assessment with bull/bear scenarios
```

**验收标准**：
- 金融话题输入时，生成的 plan 包含量化数据收集和风险评估步骤

---

### 任务 5：research_evaluator prompt 金融质量标准

**目标**：当前 evaluator 使用通用质量标准，需添加金融特定的评估维度。

**修改内容**：在 research_evaluator instruction 的评估标准部分添加：

```
**FINANCIAL-SPECIFIC QUALITY CRITERIA (apply when topic is financial):**
- Data Recency: financial claims must reference data no older than 3 months
  (unless historical analysis is the explicit goal)
- Source Credibility: prefer data from official sources (Fed, SEC filings,
  company earnings releases) over opinion blogs
- Quantitative Rigor: key claims should include specific numbers (prices,
  percentages, dates) — vague statements like "stocks went up" are insufficient
- Completeness: for equity topics, check that both bull and bear cases are covered;
  for macro topics, check that multiple economic indicators are discussed
```

**验收标准**：
- 金融研究中缺乏具体数据时，evaluator 更倾向于 grade "fail" 并要求补充

---

### 任务 6：max_search_iterations 可配置化

**目标**：允许通过环境变量调整 `max_search_iterations`，方便测试时快速迭代。

**实施**：
```python
# config.py
max_search_iterations: int = field(
    default_factory=lambda: int(os.environ.get("MAX_SEARCH_ITERATIONS", "3"))
)
```

**验收标准**：
- 设置 `MAX_SEARCH_ITERATIONS=1` 后，研究流程仅执行 1 次迭代

---

### 任务 7：前端后端不可用状态验证

**目标**：验证 `App.tsx` 中已有的 `BackendLoadingScreen` 和错误状态在新后端
下正常工作。

**检查点**：
- 后端未启动时，前端显示"正在连接后端服务..."加载界面
- 2 分钟超时后显示"后端服务不可用"错误页面
- 重试按钮可刷新页面重新检测

**当前状态**：代码已实现（Phase 4），此任务仅需手动验证。如发现问题则修复。

---

### 任务 8：端到端测试场景

**目标**：手动运行 4 个测试场景，验证完整流程的正确性和输出质量。

#### 场景 A：宏观分析

**输入**："分析美联储2025年降息对美债的影响"

**预期行为**：
- plan_generator 生成包含央行政策、利率传导的研究计划
- section_researcher 使用 `tavily_search` + `get_rate_move_probability`
- analysis_coordinator 路由到 macro → risk（跳过 fundamental）
- 最终报告包含利率数据、概率分布、风险评估
- 报告末尾包含法律免责声明
- 所有引用为可点击的 markdown 链接

#### 场景 B：个股分析

**输入**："解读英伟达2025财年业绩及前景"

**预期行为**：
- section_researcher 使用 `get_ticker_overview("NVDA")` 和 `get_price_history`
- analysis_coordinator 路由到 fundamental → risk（跳过 macro）
- 报告包含 PE、市值、52周范围等具体数据
- ActivityTimeline 展示 research 和 analysis 两阶段

#### 场景 C：跨领域分析

**输入**："美联储加息背景下科技股的估值压力"

**预期行为**：
- analysis_coordinator 路由到 macro → fundamental → risk（全部三个）
- 报告同时包含宏观政策分析和估值数据

#### 场景 D：FOMC 专项

**输入**："分析2025年3月FOMC会议声明变化"

**预期行为**：
- section_researcher 使用 `fetch_fomc_transcript` 和/或 `compare_fed_statements`
- macro_analysis_agent 也可能调用 `fetch_fomc_transcript`

**验收标准**：
- 4 个场景均能产出完整的、有引用的报告
- 无未处理的异常到达前端
- ActivityTimeline 正确展示所有 agent 步骤
- AnalysisPanel 的 tab 正确显示对应的分析输出

---

### 任务 9：README 编写

**目标**：编写一份清晰的 README.md，适合 portfolio 展示。

**结构**：

```
# AI Investment Research Platform

## Overview
[项目简介 + 核心功能]

## Architecture
[ASCII 架构图展示 agent 层级]

## Tech Stack
[表格列出各层技术选型]

## Features
- HITL 研究规划
- 多轮质量控制
- 领域自适应金融分析（宏观/基本面/风险）
- 实时 SSE 流式进度展示
- 完整引用溯源系统

## Getting Started
### Prerequisites
### Environment Setup
### Running the Application

## Example Queries
[4 个示例及简要说明]

## Agent Architecture Diagram
[Mermaid 或 ASCII 展示 agent 树]

## Credits
[致谢三个参考项目]
```

**验收标准**：
- 新开发者阅读 README 后能在 5 分钟内启动项目
- 架构图清晰展示 agent 层级关系

---

## 执行顺序

```
Phase 5 执行流程：

    ┌─────────────────────────────────────┐
    │  Step 1: 错误处理 & 健壮性          │
    │  ├── 任务 1: 工具 try/except 审查   │
    │  ├── 任务 2: rate_limit_callback    │
    │  └── 任务 3: LiteLlm 重试          │
    └──────────────┬──────────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │  Step 2: 配置调优                    │
    │  ├── 任务 4: plan_generator 金融调优 │
    │  ├── 任务 5: evaluator 金融标准      │
    │  └── 任务 6: iterations 可配置化     │
    └──────────────┬──────────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │  Step 3: 前端验证                    │
    │  └── 任务 7: 后端不可用状态验证      │
    └──────────────┬──────────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │  Step 4: 端到端测试                  │
    │  └── 任务 8: 4 个场景验证            │
    └──────────────┬──────────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │  Step 5: 文档                        │
    │  └── 任务 9: README 编写             │
    └─────────────────────────────────────┘
```

**原则**：先修内功（错误处理 + 调优），再验收（测试），最后写文档。
每个 Step 完成后 commit 一次。

---

## 风险与注意事项

| 风险 | 缓解 |
|------|------|
| DeepSeek API 在测试期间限流 | 任务 2 的 rate_limit_callback 正是解决此问题 |
| `LiteLlm` 不支持 `num_retries` 参数 | 退而使用 `litellm` 全局设置 |
| FOMC 测试场景中 PDF 链接 404 | 工具已有 404 处理逻辑，验证错误消息可读即可 |
| 端到端测试耗时长（每个场景 2-5 分钟） | 先用 `MAX_SEARCH_ITERATIONS=1` 快速烟雾测试，确认流程畅通后再用默认值跑完整测试 |
