# Phase 4 — Frontend: Investment UX — 详细实施计划

## 目标

将 UI 从通用的 deep-search 外观转变为投资研究工具的专业体验，同时不破坏
底层 SSE/session 机制。

---

## 当前状态分析

### 已有组件
| 文件 | 状态 | 说明 |
|------|------|------|
| `App.tsx` | 已有 Phase 3 的 agent label map | `getEventTitle()` 已覆盖分析 agent |
| `WelcomeScreen.tsx` | 通用 deep-search 外观 | 标题 "Deep Search - ADK"，通用示例 |
| `InputForm.tsx` | 仅文本输入 | 无 ticker 字段、无研究类型选择器 |
| `ActivityTimeline.tsx` | 功能完整 | 无颜色区分研究 vs 分析步骤 |
| `ChatMessagesView.tsx` | 功能完整 | 无独立分析面板 |

### 已有依赖（无需新增）
- `@radix-ui/react-tabs` — 用于 AnalysisPanel
- `@radix-ui/react-select` — 用于研究类型选择器
- `lucide-react` — 图标库
- `react-markdown` + `remark-gfm` — Markdown 渲染

---

## 任务分解

### Task 4.1 — WelcomeScreen 投资主题改造

**文件**: `frontend/src/components/WelcomeScreen.tsx`

**改动**:
1. 更新标题: `"✨ Deep Search - ADK 🚀"` → `"AI 投资研究平台"`（或英文 "AI Investment Research"）
2. 更新副标题: `"Turns your questions into comprehensive reports!"` → `"将投资研究问题转化为专业分析报告"`
3. 添加示例查询芯片（Example Query Chips）:
   - `"美联储降息路径分析"`
   - `"NVDA Q4财报解读"`
   - `"中美贸易摩擦对半导体的影响"`
   - `"黄金避险价值与通胀对冲分析"`
4. 芯片点击时直接填充 InputForm 并提交

**实现细节**:
```
- 新增 exampleQueries 数组，每项包含 label + query
- 芯片使用 Button variant="outline"，排列在输入框上方
- 点击芯片调用 handleSubmit(query)
```

**验收标准**: 欢迎页面显示投资主题示例，点击芯片直接发起研究

---

### Task 4.2 — InputForm 增强

**文件**: `frontend/src/components/InputForm.tsx`

**改动**:
1. 添加可选 ticker 输入框（小型 Input 组件）
   - placeholder: `"股票代码 (可选)"`
   - 位于主文本框左上方或右侧
   - 如果填写，提交时追加到查询: `"[TICKER: NVDA] 原始查询"`
2. 添加研究类型选择器（Select 组件）
   - 选项: `"通用研究" | "宏观政策" | "个股分析"`
   - 默认: `"通用研究"`
   - 提交时追加到查询: `"[RESEARCH_TYPE: macro] 原始查询"`
3. 更新 homepage placeholder: `"输入投资研究主题，例如：美联储加息对科技股的影响"`
4. 更新 chat placeholder: `"回复 Agent，调整计划，或输入 'Looks good' 确认..."`

**Props 变更**:
```typescript
interface InputFormProps {
  onSubmit: (query: string) => void;
  isLoading: boolean;
  context?: 'homepage' | 'chat';
}
```

`onSubmit` 签名不变——ticker 和 research type 作为前缀拼接到 query 字符串中，
由后端 `interactive_planner_agent` prompt 解析。这避免了修改 SSE 协议。

**实现细节**:
```
- homepage context: 显示 ticker + research type + textarea 三行布局
- chat context: 仅显示 textarea（与当前一致）
- 使用 @radix-ui/react-select 的 Select 组件（已有 ui/select.tsx）
- 使用 ui/input.tsx 作为 ticker 输入
```

**验收标准**: 填入 ticker 和研究类型后，提交的 query 包含结构化前缀

---

### Task 4.3 — AnalysisPanel 新组件

**文件**: `frontend/src/components/AnalysisPanel.tsx`（新建）

**功能**: 分析输出的选项卡式面板

**Tab 结构**:
| Tab | 状态键 | 显示条件 |
|-----|--------|----------|
| 完整报告 | `final_report_with_citations` | 始终显示（主报告） |
| 宏观分析 | `macro_analysis_output` | 仅当 SSE state delta 包含该键 |
| 基本面 | `fundamental_analysis_output` | 仅当 SSE state delta 包含该键 |
| 风险评估 | `risk_analysis_output` | 仅当 SSE state delta 包含该键 |

**实现细节**:

1. **数据流**:
   - `App.tsx` 的 `extractDataFromSSE` 已从 `parsed.actions.stateDelta` 提取数据
   - 新增状态: `analysisOutputs: Record<string, string>` 存储各分析 agent 的输出
   - 从 SSE 事件中检测 `stateDelta` 中的 `macro_analysis_output`、
     `fundamental_analysis_output`、`risk_analysis_output` 键
   - 将提取的值传入 `AnalysisPanel`

2. **组件结构**:
   ```tsx
   <Tabs defaultValue="report">
     <TabsList>
       <TabsTrigger value="report">完整报告</TabsTrigger>
       {macroOutput && <TabsTrigger value="macro">宏观分析</TabsTrigger>}
       {fundamentalOutput && <TabsTrigger value="fundamental">基本面</TabsTrigger>}
       {riskOutput && <TabsTrigger value="risk">风险评估</TabsTrigger>}
     </TabsList>
     <TabsContent value="report">...</TabsContent>
     <TabsContent value="macro">...</TabsContent>
     ...
   </Tabs>
   ```

