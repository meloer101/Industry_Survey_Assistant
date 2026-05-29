# Gap 8 代码质量实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 8 列出的后端代码质量问题

---

## 核查结论（调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| `agent.py` 单文件过长 | 462 行：2 个 callback 函数 + 2 个 custom BaseAgent 子类 + 8 个 LlmAgent/SequentialAgent 定义 + prompt 文本全部在同一文件 |
| `time.sleep` 阻塞 | `callbacks.py` 已使用 `asyncio.sleep` ✓（Gap 2 已修复）|
| 共享可变状态竞态 | rate limiter 存储在 session state 中，ADK session 是 per-user 隔离的，同一 session 内是串行执行（SequentialAgent），实际不存在并发竞态 ✓ |
| Python 版本过严 | `>=3.12,<3.13`（Gap 7 Fix 2 将修复）|
| analysis sub-agents 已拆分 | `agents/analysis/` 下有 4 个文件（coordinator + 3 个 agent），结构清晰 ✓ |
| 无 research pipeline 模块 | 所有 research 相关 agent（plan_generator、section_planner、section_researcher 等）定义在 `agent.py`，无独立模块 |
| callback 与 agent 定义耦合 | `parse_evaluation_callback` 和 `citation_replacement_callback` 定义在 `agent.py` 而非 `callbacks.py` |
| prompt 内联在 agent.py | 每个 agent 的 instruction prompt 占 10-40 行，8 个 agent 的 prompt 总计 ~200 行嵌入在 Python 代码中 |

---

## 修复项一览

```
Fix 1  callback 合并到 callbacks.py              backend/app/callbacks.py            (修改)
Fix 2  research pipeline agent 定义提取           backend/app/agents/research/pipeline.py (新)
Fix 3  prompt 文本提取到独立模块                   backend/app/agents/research/prompts.py  (新)
Fix 4  agent.py 瘦身为组装入口                    backend/app/agent.py                (修改)
Fix 5  custom BaseAgent 子类提取                  backend/app/agents/custom.py        (新)
```

---

## Fix 1：callback 合并到 callbacks.py

**文件：** `backend/app/callbacks.py`（修改）+ `backend/app/agent.py`（修改）

当前状态：
- `callbacks.py` 仅包含 `rate_limit_callback`（67 行）
- `agent.py` 包含 `parse_evaluation_callback`（33 行）和 `citation_replacement_callback`（23 行）

**方案：** 将两个 callback 从 `agent.py` 移到 `callbacks.py`，统一管理。

**`callbacks.py` 新增：**
```python
from google.genai import types as genai_types

def parse_evaluation_callback(callback_context: CallbackContext) -> None:
    """Parses research_evaluator JSON text output into a dict in session state."""
    # ... 从 agent.py 原样搬过来

def citation_replacement_callback(callback_context: CallbackContext) -> genai_types.Content:
    """Replaces <cite source="src-N"/> tags with Markdown links."""
    # ... 从 agent.py 原样搬过来
```

**`agent.py` 变更：**
```python
from .callbacks import (
    rate_limit_callback,
    parse_evaluation_callback,
    citation_replacement_callback,
)
```

**注意：** `test_callbacks.py` 当前从 `app.agent` 导入这些函数，需要同步更新导入路径为 `app.callbacks`。

---

## Fix 2：research pipeline agent 定义提取

**新文件：** `backend/app/agents/research/pipeline.py`

从 `agent.py` 提取以下 agent 定义到独立模块：

| Agent | 当前行数 | 说明 |
|-------|---------|------|
| `plan_generator` | ~48 行 | 含 instruction prompt |
| `section_planner` | ~12 行 | |
| `section_researcher` | ~42 行 | 含 instruction prompt + tools 列表 |
| `research_evaluator` | ~43 行 | 含 instruction prompt |
| `enhanced_search_executor` | ~28 行 | 含 instruction prompt |
| `report_composer` | ~46 行 | 含 instruction prompt |
| `research_pipeline` | ~22 行 | SequentialAgent 组装 |
| `_pipeline_start_callback` | ~3 行 | |
| `_pipeline_end_callback` | ~10 行 | |

