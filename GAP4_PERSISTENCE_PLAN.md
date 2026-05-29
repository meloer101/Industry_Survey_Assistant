# Gap 4 状态管理 & 持久化实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 4 列出的持久化问题

---

## 核查结论（调查后的实际状态）

> ⚠️ **重要发现：** Gap 4 的原始描述"全内存 session state"**已经不准确**。
> 实测发现 `backend/app/.adk/session.db` 已存在，包含 4 张表：
> `app_states`、`user_states`、`sessions`、`events`，已积累 21 个 session、361 个 events。
>
> ADK 的 `get_fast_api_app` 默认启用本地 SQLite 持久化（`use_local_storage=True`），
> 服务重启后 session 不会丢失。**这个最大的 Gap 已经自动修复了。**

| 问题 | 实际状态 |
|------|----------|
| 全内存 session，重启丢失 | ✅ **已由 ADK 默认 SQLite 解决**，`app/.adk/session.db` 存在且有数据 |
| 无数据库，无 report 持久化 | ⚠️ Session/events 持久化了，但 session.db 路径硬编码在 `.adk/` 内，无法配置为 PostgreSQL |
| 无 session 过期/清理 | ❌ 老 session 无限积累，`events` 表可能无限增长 |
| 无 research history 浏览 | ❌ 前端无任何历史记录 UI，用户无法查看过去的报告 |

---

## 修复项一览

```
Fix 1  显式配置 session_service_uri        backend/app/main.py
                                            backend/app/.env.example
Fix 2  session 清理脚本                    backend/app/tools/session_cleanup.py  (新文件)
Fix 3  history API endpoint               backend/app/main.py
Fix 4  前端历史记录侧边栏                   frontend/src/components/HistoryPanel.tsx  (新文件)
                                            frontend/src/App.tsx
```

---

## Fix 1：显式配置 session_service_uri

**背景：** 当前 `main.py` 调用 `get_fast_api_app(...)` 不传 `session_service_uri`，
ADK 隐式使用 `app/.adk/session.db`。这样有两个问题：
1. 路径不可控，换机器部署时数据库不知道在哪
2. 无法在生产切换到 PostgreSQL

**文件：** `backend/app/main.py`

```python
SESSION_DB_URL = os.environ.get(
    "SESSION_DB_URL",
    f"sqlite:///{Path(__file__).parent / '.adk' / 'session.db'}",
)

def create_app():
    fast_api_app = get_fast_api_app(
        agents_dir=str(Path(__file__).parent.parent),
        web=False,
        allow_origins=allow_origins,
        session_service_uri=SESSION_DB_URL,   # ← 显式传入
    )
    ...
```

**`.env.example` 新增：**
```
# Session 持久化数据库 URL
# 默认：SQLite（本地开发）
# 生产：改为 postgresql+asyncpg://user:pass@host/dbname
SESSION_DB_URL=sqlite:///app/.adk/session.db
```

**效果：**
- 本地开发：行为与现在完全一致（路径不变）
- 生产部署：设置 `SESSION_DB_URL=postgresql://...` 即可切换，无需改代码

---

## Fix 2：session 清理脚本

**背景：** events 表无限增长。一次 research 约产生 50–100 个 events，
长时间运行后 SQLite 文件会持续膨胀，查询速度下降。

**新文件：** `backend/app/tools/session_cleanup.py`

```python
"""Prune sessions and events older than a configurable TTL."""
from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "30"))
DEFAULT_DB_PATH = Path(__file__).parent.parent / ".adk" / "session.db"


def cleanup_old_sessions(
    db_path: Path = DEFAULT_DB_PATH,
    ttl_days: int = DEFAULT_TTL_DAYS,
) -> dict[str, int]:
    """Delete sessions and their events older than ttl_days.

    Returns a dict with counts of deleted sessions and events.
    """
    cutoff = (
        datetime.now(tz=timezone.utc) - timedelta(days=ttl_days)
    ).isoformat()

    conn = sqlite3.connect(db_path)
    try:
        # ADK stores update_time as ISO string in the sessions table
        old_sessions = conn.execute(
            "SELECT id FROM sessions WHERE update_time < ?", (cutoff,)
        ).fetchall()
        session_ids = [row[0] for row in old_sessions]

        if not session_ids:
            logger.info("session_cleanup: no sessions older than %d days", ttl_days)
            return {"sessions": 0, "events": 0}

        placeholders = ",".join("?" * len(session_ids))
        deleted_events = conn.execute(
            f"DELETE FROM events WHERE session_id IN ({placeholders})",
            session_ids,
        ).rowcount
        deleted_sessions = conn.execute(
            f"DELETE FROM sessions WHERE id IN ({placeholders})",
            session_ids,
        ).rowcount
        conn.commit()

        logger.info(
            "session_cleanup: deleted %d sessions, %d events (ttl=%d days)",
            deleted_sessions, deleted_events, ttl_days,
        )
        return {"sessions": deleted_sessions, "events": deleted_events}
    finally:
        conn.close()


if __name__ == "__main__":
    result = cleanup_old_sessions()
    print(result)
```

**用法：**
```bash
# 手动清理（30 天 TTL）
cd backend && uv run python -m app.tools.session_cleanup

# 自定义 TTL
SESSION_TTL_DAYS=7 uv run python -m app.tools.session_cleanup
```

**可选：在 `main.py` 中注册定时任务**（利用 FastAPI lifespan）：
```python
from contextlib import asynccontextmanager
import asyncio

@asynccontextmanager
async def lifespan(app):
    # 启动时做一次清理
    from app.tools.session_cleanup import cleanup_old_sessions
    cleanup_old_sessions()
    yield

# get_fast_api_app 支持 lifespan 参数：
fast_api_app = get_fast_api_app(..., lifespan=lifespan)
```

