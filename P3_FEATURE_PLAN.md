# P3 功能补齐实施计划

> 基于 `CURRENT_GAP_ANALYSIS.md` 中剩余的 P3 功能缺失项
> 制定日期：2026-05-30

---

## 概览

| # | 功能 | 优先级 | 预估工作量 | 涉及层 |
|---|------|--------|-----------|--------|
| 1 | 新建会话按钮 | P3-A | 小 | 前端 |
| 2 | Report 导出（Markdown + PDF） | P3-B | 中 | 前端 + 后端 |
| 3 | Phase 2 HITL checkpoint | P3-C | 大 | 后端（agent pipeline） |
| 4 | 前端文案国际化统一 | P3-D | 中 | 前端 |
| 5 | 用户认证与多用户隔离 | P3-E | 大 | 前后端 |

建议实施顺序：**1 → 2 → 4 → 3 → 5**（从低风险/高可见度到高复杂度）

---

## 1. 新建会话按钮（P3-A）

### 问题
对话进行中只有 Cancel 按钮（取消正在进行的研究），没有明确的"开始新研究"入口。用户必须通过 `window.location.reload()` 重置。

### 现状
- `ChatMessagesView.tsx:181-183` 中已有 `handleNewChat` 但用的是 `window.location.reload()`
- `ChatMessagesView.tsx:196-204` header 中已有"新对话"按钮，但实现是整页刷新

### 方案

#### 1.1 前端：`App.tsx` 新增 `handleNewResearch`

```
位置：App.tsx
```

新增函数，不刷新页面，而是清除状态并创建新 session：

- 调用 `cancelRun()` 通知后端（如果有活跃 run）
- `abort` 当前 SSE 连接
- 重置全部 state：`messages`, `displayData`, `messageEvents`, `websiteCount`, `analysisOutputsRef`
- **将 `sessionId` 和 `appName` 设为 `null`**（关键：下次 submit 时会自动创建新 session）
- 保留 `userId`（同一用户的新会话）

#### 1.2 前端：传递到子组件

- `ChatMessagesView` 接收 `onNewResearch` prop，替换现有的 `handleNewChat`
- header 中的"新对话"按钮调用 `onNewResearch` 而不是 `window.location.reload()`
- `WelcomeScreen` 不需要改动（它本身就是初始态）

#### 1.3 前端：非 loading 态也展示按钮

当前"新对话"按钮始终可见（已在 header 中），只需确保：
- loading 态时弹出确认对话框："研究正在进行中，确定要开始新的研究吗？"
- 非 loading 态时直接执行

### 涉及文件
- `frontend/src/App.tsx` — 新增 `handleNewResearch`，传递给 `ChatMessagesView`
- `frontend/src/components/ChatMessagesView.tsx` — 使用 prop 替换 `window.location.reload()`

### 测试
- 手动验证：发起研究 → 完成后点"新对话" → 回到 WelcomeScreen → 发起新研究正常
- 手动验证：研究进行中点"新对话" → 弹出确认 → 确认后回到 WelcomeScreen

---

## 2. Report 导出（P3-B）

### 问题
最终研究报告只能在网页中查看，无法下载为文件。

### 方案

#### 2.1 Markdown 导出（纯前端）

在 `AnalysisPanel.tsx` 或 `ChatMessagesView.tsx` 的最终报告区域添加"导出 Markdown"按钮：

- 从 `message.content`（已是 markdown 格式）直接构造 Blob
- 如果有 `analysisOutputs`，追加到 markdown 末尾作为附录
- 使用 `URL.createObjectURL` + `<a download>` 触发下载
- 文件名格式：`研究报告_YYYY-MM-DD_HH-mm.md`

```
位置：frontend/src/components/ChatMessagesView.tsx（AiMessageBubble 内，isFinalReport 分支）
```

#### 2.2 PDF 导出（后端辅助）

##### 后端新增 endpoint

```
位置：backend/app/main.py
路由：GET /api/export/{user_id}/{session_id}/pdf
```

逻辑：
1. 从 SQLite session store 读取 session state，提取 `final_cited_report`
2. 同时提取 `macro_analysis_output`、`fundamental_analysis_output`、`risk_analysis_output`
3. 用 `markdown` 库将 markdown 转为 HTML
4. 用 `weasyprint` 渲染为 PDF
5. 返回 `StreamingResponse` with `Content-Disposition: attachment`

##### 后端依赖

```
位置：backend/pyproject.toml
新增：weasyprint, markdown
```

注意：`weasyprint` 需要系统级 cairo/pango 依赖。Docker 中需在 `Dockerfile` 中安装。提供 fallback：如果 `weasyprint` 不可用，返回 422 并引导用户用 Markdown 导出。

##### 前端按钮