**`pipeline.py` 结构：**
```python
"""Research pipeline agent definitions."""
from .prompts import (
    PLAN_GENERATOR_PROMPT,
    SECTION_PLANNER_PROMPT,
    SECTION_RESEARCHER_PROMPT,
    RESEARCH_EVALUATOR_PROMPT,
    ENHANCED_SEARCH_PROMPT,
    REPORT_COMPOSER_PROMPT,
)
from ...callbacks import (
    rate_limit_callback,
    parse_evaluation_callback,
    citation_replacement_callback,
)
from ...config import config
from ..custom import EscalationChecker, PipelineGuard

# ... agent definitions using imported prompts and callbacks

def build_research_pipeline() -> PipelineGuard:
    """Assemble and return the guarded research pipeline."""
    research_pipeline = SequentialAgent(...)
    return PipelineGuard(research_pipeline)
```

需要新建 `backend/app/agents/research/__init__.py`。

---

## Fix 3：prompt 文本提取到独立模块

**新文件：** `backend/app/agents/research/prompts.py`

agent 的 instruction prompt 目前以多行 f-string 形式内联在 agent 定义中，总计约 200 行。
提取为命名常量，便于审查和修改 prompt 时不必在 agent 组装代码中翻找。

```python
"""Prompt constants for research pipeline agents."""
import datetime

_CURRENT_DATE = datetime.datetime.now().strftime("%Y-%m-%d")

PLAN_GENERATOR_PROMPT = f"""
You are a research strategist. Your job is to create a high-level RESEARCH PLAN...
...
Current date: {_CURRENT_DATE}
...
"""

SECTION_PLANNER_PROMPT = """
You are an expert report architect...
"""

SECTION_RESEARCHER_PROMPT = """
You are a highly capable and diligent research and synthesis agent...
"""

RESEARCH_EVALUATOR_PROMPT = f"""
You are a meticulous quality assurance analyst...
...
Current date: {_CURRENT_DATE}
...
"""

ENHANCED_SEARCH_PROMPT = """
You are a specialist researcher executing a refinement pass...
"""

REPORT_COMPOSER_PROMPT = """
Transform the provided data into a polished, professional...
"""
```

**注意：** `_CURRENT_DATE` 是模块级变量，在 import 时求值。这与当前行为一致（当前 f-string 也是在模块加载时求值）。如果需要每次 pipeline 运行时动态注入日期，可后续改为函数参数，但当前不需要（uvicorn --reload 会重新加载模块）。

---

## Fix 4：agent.py 瘦身为组装入口

经过 Fix 1–3 后，`agent.py` 从 462 行缩减为 ~30 行的组装入口：

```python
"""Root agent assembly — thin entry point."""
from google.adk.agents import LlmAgent
from google.adk.apps.app import App
from google.adk.tools.agent_tool import AgentTool

from .agents.research.pipeline import build_research_pipeline, plan_generator
from .config import config

import datetime

guarded_pipeline = build_research_pipeline()

interactive_planner_agent = LlmAgent(
    name="interactive_planner_agent",
    model=config.worker_model,
    description="The primary research assistant...",
    instruction=f"""...(~15 行，仅 root agent 的 prompt)...""",
    sub_agents=[guarded_pipeline],
    tools=[AgentTool(plan_generator)],
    output_key="research_plan",
)

root_agent = interactive_planner_agent
app = App(root_agent=root_agent, name="app")
```

**预期行数：**

| 文件 | 重构前 | 重构后 |
|------|--------|--------|
| `agent.py` | 462 行 | ~40 行 |
| `callbacks.py` | 67 行 | ~130 行（+parse_eval +citation） |
| `agents/research/pipeline.py` | — | ~90 行（agent 定义 + build 函数） |
| `agents/research/prompts.py` | — | ~120 行（6 个 prompt 常量） |
| `agents/custom.py` | — | ~80 行（EscalationChecker + PipelineGuard） |

总代码量基本不变，但职责分离清晰。

---

## Fix 5：custom BaseAgent 子类提取

**新文件：** `backend/app/agents/custom.py`

从 `agent.py` 提取两个 custom BaseAgent 子类：

| 类 | 行数 | 职责 |
|----|------|------|
| `EscalationChecker` | ~17 行 | 检查 research 评估结果，决定是否跳出循环 |
| `PipelineGuard` | ~50 行 | 包裹 research pipeline，捕获异常输出 partial report |

