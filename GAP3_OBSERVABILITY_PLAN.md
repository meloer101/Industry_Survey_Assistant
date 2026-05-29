# Gap 3 可观测性实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 3 列出的可观测性问题

---

## 核查结论（调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| 无 structured logging | 所有模块均已用 `logging.getLogger(__name__)`，但无格式配置（无时间戳格式、无 JSON 输出、部分地方用了 f-string 而非 `%s` 占位符） |
| 无 request_id 关联 | 日志无法将一次完整 research 请求的多个 agent 日志串联 |
| 无 metrics | pipeline 耗时、tool 成功率均未采集 |
| 无 /health endpoint | `main.py` 把 `/health` 列为豁免路径但该路由不存在，前端靠轮询 `/api/docs` 判断就绪 |
| 前端 debug logs 残留 | `App.tsx` 共 **18 条** `console.log`，含完整 SSE JSON dump，正式环境噪音极大 |

---

## 修复项一览

```
Fix 1  结构化日志配置                  backend/app/logging_config.py  (新文件)
                                       backend/app/main.py            (调用配置)
Fix 2  /health endpoint                backend/app/main.py
Fix 3  request_id 中间件               backend/app/main.py
Fix 4  pipeline 计时 callback          backend/app/agent.py
Fix 5  清理前端 debug console.log      frontend/src/App.tsx
```

---

## Fix 1：结构化日志配置

**新文件：** `backend/app/logging_config.py`

**目标：** 统一日志格式，开发环境输出人类可读的带颜色文本，生产环境（`LOG_FORMAT=json`）输出 JSON，
方便接入 Datadog / CloudWatch / Loki 等日志系统。

```python
"""Logging configuration for the investment research platform."""
from __future__ import annotations

import logging
import os
import sys
from datetime import datetime, timezone


LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.environ.get("LOG_FORMAT", "text")  # "text" | "json"


class _TextFormatter(logging.Formatter):
    """Human-readable formatter with timestamp and level."""

    LEVEL_COLORS = {
        "DEBUG":    "\033[36m",   # cyan
        "INFO":     "\033[32m",   # green
        "WARNING":  "\033[33m",   # yellow
        "ERROR":    "\033[31m",   # red
        "CRITICAL": "\033[35m",   # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%S.%f"
        )[:-3] + "Z"
        color = self.LEVEL_COLORS.get(record.levelname, "")
        request_id = getattr(record, "request_id", "-")
        return (
            f"{ts} {color}{record.levelname:<8}{self.RESET} "
            f"[{record.name}] [req={request_id}] {record.getMessage()}"
        )


class _JsonFormatter(logging.Formatter):
    """JSON-lines formatter for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        import json

        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", None),
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    """Call once at startup to configure all loggers."""
    formatter: logging.Formatter
    if LOG_FORMAT == "json":
        formatter = _JsonFormatter()
    else:
        formatter = _TextFormatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(LOG_LEVEL)

    # Suppress noisy third-party loggers at WARNING level
    for noisy in ("httpx", "httpcore", "yfinance", "urllib3", "charset_normalizer"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
```

**`.env.example` 新增两行：**
```
LOG_LEVEL=INFO          # DEBUG | INFO | WARNING | ERROR
LOG_FORMAT=text         # text | json
```

**同时修复 `agent.py` 中的 f-string logging：**
```python
# before (agent.py 中几处)
logging.warning(f"[parse_evaluation_callback] JSON parse failed ... Raw: {raw[:300]}")

# after
logging.warning("[parse_evaluation_callback] JSON parse failed. Raw: %.300s", raw)
```
（`%s` 占位符在日志级别被过滤时不拼接字符串，性能更好。）

---

## Fix 2：`/health` endpoint

**文件：** `backend/app/main.py`

当前 `_EXEMPT_PREFIXES` 豁免了 `/health`，但该路由不存在，
前端只能靠 `/api/docs` 的 HTTP 200 来判断后端就绪，极不优雅。

在 `create_app()` 返回之前注册路由：

```python
from fastapi.responses import JSONResponse
import time

_startup_time = time.time()

def create_app():
    ...
    fast_api_app = get_fast_api_app(...)
    fast_api_app.add_middleware(ApiKeyMiddleware)

    @fast_api_app.get("/health", include_in_schema=False)
    async def health() -> JSONResponse:
        return JSONResponse({
            "status": "ok",
            "uptime_seconds": round(time.time() - _startup_time, 1),
        })

    return fast_api_app
```

**前端同步修改（`App.tsx`）：**
```typescript
// before
const response = await fetch("/api/docs", { ... });

// after
const response = await fetch("/api/health", { ... });
```

---

## Fix 3：request_id 中间件

**文件：** `backend/app/main.py`

