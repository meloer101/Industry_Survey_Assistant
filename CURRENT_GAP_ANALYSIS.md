# 当前项目缺陷与改进分析

> 分析日期：2026-05-29
> 基于对全部源码的逐文件审查，结合已有的 `PRODUCTION_GAP_ANALYSIS.md`

---

## 已修复的问题（不再是缺陷）

| 原 Gap | 修复状态 | 说明 |
|--------|----------|------|
| `.env` 未加入 `.gitignore` | ✅ 已修复 | `.gitignore` 已正确排除 `.env` |
| 无 API Key 认证 | ✅ 已修复 | `main.py` 中 `ApiKeyMiddleware` |
| 无 CORS 配置 | ✅ 已修复 | ADK `get_fast_api_app` 传入 `allow_origins` |
| `time.sleep` 阻塞 event loop | ✅ 已修复 | `callbacks.py` 改用 `asyncio.sleep` |
| 外部工具无 timeout | ✅ 已修复 | 所有工具用 `ThreadPoolExecutor` + `.result(timeout=N)` |
| Pipeline 无容错 | ✅ 已修复 | `PipelineGuard` 捕获异常并输出 partial result |
| 无 structured logging | ✅ 已修复 | `logging_config.py`：JSON/text 双格式 + request_id |
| 零 unit test | ✅ 已修复 | callbacks、tool pure functions、financial tools 均有测试 |
| 无 CI/CD | ✅ 已修复 | GitHub Actions：pytest、py_compile、tsc、npm test |
| 全内存 session | ✅ 已修复 | SQLite 持久化（ADK `session_service_uri`）|
| 无 session 清理 | ✅ 已修复 | `session_cleanup.py` TTL 机制 |
| 前端无 ErrorBoundary | ✅ 已修复 | `ErrorBoundary.tsx` 已存在 |
| 无容器化 | ✅ 已修复 | 前后端 Dockerfile + `docker-compose.yml` |
| 无 health check | ✅ 已修复 | `/health` endpoint + Docker `HEALTHCHECK` 指令 |
| TypeScript strict 未开启 | ✅ 已修复 | `tsconfig.json` 中 `"strict": true` |
| Model 名称硬编码 | ✅ 已修复 | `WORKER_MODEL` / `CRITIC_MODEL` 环境变量 |
| `App.tsx` 过度膨胀 | ✅ 已改善 | SSE/api/types 拆分为独立模块，主文件约 410 行 |
| Rate limiter 竞态条件 | ✅ 已修复 | `rate_limit_callback` 使用 session-scoped `asyncio.Lock` 保护读-改-写 |
| `_latest_fedfunds()` 阻塞风险 | ✅ 已修复 | FRED 获取已包入 `ThreadPoolExecutor` 并支持超时 |
| CSRF 保护边界不明确 | ✅ 已修复 | API key 认证明确为 header-only，不接受 cookie auth |
| `agent.py` 日期在模块加载时固化 | ✅ 已修复 | planner instruction 改为 callable，每次模型请求动态生成当前日期 |
| 前端取消不通知后端 | ✅ 已修复 | 前端 Cancel 调用后端 DELETE run endpoint，后端取消活跃 `/run_sse` task |
| Session 清理无自动调度 | ✅ 已修复 | FastAPI startup/shutdown 注册后台 session cleanup loop |
| 无 metrics 采集 | ✅ 已修复 | `/metrics` 暴露 Prometheus 文本格式 pipeline metrics |
| 无分布式 tracing | ✅ 已修复 | pipeline callbacks 生成 trace id 并创建 OpenTelemetry span |
| CI lint 只做 `py_compile` | ✅ 已修复 | backend dev 依赖加入 `ruff`，CI 执行 `uv run ruff check .` |
| 前端 `console.warn` / `console.log` 残留 | ✅ 已修复 | retry/cancel 日志改为 dev-only，Vite proxy 日志默认关闭 |
| History panel 无分页 | ✅ 已修复 | `/history/{user_id}` 支持 `limit/offset`，前端添加“加载更多” |
| `TavilyClient` 每次搜索都重新创建 | ✅ 已修复 | `tavily_search` 按 API key 复用模块级 client |

---

## 仍然存在的缺陷

### P0 — 安全与稳定性（Critical）

截至 2026-05-30，本文件中列出的 P0 项已全部修复并补充回归测试。
剩余缺陷从 P3 开始。

---

### P1 — 可运维性（Major）

截至 2026-05-30，本文件中列出的 P1 项已全部修复并补充回归测试。
剩余缺陷从 P3 开始。

---

### P2 — 工程质量（Moderate）

截至 2026-05-30，本文件中列出的 P2 项已全部修复并补充回归测试。
剩余缺陷从 P3 开始。

---

### P3 — 功能缺失（Enhancement）

#### 12. Phase 2 HITL checkpoint 未实现
- **说明：** CLAUDE.md 中规划的"研究完成后、分析前的二次用户确认"节点尚未开发。
- **修复方向：** 在 `SequentialAgent` pipeline 中 `analysis_coordinator` 前插入 HITL pause node，等待用户对 research findings 的确认。

#### 13. 无新建会话入口
- **问题：** 对话进行中时没有明显的"新建研究"按钮，用户只能通过 Cancel 隐式重置，体验不佳。
- **修复方向：** 在 header 或 sidebar 添加"新建研究"按钮，触发 `handleCancel` 并重置 sessionId。

#### 14. Report 无导出功能
- **问题：** 最终研究报告只能在网页中查看，无法下载为 PDF 或 Markdown 文件。
- **修复方向：** 前端添加导出按钮，调用 `/api/export/{session_id}` 生成 PDF（`weasyprint`）或直接下载 Markdown 文本。

#### 15. 前端文案国际化不一致
- **问题：** 前端中文英文混杂（如 `"后端服务不可用"` vs `"Sorry, there was an error..."`），无 i18n 框架，维护困难。
- **修复方向：** 统一为中文，或引入 `react-i18next` 支持语言切换。

#### 16. 用户认证与多用户隔离
- **问题：** 无登录系统，`userId` 仅存在 localStorage，可被任意伪造，数据无隔离保证。
- **修复方向：** 接入 OAuth2 / JWT（如 Auth0 或自建），替换 localStorage userId。

---

## 优先级总结

```
P0（已于 2026-05-30 修复）:
  ├── rate_probability.py 中 _latest_fedfunds() 加 ThreadPool 包装
  ├── rate_limit_callback 竞态条件（asyncio.Lock）
  ├── API Key header-only 安全边界文档化
  └── agent.py 日期固化问题（动态注入）

P1（已于 2026-05-30 修复）:
  ├── 前端取消通知后端并取消活跃 run_sse task
  ├── session_cleanup 自动调度（startup/shutdown 后台任务）
  ├── /metrics pipeline 指标
  └── pipeline trace id + OpenTelemetry span

P2（已于 2026-05-30 修复）:
  ├── CI 添加 ruff linter
  ├── TavilyClient 单例缓存
  ├── 前端 console 日志清理（生产构建）
  └── History panel 分页

P3（功能增强）:
  ├── 新建会话按钮
  ├── Report 导出
  ├── Phase 2 HITL checkpoint
  └── 用户认证与多用户隔离
```

---

*本文件基于 2026-05-29 代码快照生成。修复完成后请更新或删除对应条目。*