```python
"""Custom BaseAgent subclasses for pipeline control flow."""
import asyncio
import logging
import time
from collections.abc import AsyncGenerator

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.callback_context import CallbackContext
from google.adk.events import Event, EventActions


class EscalationChecker(BaseAgent):
    """Stops the refinement loop when research evaluation passes."""
    ...


class PipelineGuard(BaseAgent):
    """Wraps the research pipeline and emits partial results on failure."""
    ...


def pipeline_start_callback(callback_context: CallbackContext) -> None:
    ...


def pipeline_end_callback(callback_context: CallbackContext) -> None:
    ...
```

pipeline_start/end callback 也移到此处，因为它们是 pipeline 控制流逻辑的一部分。

---

## 重构后的目录结构

```
backend/app/
├── __init__.py
├── agent.py                  ← ~40 行：root_agent 组装 + app 入口
├── callbacks.py              ← ~130 行：rate_limit + parse_eval + citation_replacement
├── config.py                 ← ~30 行（不变）
├── logging_config.py         ← ~110 行（不变）
├── main.py                   ← ~108 行（不变）
├── persistence.py            ← ~91 行（不变）
├── agents/
│   ├── custom.py             ← ~80 行：EscalationChecker + PipelineGuard + pipeline callbacks
│   ├── analysis/
│   │   ├── coordinator.py    ← ~71 行（不变）
│   │   ├── fundamental_agent.py
│   │   ├── macro_agent.py
│   │   └── risk_agent.py
│   └── research/
│       ├── __init__.py
│       ├── pipeline.py       ← ~90 行：research agent 定义 + build_research_pipeline()
│       └── prompts.py        ← ~120 行：6 个 prompt 常量
└── tools/                    ← （不变）
```

---

## 实施顺序

```
步骤 1   backend/app/agents/custom.py          提取 EscalationChecker + PipelineGuard
步骤 2   backend/app/callbacks.py              合并 parse_eval + citation callbacks
步骤 3   backend/app/agents/research/__init__.py + prompts.py  提取 prompt 常量
步骤 4   backend/app/agents/research/pipeline.py              提取 research agent 定义
步骤 5   backend/app/agent.py                  瘦身为 root agent 组装入口
步骤 6   backend/tests/test_callbacks.py       更新导入路径
步骤 7   验证
```

**关键原则：** 每一步完成后 `uv run pytest -m "not network" -v` 必须通过，保证重构过程中不破坏现有功能。

---

## 测试检查清单

```
□ 后端测试
    □ uv run pytest -m "not network" -v → 全部通过
    □ uv run python -m py_compile app/agent.py → 无语法错误
    □ uv run python -m py_compile app/callbacks.py → 无语法错误
    □ uv run python -m py_compile app/agents/custom.py → 无语法错误
    □ uv run python -m py_compile app/agents/research/pipeline.py → 无语法错误

□ 功能回归
    □ 后端启动 → /health 返回 ok
    □ 发起 research 请求 → plan_generator 正常工作
    □ 用户批准计划 → research_pipeline 完整执行
    □ research_evaluator → parse_evaluation_callback 正常解析 JSON
    □ report_composer → citation_replacement_callback 正常替换 <cite> 标签
    □ pipeline 异常 → PipelineGuard 输出 partial report

□ 代码量
    □ agent.py ≤ 50 行
    □ 无函数/类重复定义
    □ 所有 import 可解析（无循环依赖）
```

---

## 不在此次修复范围内的事项

- **引入 ruff / mypy / type checking**：当前 `py_compile` 已在 CI 中验证语法。引入 ruff 需要配置 `ruff.toml`、处理大量 existing violation，属于独立的代码风格统一任务，不在 "代码质量重构" 中。
- **Analysis agent prompt 优化**：`agents/analysis/` 下的 3 个 agent prompt 已在独立文件中，结构清晰，不需要进一步拆分。
- **前端代码质量**：已在 Gap 6 中处理。
- **将 SequentialAgent / LoopAgent 迁移到 Workflow**：ADK 已标记这些为 deprecated，但 Workflow API 尚未稳定。待 ADK 发布正式迁移指南后再处理。