在最终报告旁添加"导出 PDF"按钮：
- 调用 `GET /api/export/{userId}/{sessionId}/pdf`
- 接收 blob → 触发下载
- loading 态时显示 spinner
- 错误时 fallback 提示用户使用 Markdown 导出

### 涉及文件
- `frontend/src/components/ChatMessagesView.tsx` — 添加导出按钮组
- `frontend/src/lib/api.ts` — 新增 `exportPdf()` 函数
- `backend/app/main.py` — 新增 `/api/export/...` endpoint
- `backend/app/persistence.py` — 新增 `get_session_report()` 工具函数（从 SQLite 读取报告）
- `backend/pyproject.toml` — 添加 `weasyprint`, `markdown` 依赖
- `backend/Dockerfile` — 安装 cairo/pango 系统依赖

### 测试
- 单元测试：`get_session_report()` 从 mock SQLite 读取正确字段
- 手动验证：完成研究 → 点"导出 Markdown" → 下载的 .md 内容与页面一致
- 手动验证：点"导出 PDF" → 下载的 PDF 正确渲染 markdown 表格和链接

---

## 3. Phase 2 HITL Checkpoint（P3-C）

### 问题
CLAUDE.md 规划了"研究完成后、分析前"的二次用户确认节点，但尚未实现。当前 pipeline 直接从研究跳到分析。

### 现状分析

当前 `research_pipeline`（`pipeline.py:112-132`）是 `SequentialAgent`：
```
section_planner → section_researcher → iterative_refinement_loop → analysis_coordinator → report_composer
```

Phase 1 HITL 在 root agent 层（用户批准计划后才触发 `research_pipeline`）。
Phase 2 需要在 `iterative_refinement_loop` 和 `analysis_coordinator` 之间插入暂停。

### 方案

#### 3.1 设计：Research Summary + HITL Pause

在 `analysis_coordinator` 之前插入一个新的 `LlmAgent`，它的职责是：
1. 读取 `section_research_findings`（session state 中的研究成果）
2. 生成一份结构化的**研究成果摘要**（Research Findings Summary）
3. 将摘要写入 session state（`output_key="research_summary"`）
4. 明确告知用户：研究已完成，以下是发现的关键信息，是否继续进行深度分析？

#### 3.2 实现：新增 `findings_summarizer` agent

```
位置：backend/app/agents/research/pipeline.py
```

```python
findings_summarizer = LlmAgent(
    model=config.worker_model,
    name="findings_summarizer",
    instruction=FINDINGS_SUMMARY_PROMPT,
    output_key="research_summary",
)
```

Prompt 要点：
- 读取 `{section_research_findings}` 和 `{report_sections}`
- 输出 3-5 个关键发现的结构化摘要
- 末尾明确问用户："请确认是否继续进行深度分析，或者需要补充研究某些方面？"

#### 3.3 Pipeline 调整

```python
research_pipeline = SequentialAgent(
    name="research_pipeline",
    sub_agents=[
        section_planner,
        section_researcher,
        LoopAgent(...),
        findings_summarizer,      # NEW: 生成摘要
        # 此处 pipeline 结束，控制权回到 root agent
    ],
)
```

**关键设计决策**：不在 SequentialAgent 内部实现暂停，而是将 pipeline 拆分为两段：

- **`research_pipeline`**：planner → researcher → refinement → summarizer
- **`analysis_pipeline`**（新）：analysis_coordinator → report_composer

Root agent 的 workflow 变为：
1. 用户批准计划 → 调用 `research_pipeline`
2. `research_pipeline` 完成后，root agent 将 `research_summary` 展示给用户
3. 用户确认"继续分析" → root agent 调用 `analysis_pipeline`
4. 用户可以在此节点提出补充要求 → root agent 决定是否需要追加研究

#### 3.4 Root agent instruction 更新

```
位置：backend/app/agent.py
```

更新 `build_interactive_planner_instruction` 中的 workflow 描述：

```
1. Plan:     plan_generator → 用户批准
2. Research: research_pipeline → 展示 research_summary
3. Confirm:  用户确认是否继续分析（可追加研究需求）
4. Analyze:  analysis_pipeline → 生成最终报告
```

#### 3.5 前端适配

前端无需大改。`findings_summarizer` 的输出会通过 root agent 以普通文本消息发给用户。用户用自然语言回复"继续"或提出修改意见，root agent 据此决定下一步。

SSE 层面，`findings_summarizer` 的文本会以 `interactive_planner_agent` 的 author 发出（因为是 root agent 在对话），前端已能正确显示。

需要在 `ActivityTimeline.tsx` 的 label map 中添加 `findings_summarizer` 的友好名称。

