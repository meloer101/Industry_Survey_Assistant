# 数据库迁移指南：SQLite → PostgreSQL

## 当前架构

ADK 通过 `session_service_uri` 参数管理 session 持久化。本项目默认使用 SQLite：

```
SESSION_DB_URL=sqlite:///<project-root>/.adk/session.db
```

ADK 内部自动创建 `sessions` 和 `events` 表（schema 由 ADK 管理，无需手动建表）。

## SQLite 的生产局限

- 单写者锁：并发写入会排队，多用户同时研究时成为瓶颈
- 无法水平扩展：数据库文件绑定到单机
- 无连接池：每次请求都打开/关闭文件
- 无备份流式导出：需要停服或 `sqlite3 .backup`

## 切换到 PostgreSQL

### 1. 准备 PostgreSQL 实例

```bash
# 本地开发
docker run -d --name pg-adk \
  -e POSTGRES_USER=adk -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=adk_sessions \
  -p 5432:5432 postgres:16-alpine
```

### 2. 修改环境变量

```env
SESSION_DB_URL=postgresql://adk:changeme@localhost:5432/adk_sessions
```

ADK 检测到 PostgreSQL URI 后会使用 `DatabaseSessionService`，自动建表。

### 3. history 端点适配

`backend/app/persistence.py` 中的 `list_research_history` 当前直接使用 `sqlite3` 模块查询。`get_sqlite_path_from_url()` 在检测到非 SQLite URI 时返回 `None`，此时 `/history/{user_id}` 端点返回空列表。

要在 PostgreSQL 下支持 history，需要：
1. 将 `list_research_history` 改为使用 SQLAlchemy 或 `psycopg` 通用查询
2. 或通过 ADK 的 `SessionService.list_sessions()` API 获取历史

这是已知限制，当前代码已安全降级（返回空），不会报错。

### 4. docker-compose 生产配置

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: adk
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: adk_sessions
    volumes:
      - pg-data:/var/lib/postgresql/data

  backend:
    environment:
      SESSION_DB_URL: postgresql://adk:${PG_PASSWORD}@postgres:5432/adk_sessions

volumes:
  pg-data:
```

### 5. 数据迁移（可选）

如需保留 SQLite 中的历史 session：

```bash
# 导出
sqlite3 .adk/session.db ".dump sessions" > sessions.sql
sqlite3 .adk/session.db ".dump events" > events.sql

# 转换语法差异（INTEGER → BIGINT, BLOB → BYTEA 等）后导入
psql -U adk -d adk_sessions < sessions.sql
psql -U adk -d adk_sessions < events.sql
```

注意：ADK 的 schema 在 SQLite 和 PostgreSQL 间可能存在细微差异，建议以 ADK 自动建的表结构为准，只迁移数据行。

## Session 清理

`backend/app/tools/session_cleanup.py` 中的清理逻辑当前基于 SQLite 文件路径检测。切换 PostgreSQL 后需要：
- 确认 `get_sqlite_path_from_url()` 返回 `None`
- 清理任务会安全跳过（不执行 SQLite 特定的清理）
- 生产环境建议通过 PostgreSQL 的 `pg_cron` 或外部定时任务清理过期 session
