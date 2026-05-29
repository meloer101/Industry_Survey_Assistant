# Gap 6 前端重构实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 6 列出的前端工程质量问题

---

## 核查结论（调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| `App.tsx` 过度膨胀 | 625 行，SSE parsing + session 管理 + UI routing 全部耦合 |
| 无 state management | 11 个 `useState` + 4 个 `useRef` 混杂在 App 顶层 |
| 类型安全 | `tsconfig.json` 已有 `strict: true` ✓；但仍有 `any` 出现（SSE parsed data、ProcessedEvent.data） |
| 无 Error Boundary | 任一 component render 异常 → 整页白屏 |
| `ProcessedEvent` 类型重复定义 | `App.tsx`、`ChatMessagesView.tsx`、`ActivityTimeline.tsx` 各自定义了相同的 `ProcessedEvent` interface |
| `MdComponentProps` 重复 | `ChatMessagesView.tsx` 和 `AnalysisPanel.tsx` 各自定义了完全相同的 markdown 组件映射 |
| `BackendLoadingScreen` 内联 | App.tsx 内部定义了一个 200+ 行间距的 inline component，每次 App render 都重新创建 |
| 前端组件总行数 | 1808 行（含 App.tsx 625，ChatMessagesView 392，ActivityTimeline 289）|

---

## 修复项一览

```
Fix 1  提取 SSE 解析层            frontend/src/lib/sse.ts            (新, 由 Gap 5 前置)
Fix 2  提取 session/API 层        frontend/src/lib/api.ts            (新)
Fix 3  提取共享类型               frontend/src/types.ts              (新)
Fix 4  提取共享 Markdown 组件     frontend/src/lib/markdown.tsx      (新)
Fix 5  App.tsx 瘦身               frontend/src/App.tsx               (修改)
Fix 6  Error Boundary             frontend/src/components/ErrorBoundary.tsx (新)
Fix 7  BackendLoadingScreen 提取  frontend/src/components/BackendLoadingScreen.tsx (新)
Fix 8  消除剩余 any 类型          多文件
```

---

## Fix 1：提取 SSE 解析层（与 Gap 5 共用）

**新文件：** `frontend/src/lib/sse.ts`

从 `App.tsx` 提取 3 个纯函数：

```typescript
// --- Types ---
export interface SseExtractResult {
  textParts: string[];
  agent: string;
  finalReportWithCitations: string | undefined;
  functionCall: FunctionCallData | null;
  functionResponse: FunctionResponseData | null;
  sourceCount: number;
  sources: Record<string, SourceInfo> | null;
  newAnalysisOutputs: AnalysisOutputs;
}

interface FunctionCallData {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface FunctionResponseData {
  name: string;
  response: unknown;
  id: string;
}

interface SourceInfo {
  title: string;
  url: string;
  domain: string;
}

// --- Functions ---
export function extractDataFromSSE(data: string): SseExtractResult { ... }
export function getEventTitle(agentName: string): string { ... }
export function getFunctionTitle(funcName: string, type: "call" | "response"): string { ... }
```

**App.tsx 变更：** 删除这 3 个函数定义，改为 `import { extractDataFromSSE, ... } from "@/lib/sse"`。

---

## Fix 2：提取 session/API 层

**新文件：** `frontend/src/lib/api.ts`

从 `App.tsx` 提取 `createSession`、`checkBackendHealth`、`retryWithBackoff`，
以及 `authHeaders` / `requestHeaders` 常量。

```typescript
const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export function authHeaders(): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY } : {};
}

export const requestHeaders = authHeaders();

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries?: number,
  maxDuration?: number,
): Promise<T> { ... }

export async function createSession(
  signal?: AbortSignal,
  existingUserId?: string | null,
): Promise<{ userId: string; sessionId: string; appName: string }> { ... }

export async function checkBackendHealth(): Promise<boolean> { ... }
```

**App.tsx 变更：** 删除这些函数/常量，改为 `import { ... } from "@/lib/api"`。

---

## Fix 3：提取共享类型

**新文件：** `frontend/src/types.ts`

当前 `ProcessedEvent`、`MessageWithAgent`、`AnalysisOutputs` 在多处重复定义。
统一到一个文件：