---

## Fix 3：history API endpoint

**背景：** ADK 已有 `/api/apps/{app}/users/{user}/sessions` GET 接口列出 session，
但不返回 session 中存储的 research report（`final_report_with_citations` 在 events 表内，
不在 sessions 表顶层字段）。

需要在 `main.py` 中新增一个聚合端点，返回简洁的历史报告列表：

**文件：** `backend/app/main.py`

```python
@fast_api_app.get("/history/{user_id}", include_in_schema=True)
async def list_history(user_id: str) -> JSONResponse:
    """Return a list of past research sessions with their topics and report previews."""
    import sqlite3

    db_path = Path(__file__).parent / ".adk" / "session.db"
    if not db_path.exists():
        return JSONResponse({"sessions": []})

    conn = sqlite3.connect(db_path)
    try:
        # Get sessions for this user, newest first
        rows = conn.execute(
            """
            SELECT s.id, s.update_time,
                   e.actions
            FROM sessions s
            LEFT JOIN (
                SELECT session_id, actions
                FROM events
                WHERE json_extract(actions, '$.state_delta.research_plan') IS NOT NULL
                GROUP BY session_id
                HAVING MIN(rowid)
            ) e ON e.session_id = s.id
            WHERE s.user_id = ?
            ORDER BY s.update_time DESC
            LIMIT 20
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()

    sessions = []
    for session_id, update_time, actions_json in rows:
        plan = None
        if actions_json:
            import json
            try:
                plan = json.loads(actions_json).get("state_delta", {}).get("research_plan")
            except Exception:
                pass
        sessions.append({
            "session_id": session_id,
            "update_time": update_time,
            "research_plan": plan,
        })

    return JSONResponse({"sessions": sessions})
```

> **注意：** ADK 的 `events.actions` 列的 JSON 结构需实测确认字段路径。
> 如路径与上述不符，在实施时通过 `sqlite3` 命令行查询一条真实 event 来校准。

---

## Fix 4：前端历史记录侧边栏

**新文件：** `frontend/src/components/HistoryPanel.tsx`

一个可折叠的左侧边栏，展示该用户最近 20 次研究的话题和时间：

```tsx
interface HistoryItem {
  session_id: string;
  update_time: string;
  research_plan: string | null;
}

interface HistoryPanelProps {
  userId: string | null;
  onSelectSession: (sessionId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function HistoryPanel({ userId, onSelectSession, isOpen, onToggle }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!userId || !isOpen) return;
    fetch(`/api/history/${userId}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setHistory(data.sessions ?? []));
  }, [userId, isOpen]);

  return (
    <aside className={`transition-all ${isOpen ? "w-64" : "w-0 overflow-hidden"}`}>
      <div className="p-3 border-r h-full overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">历史研究</h2>
        {history.length === 0 && (
          <p className="text-xs text-gray-400">暂无历史记录</p>
        )}
        {history.map(item => (
          <button
            key={item.session_id}
            onClick={() => onSelectSession(item.session_id)}
            className="w-full text-left p-2 rounded hover:bg-gray-100 mb-1"
          >
            <p className="text-xs text-gray-700 line-clamp-2">
              {item.research_plan?.split('\n')[0] ?? '未命名研究'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(item.update_time).toLocaleDateString('zh-CN')}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
```

**`App.tsx` 接入：**
- 在顶层 layout 添加 `<HistoryPanel>` 和一个折叠按钮
- `onSelectSession` 暂时仅显示 session_id（完整的"加载历史报告"功能作为后续迭代）

---

## 实施顺序

```
步骤 1  backend/app/main.py              显式传入 session_service_uri
步骤 2  backend/app/.env.example         新增 SESSION_DB_URL / SESSION_TTL_DAYS
步骤 3  backend/app/tools/session_cleanup.py   新建清理脚本
步骤 4  backend/app/main.py              添加 /history/{user_id} 端点
步骤 5  frontend/src/components/HistoryPanel.tsx   新建侧边栏组件
步骤 6  frontend/src/App.tsx             接入 HistoryPanel
步骤 7  手动回归测试
```

---

## 测试检查清单

```
□ 持久化验证
    □ 发起研究 → 重启后端 → 刷新页面 → /history/{userId} 仍返回之前的记录

□ session_service_uri 验证
    □ 未设置 SESSION_DB_URL 时使用默认 SQLite 路径，行为与修改前一致
    □ 设置 SESSION_DB_URL 可使用自定义路径

□ 清理脚本验证
    □ SESSION_TTL_DAYS=0 运行清理脚本 → sessions 和 events 减少
    □ 保留近期 session，不误删

□ History API 验证
    □ GET /history/{userId} 返回 sessions 列表，每项包含 update_time 和 research_plan 首行
    □ 无 session 时返回 {"sessions": []}

□ 前端侧边栏验证
    □ 点击历史按钮展开侧边栏，显示研究话题列表
    □ 侧边栏不影响主聊天区布局

□ 回归测试
    □ 完整 research 请求正常完成
    □ 新 session 在 session.db 中可查到
```

---

## 不在此次修复范围内的事项

- **完整的历史报告加载**：点击历史记录恢复到完整报告视图，
  需要重建 SSE event stream 或存储最终报告快照，作为后续迭代。
- **PostgreSQL 迁移**：将现有 SQLite 数据迁移到 PostgreSQL 需要专用脚本，
  超出本次范围；Fix 1 让配置切换成为可能，实际迁移按需处理。
- **report 导出（PDF/Word）**：属于 Gap 9 功能缺失，不在此次计划内。