### 涉及文件
- `backend/app/agents/research/pipeline.py` — 拆分 pipeline，新增 `findings_summarizer`
- `backend/app/agents/research/prompts.py` — 新增 `FINDINGS_SUMMARY_PROMPT`
- `backend/app/agent.py` — 更新 root agent instruction，注册 `analysis_pipeline` 为 sub_agent
- `frontend/src/components/ActivityTimeline.tsx` — 添加 label 映射

### 测试
- 单元测试：`findings_summarizer` prompt 正确引用 session state keys
- 集成测试（手动）：完整流程 → 研究完成后看到摘要 → 用户确认 → 分析正常执行
- 回归测试：确保 citation pipeline 未被破坏（`citation_replacement_callback` 仍在 `report_composer` 上）

---

## 4. 前端文案国际化统一（P3-D）

### 问题
前端混杂中英文文案：WelcomeScreen 全中文、error messages 英文、某些 UI 元素中文。

### 方案：统一为中文（不引入 i18n 框架）

考虑到本项目面向中文用户群体，且文案量较小（< 50 条），不引入 `react-i18next` 的额外复杂度。将所有文案统一为中文，集中管理。

#### 4.1 创建文案常量文件

```
位置：frontend/src/lib/strings.ts
```

将分散在各组件中的硬编码字符串提取到统一文件：

```typescript
export const STRINGS = {
  APP_TITLE: "AI 投资研究平台",
  APP_SUBTITLE: "将投资研究问题转化为专业分析报告",
  // ...错误信息
  ERROR_BACKEND_UNAVAILABLE: "后端服务不可用",
  ERROR_BACKEND_HINT: "无法连接到后端服务，请检查是否已启动",
  ERROR_REQUEST_FAILED: "请求处理出错",
  ERROR_SESSION_LOAD_FAILED: "历史会话加载失败，请重试",
  // ...按钮文案
  BTN_RETRY: "重试",
  BTN_CANCEL: "取消",
  BTN_NEW_CHAT: "新对话",
  BTN_EXPORT_MD: "导出 Markdown",
  BTN_EXPORT_PDF: "导出 PDF",
  // ...状态提示
  STATUS_THINKING: "思考中...",
  STATUS_LOADING_HISTORY: "已加载历史会话，暂无可显示的消息。",
  // ...等
} as const;
```

#### 4.2 逐文件替换

| 文件 | 改动 |
|------|------|
| `App.tsx` | error messages → `STRINGS.ERROR_*` |
| `ChatMessagesView.tsx` | "思考中..."、"新对话"等 → `STRINGS.*` |
| `WelcomeScreen.tsx` | 已是中文，提取到 `STRINGS` |
| `HistoryPanel.tsx` | 面板标题等 → `STRINGS.*` |
| `BackendLoadingScreen.tsx` | loading 文案 → `STRINGS.*` |
| `InputForm.tsx` | placeholder 等 → `STRINGS.*` |

#### 4.3 未来扩展路径

如果未来需要多语言支持，`STRINGS` 对象的 key 结构可以直接映射为 i18n key，迁移成本低。

### 涉及文件
- `frontend/src/lib/strings.ts` — 新建
- `frontend/src/App.tsx` — 替换硬编码文案
- `frontend/src/components/*.tsx` — 各组件替换文案引用

### 测试
- 全局搜索英文字符串确认无遗漏
- 手动验证各页面文案显示正确

---

## 5. 用户认证与多用户隔离（P3-E）

### 问题
当前无登录系统，`userId` 存在 `localStorage`，可伪造，无数据隔离。

### 方案：JWT 认证（自建轻量方案）

考虑到这是学习/演示项目，不接入 Auth0 等第三方服务，自建简单 JWT 认证。

#### 5.1 后端：认证模块

```
位置：backend/app/auth.py（新建）
```

##### 用户存储
- SQLite 存储用户表（复用现有 SQLite session DB 或独立文件）
- 表结构：`users(id TEXT PK, email TEXT UNIQUE, password_hash TEXT, created_at TEXT)`
- 密码用 `bcrypt` 或 `passlib[bcrypt]` 哈希

##### JWT 签发
- `PyJWT` 签发 access token（1h 过期）+ refresh token（7d 过期）
- `JWT_SECRET` 从环境变量读取
- Token payload：`{ "sub": user_id, "exp": ..., "iat": ... }`

##### 认证 endpoints

| 路由 | 方法 | 说明 |
|------|------|------|
| `/auth/register` | POST | 注册新用户（email + password） |
| `/auth/login` | POST | 登录，返回 JWT |
| `/auth/refresh` | POST | 用 refresh token 换 access token |
| `/auth/me` | GET | 返回当前用户信息 |

##### 认证中间件