```typescript
import type { AnalysisOutputs } from "@/components/AnalysisPanel";

export interface ProcessedEvent {
  title: string;
  data: SseEventData;
}

export type SseEventData =
  | { type: "text"; content: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown>; id: string }
  | { type: "functionResponse"; name: string; response: unknown; id: string }
  | { type: "sources"; content: Record<string, { title: string; url: string }> };

export interface MessageWithAgent {
  type: "human" | "ai";
  content: string;
  id: string;
  agent?: string;
  finalReportWithCitations?: boolean;
  analysisOutputs?: AnalysisOutputs;
}

export type { AnalysisOutputs };
```

**注意：** `ProcessedEvent.data` 原来是 `any`，改为 discriminated union `SseEventData`。
这是此次重构中消除 `any` 的主要收益。

---

## Fix 4：提取共享 Markdown 组件

**新文件：** `frontend/src/lib/markdown.tsx`

`ChatMessagesView.tsx` 和 `AnalysisPanel.tsx` 各自定义了几乎相同的 `mdComponents`。
提取一份共享版本：

```tsx
import type { ReactNode } from "react";
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";

interface MdComponentProps {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

export const mdComponents: Record<string, React.FC<MdComponentProps>> = {
  h1: ({ className, children, ...props }) => ( ... ),
  h2: ({ className, children, ...props }) => ( ... ),
  // ... 其余元素映射保持现有 ChatMessagesView 中的样式
};
```

**ChatMessagesView.tsx / AnalysisPanel.tsx 变更：**
```typescript
import { mdComponents } from "@/lib/markdown";
```
删除各自的 `MdComponentProps` 和 `mdComponents` 定义。

---

## Fix 5：App.tsx 瘦身

经过 Fix 1–4 后，App.tsx 的预期变化：

| 提取前 | 行数 | 提取后 | 行数 |
|--------|------|--------|------|
| SSE 解析（extractDataFromSSE, getEventTitle, getFunctionTitle） | ~120 行 | → `lib/sse.ts` | 0 |
| API 层（createSession, checkBackendHealth, retryWithBackoff, authHeaders） | ~75 行 | → `lib/api.ts` | 0 |
| 类型定义（ProcessedEvent, MessageWithAgent, DisplayData） | ~15 行 | → `types.ts` | 0 |
| BackendLoadingScreen 组件 | ~35 行 | → `components/BackendLoadingScreen.tsx` | 0 |
| **总计** | **~245 行** | | **~380 行** |

App.tsx 从 625 行降至约 380 行，只保留：
- state 声明（11 个 useState + 4 个 useRef）
- `processSseEventData`（SSE 到 state 的桥接逻辑）
- `handleSubmit`（fetch + SSE reader loop）
- `handleCancel`、`handleSelectHistorySession`
- `useEffect` 钩子（scroll、backend health check）
- 渲染 JSX

---

## Fix 6：Error Boundary

**新文件：** `frontend/src/components/ErrorBoundary.tsx`

React class component（Error Boundary 必须用 class）：

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
            <h2 className="text-xl font-bold text-red-600 mb-2">页面出错了</h2>
            <p className="text-gray-600 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              刷新页面
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

**`main.tsx` 中包裹：**
```tsx
import { ErrorBoundary } from "@/components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
```

---

## Fix 7：BackendLoadingScreen 提取

**新文件：** `frontend/src/components/BackendLoadingScreen.tsx`

将 App.tsx 中的 `BackendLoadingScreen` 内联组件移为独立文件。
当前它定义在 `App()` 函数体内部，导致每次 App render 都重新创建组件定义。

```tsx
export function BackendLoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* 现有 JSX 直接搬过来 */}
    </div>
  );
}
```

---

## Fix 8：消除剩余 `any` 类型

提取 `types.ts` 后的主要消除目标：

| 文件 | 原 `any` 用法 | 替换为 |
|------|--------------|--------|
| `App.tsx` → `processSseEventData` | `newAnalysisOutputs: AnalysisOutputs` | 已有类型，无 any |
| `ChatMessagesView.tsx:262` | `message.agent?: string` prop 中 `[key: string]: any` | `[key: string]: unknown` |
| `ActivityTimeline.tsx:84` | `formatEventData(data: any)` | `formatEventData(data: SseEventData)` |
| `ActivityTimeline.tsx:118` | `isJsonData(data: any)` | `isJsonData(data: SseEventData)` |
| SSE parser parts | `part.text`, `part.functionCall` | typed via `SsePart` interface |