每个 HTTP 请求分配唯一 `request_id`，通过 Python `contextvars` 传递给所有
logging 调用，使一次 research 请求的所有 agent 日志可以被 grep 出来。

```python
import uuid
from contextvars import ContextVar

_request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Injects current request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = _request_id_var.get("-")
        return True


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns a unique request_id to each HTTP request."""

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
        token = _request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = rid
            return response
        finally:
            _request_id_var.reset(token)
```

在 `configure_logging()` 调用处也把 `RequestIdFilter` 挂到 root handler：
```python
handler.addFilter(RequestIdFilter())
```

**效果：** 所有日志行自动携带 `req=a3f9c1b2d4e6`，
一行 `grep req=a3f9c1b2d4e6 app.log` 即可拿到完整的请求链路。

---

## Fix 4：pipeline 计时 callback

**文件：** `backend/app/agent.py`

在 `research_pipeline` 的 `SequentialAgent` 上添加 `before_agent_callback` 和
`after_agent_callback`，记录每个子 agent 的起止时间和耗时到日志。

```python
import time

def _pipeline_start_callback(callback_context: CallbackContext) -> None:
    callback_context.state["_pipeline_start_ts"] = time.time()
    logging.info("[pipeline] research_pipeline started")

def _pipeline_end_callback(callback_context: CallbackContext) -> None:
    start = callback_context.state.get("_pipeline_start_ts")
    if start:
        elapsed = round(time.time() - start, 1)
        source_count = len(callback_context.state.get("sources", {}))
        logging.info(
            "[pipeline] research_pipeline finished in %.1fs, sources=%d",
            elapsed, source_count,
        )

research_pipeline = SequentialAgent(
    ...
    before_agent_callback=_pipeline_start_callback,
    after_agent_callback=_pipeline_end_callback,
)
```

**单个 agent 计时**（可选，复用同一 pattern，挂到 `section_researcher` 等关键 agent 上）：
```python
def _agent_timer_before(ctx: CallbackContext) -> None:
    ctx.state[f"_ts_{ctx.agent_name}"] = time.time()

def _agent_timer_after(ctx: CallbackContext) -> None:
    start = ctx.state.get(f"_ts_{ctx.agent_name}")
    if start:
        logging.info("[agent:%s] completed in %.1fs", ctx.agent_name, time.time() - start)
```

> 不引入外部 metrics 库（Prometheus / OpenTelemetry），通过结构化日志已足够
> 用 log aggregation 工具做统计。如未来需要指标大盘再按需接入。

---

## Fix 5：清理前端 debug console.log

**文件：** `frontend/src/App.tsx`

共 18 条 `console.log`，全部是开发期调试用的 SSE 数据 dump，
在生产环境产生大量噪音。统一替换策略：

| 保留 | 删除 |
|------|------|
| `console.error(...)` 真实错误 | `[SSE PARSED EVENT]` 完整 JSON dump |
| `console.log("Backend not ready yet:", error)` | `[SSE EXTRACT] ...` 系列（6 条）|
| | `[SSE HANDLER] ...` 系列（4 条）|
| | `[SSE DISPATCH EVENT]` / `[SSE DISPATCH FINAL EVENT]`（2 条）|
| | `'Creating new session...'` / `'Session created successfully'` |
| | `Attempt N failed, retrying...`（改为 `console.warn`） |

**具体操作：** 逐行删除带 `// DEBUG` 注释的行，以及不带注释但内容是 SSE 内部状态的行；
`Attempt N failed` 改为 `console.warn` 保留，因为它表示一个重试事件值得记录。

---

## 实施顺序

```
步骤 1  backend/app/logging_config.py     新建结构化日志配置
步骤 2  backend/app/main.py               调用 configure_logging()，添加 /health，添加 RequestIdMiddleware
步骤 3  backend/app/.env.example          新增 LOG_LEVEL / LOG_FORMAT 变量
步骤 4  backend/app/agent.py              修复 f-string logging，添加 pipeline 计时 callback
步骤 5  frontend/src/App.tsx              删除 debug console.log，/api/docs → /api/health
步骤 6  手动回归测试
```

---

## 测试检查清单

```
□ 启动后端后观察日志输出，每行包含时间戳、级别、模块名
□ GET /health 返回 {"status":"ok","uptime_seconds":N}
□ 发起一次 research 请求，grep request_id 能拿到完整链路日志
□ pipeline 日志中出现 "research_pipeline finished in Xs, sources=N"
□ 设置 LOG_FORMAT=json，日志输出为 JSON lines
□ 前端 F12 Console：无 [SSE *] 系列日志，无完整 SSE JSON dump
□ console.error 仍正常输出真实错误
□ 完整 research 请求正常完成，报告带 citations
```