新增 `JwtAuthMiddleware`，与现有 `ApiKeyMiddleware` 并行：
- 检查 `Authorization: Bearer <token>` header
- 解码 JWT，将 `user_id` 注入 `request.state.user_id`
- 未认证时返回 401

**兼容策略**：通过环境变量 `AUTH_MODE` 控制：
- `AUTH_MODE=none`（默认）：保持现有行为，无需登录
- `AUTH_MODE=jwt`：启用 JWT 认证

#### 5.2 后端：数据隔离

ADK 的 session 已经按 `user_id` 隔离（session 创建时绑定 userId）。启用 JWT 后：

- 从 JWT 中提取 `user_id`，覆盖请求中客户端传入的 `userId`
- 确保 `GET /history/{user_id}` 只返回当前登录用户的数据（中间件校验 path 中的 `user_id` 与 JWT 中的一致）

#### 5.3 前端：登录/注册页面

```
位置：frontend/src/components/AuthPage.tsx（新建）
```

- 简洁的登录/注册表单（email + password）
- 调用 `/auth/login` 或 `/auth/register`
- 成功后将 JWT 存入 `localStorage`
- 后续所有 API 请求在 header 中携带 `Authorization: Bearer <token>`

##### 路由守卫

```
位置：frontend/src/App.tsx
```

- 检查 localStorage 中是否有有效 JWT（未过期）
- 无 JWT → 显示 `AuthPage`
- 有 JWT → 显示正常应用
- JWT 过期 → 尝试 refresh，失败则跳回登录

#### 5.4 前端：`api.ts` 改造

- `authHeaders()` 函数改为优先使用 JWT：
  ```typescript
  export function authHeaders(): Record<string, string> {
    const token = localStorage.getItem("auth_token");
    if (token) return { Authorization: `Bearer ${token}` };
    return API_KEY ? { "X-API-Key": API_KEY } : {};
  }
  ```
- `userId` 不再由前端生成，而是从 `/auth/me` 或 JWT decode 获取

#### 5.5 后端依赖

```
位置：backend/pyproject.toml
新增：PyJWT, passlib[bcrypt]
```

### 涉及文件
- `backend/app/auth.py` — 新建：用户模型、JWT 工具、认证 endpoints
- `backend/app/main.py` — 注册 auth 路由，条件启用 `JwtAuthMiddleware`
- `backend/app/.env.example` — 添加 `AUTH_MODE`, `JWT_SECRET`
- `backend/pyproject.toml` — 新增依赖
- `frontend/src/components/AuthPage.tsx` — 新建：登录/注册界面
- `frontend/src/lib/api.ts` — 改造 auth header 逻辑
- `frontend/src/App.tsx` — 添加登录状态判断

### 测试
- 单元测试：JWT 签发/验证、密码哈希
- 单元测试：中间件对 authenticated/unauthenticated 请求的处理
- 手动验证：注册 → 登录 → 发起研究 → 退出 → 重新登录看到历史记录
- 手动验证：不同用户看不到彼此的 session

---

## 实施时间线

```
Week 1:
  ├── Day 1-2: #1 新建会话按钮（前端改动小，快速完成）
  └── Day 3-5: #2 Report 导出（Markdown 优先，PDF 后做）

Week 2:
  ├── Day 1-2: #4 文案国际化统一（提取 + 替换）
  └── Day 3-5: #3 Phase 2 HITL（pipeline 拆分 + root agent 改造）

Week 3:
  └── Day 1-5: #5 用户认证（后端 auth 模块 + 前端登录页 + 集成测试）
```

---

## 风险与注意事项

1. **Phase 2 HITL 是最高风险项**：拆分 pipeline 可能影响 citation 系统。实施时必须确保 `citation_replacement_callback` 仍然挂在 `report_composer` 上，且 `collect_research_sources_callback` 的 sources 数据在 pipeline 拆分后仍能正确传递（通过 session state）。

2. **PDF 导出的系统依赖**：`weasyprint` 需要 cairo/pango C 库。Docker 环境需要更新 Dockerfile。本地开发如果安装困难，先只做 Markdown 导出。

3. **JWT 认证的安全考量**：
   - `JWT_SECRET` 必须足够长（32+ 字符）
   - Refresh token 需要服务端存储以支持撤销
   - 考虑 rate limiting 登录尝试（防暴力破解）
   - 本项目定位为学习/演示，不建议暴露到公网

4. **向后兼容**：所有新功能通过 feature flag / 环境变量控制，确保不影响现有功能：
   - PDF 导出：weasyprint 不可用时 graceful degradation
   - JWT 认证：`AUTH_MODE=none` 保持原有行为
   - Phase 2 HITL：可考虑配置开关，但建议直接实现（不存在兼容性问题）

---

*本计划基于 2026-05-30 代码快照制定。实施时请参照最新代码状态调整细节。*