3. **渲染**: 每个 Tab 内容使用 `ReactMarkdown` + `remarkGfm` + 现有 `mdComponents`

4. **集成点** — 修改 `ChatMessagesView.tsx`:
   - 当 `finalReportWithCitations` 消息出现时，在报告下方展示 `AnalysisPanel`
   - 或者：替换现有的单一报告展示，用 `AnalysisPanel` 包裹

**App.tsx 数据提取改动**:
```typescript
// 在 extractDataFromSSE 中新增:
let analysisOutputs: Record<string, string> = {};
if (parsed.actions?.stateDelta) {
  const delta = parsed.actions.stateDelta;
  for (const key of ['macro_analysis_output', 'fundamental_analysis_output', 'risk_analysis_output']) {
    if (delta[key]) analysisOutputs[key] = delta[key];
  }
}
```

**验收标准**: 分析 agent 完成后，选项卡自动出现；点击可切换查看各分析结果

---

### Task 4.4 — ActivityTimeline 颜色区分

**文件**: `frontend/src/components/ActivityTimeline.tsx`

**改动**:

1. 添加分类函数 `getEventCategory`:
   ```typescript
   type EventCategory = 'research' | 'analysis' | 'other';
   
   const getEventCategory = (title: string): EventCategory => {
     const analysisKeywords = [
       'Financial Analysis', 'Macro', 'Fundamental',
       'Risk Assessment', 'Coordinating'
     ];
     const researchKeywords = [
       'Research', 'Planning', 'Structuring',
       'Evaluating', 'Quality', 'Web Research'
     ];
     if (analysisKeywords.some(k => title.includes(k))) return 'analysis';
     if (researchKeywords.some(k => title.includes(k))) return 'research';
     return 'other';
   };
   ```

2. 根据分类设置颜色:
   - **研究步骤 (research)**: 蓝色系 — `bg-blue-600`, `ring-blue-900`, 连接线 `bg-blue-800`
   - **分析步骤 (analysis)**: 琥珀色系 — `bg-amber-600`, `ring-amber-900`, 连接线 `bg-amber-800`
   - **其他**: 保持现有灰色

3. 在 timeline 头部添加图例说明（小圆点 + 文字）:
   ```
   🔵 研究    🟡 分析
   ```

4. 更新 `getEventIcon` 函数，分析步骤使用不同图标:
   - 宏观分析: `TrendingUp` (lucide)
   - 基本面分析: `BarChart3` (lucide)
   - 风险评估: `Shield` (lucide)
   - 协调器: `GitBranch` (lucide)

**验收标准**: Timeline 中研究步骤为蓝色，分析步骤为琥珀色，视觉区分明显

---

### Task 4.5 — BackendLoadingScreen 品牌更新

**文件**: `frontend/src/App.tsx`

**改动**:
1. 更新加载页标题: `"Deep Search - ADK"` → `"AI 投资研究平台"`
2. 更新加载提示文字为中文

**验收标准**: 加载页面显示投资研究平台品牌

---

### Task 4.6 — Session 管理验证

**文件**: `frontend/src/App.tsx`

**验证项**:
1. 确认 `uuidv4()` session ID 正常工作（已在 deep-search 中实现）
2. 确认不添加用户认证（单匿名用户，适合 portfolio 展示）
3. 确认 "New Chat" 按钮正确重置所有状态（包括新增的 `analysisOutputs`）

**改动**: 仅在发现问题时修改，否则标记为验证通过

---

## 实施顺序

```
Step 1: Task 4.5 — BackendLoadingScreen 品牌更新 (最简单，热身)
Step 2: Task 4.1 — WelcomeScreen 投资主题改造
Step 3: Task 4.2 — InputForm 增强 (ticker + research type)
Step 4: Task 4.3 — AnalysisPanel 新组件 (核心功能)
         ↳ 含 App.tsx 数据提取改动 + ChatMessagesView 集成
Step 5: Task 4.4 — ActivityTimeline 颜色区分
Step 6: Task 4.6 — Session 管理验证
Step 7: 端到端测试 — 启动前后端，验证完整流程
```

---

## 不改动的部分

- SSE 通信协议 — 不变
- `createSession` / `retryWithBackoff` — 不变
- `processSseEventData` 核心逻辑 — 仅追加分析输出提取，不修改现有逻辑
- `report_composer_with_citations` 消息处理 — 不变
- citation 渲染机制 — 不变

---

## 风险与注意事项

| 风险 | 缓解措施 |
|------|----------|
| 分析输出可能在 SSE `stateDelta` 中分多次发送 | 使用累加策略，后续 delta 覆盖前一次 |
| Tabs 组件在无分析输出时不应显示空标签 | 条件渲染，仅当对应 key 有值时显示 Tab |
| ticker + research type 前缀可能干扰 LLM 理解 | 使用结构化标记 `[TICKER: ...]` 方便 prompt 解析 |
| 中文 UI 文案可能影响非中文用户 | 保持核心功能标签双语，示例查询用中文（目标用户群） |