**注意：** 第三方库（react-markdown `components` prop）的 `any` 不消除，
那是上游类型定义的限制。

---

## 重构后的文件结构

```
frontend/src/
├── main.tsx                    ← ErrorBoundary 包裹 App
├── App.tsx                     ← ~380 行（state + handlers + JSX routing）
├── types.ts                    ← 共享接口：MessageWithAgent, ProcessedEvent, SseEventData
├── utils.ts                    ← cn() helper (不变)
├── lib/
│   ├── api.ts                  ← createSession, checkBackendHealth, retryWithBackoff, authHeaders
│   ├── sse.ts                  ← extractDataFromSSE, getEventTitle, getFunctionTitle
│   └── markdown.tsx            ← 共享 mdComponents 映射
├── components/
│   ├── ErrorBoundary.tsx       ← React class Error Boundary
│   ├── BackendLoadingScreen.tsx← 后端加载等待画面
│   ├── HistoryPanel.tsx        ← (已有)
│   ├── WelcomeScreen.tsx       ← (不变)
│   ├── InputForm.tsx           ← (不变)
│   ├── ChatMessagesView.tsx    ← 删除本地 mdComponents / ProcessedEvent，从 lib/ 导入
│   ├── ActivityTimeline.tsx    ← 删除本地 ProcessedEvent，从 types.ts 导入
│   ├── AnalysisPanel.tsx       ← 删除本地 mdComponents，从 lib/ 导入
│   └── ui/                     ← shadcn 组件 (不变)
└── __tests__/
    └── sse-parser.test.ts      ← (Gap 5 新增)
```

---

## 实施顺序

```
步骤 1   frontend/src/types.ts                  提取共享类型
步骤 2   frontend/src/lib/sse.ts                 提取 SSE 解析函数
步骤 3   frontend/src/lib/api.ts                 提取 API/session 函数
步骤 4   frontend/src/lib/markdown.tsx            提取共享 markdown 组件
步骤 5   frontend/src/components/ErrorBoundary.tsx
步骤 6   frontend/src/components/BackendLoadingScreen.tsx
步骤 7   frontend/src/App.tsx                    瘦身：导入替换内联定义
步骤 8   frontend/src/main.tsx                   包裹 ErrorBoundary
步骤 9   frontend/src/components/ChatMessagesView.tsx   导入共享类型和 mdComponents
步骤 10  frontend/src/components/ActivityTimeline.tsx   导入共享类型，消除 any
步骤 11  frontend/src/components/AnalysisPanel.tsx      导入共享 mdComponents
步骤 12  npx tsc --noEmit + npm run dev                 编译验证 + 手动 UI 测试
```

**关键原则：** 每一步完成后 `npx tsc --noEmit` 必须通过，保证重构过程中类型安全不退化。

---

## 测试检查清单

```
□ TypeScript 编译
    □ npx tsc --noEmit → 零错误
    □ grep -r "any" src/ 排除 node_modules → 仅剩第三方库回调签名中的 any

□ 功能回归
    □ 启动 dev server → 首页显示 WelcomeScreen
    □ 后端未启动时 → BackendLoadingScreen 正常显示（无白屏）
    □ 发起 research 请求 → SSE timeline 正常更新
    □ 完整报告 → AnalysisPanel tabs 可切换
    □ 故意在某 component 中 throw → ErrorBoundary 显示错误提示（非白屏）

□ 代码量
    □ App.tsx ≤ 400 行
    □ 新增 lib/ 目录总共 ≤ 300 行
    □ 无类型/逻辑重复定义
```

---

## 不在此次修复范围内的事项

- **引入 Zustand / Jotai 状态管理**：当前 11 个 useState 虽多，但它们之间的依赖关系简单，
  没有 prop drilling 超过 2 层的问题（HistoryPanel 通过 App → props 直达）。
  引入状态库的收益不足以覆盖迁移成本。如果后续增加多页面路由或复杂跨组件通信再考虑。
- **Responsive design / Accessibility**：属于 Gap 9 功能增强，不在前端重构范围内。
- **i18n framework**：需要产品决策（是否真正需要多语言），暂不引入。
