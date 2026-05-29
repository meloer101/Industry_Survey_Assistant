# Gap 7 配置 & 部署实施计划

> 创建日期：2026-05-29
> 目标：修复 PRODUCTION_GAP_ANALYSIS.md 中 Gap 7 列出的配置与部署缺失问题

---

## 核查结论（调查后的实际状态）

| 问题 | 调查结果 |
|------|----------|
| 无容器化 | 无 Dockerfile / docker-compose，项目根目录无任何容器文件 |
| 无环境分层 | `.env.example` 列出了 `WORKER_MODEL` / `CRITIC_MODEL`，但 `config.py` 未读取环境变量，模型名硬编码 |
| Health check | 已有 `/health` endpoint（Gap 2 中实现），前端已使用它 ✓ |
| 无 graceful shutdown | uvicorn 默认会在 SIGTERM 上拒绝新连接，但正在执行的 pipeline 会直接中断 |
| Python 版本过严 | `pyproject.toml` 限制 `>=3.12,<3.13`，排除了 3.13+ |
| 前端 `.env.example` | 已存在 ✓ |
| 后端 `.env.example` | 已存在且完整（66 行）✓ |
| `.gitignore` | 已有 `.env` / `.env.*` / `!.env.example` 规则 ✓ |

---

## 修复项一览

```
Fix 1  config.py 支持环境变量覆盖       backend/app/config.py                (修改)
Fix 2  放宽 Python 版本约束             backend/pyproject.toml               (修改)
Fix 3  后端 Dockerfile                  backend/Dockerfile                   (新)
Fix 4  前端 Dockerfile                  frontend/Dockerfile                  (新)
Fix 5  docker-compose.yml              docker-compose.yml                    (新)
Fix 6  pipeline graceful shutdown       backend/app/agent.py                 (修改)
```

---

## Fix 1：config.py 支持环境变量覆盖

**文件：** `backend/app/config.py`

当前 `worker_model` 和 `critic_model` 硬编码为 `deepseek-v4-flash` / `deepseek-v4-pro`。
`.env.example` 已列出 `WORKER_MODEL` / `CRITIC_MODEL`，但 config.py 未读取。

**修改：**
```python
@dataclass
class ResearchConfiguration:
    worker_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(
            model=os.environ.get("WORKER_MODEL", "deepseek/deepseek-v4-flash")
        )
    )
    critic_model: LiteLlm = field(
        default_factory=lambda: LiteLlm(
            model=os.environ.get("CRITIC_MODEL", "deepseek/deepseek-v4-pro")
        )
    )
    max_search_iterations: int = field(
        default_factory=lambda: int(os.environ.get("MAX_SEARCH_ITERATIONS", "3"))
    )
```

**收益：** 通过环境变量即可切换模型，无需修改代码。Docker 环境、CI、staging 各有不同模型配置。

---

## Fix 2：放宽 Python 版本约束

**文件：** `backend/pyproject.toml`

当前 `requires-python = ">=3.12,<3.13"` 过于严格，排除了 Python 3.13+。

**修改：**
```toml
requires-python = ">=3.12"
```

代码中未使用任何 3.13 废弃特性或 3.12-only API，放宽不会引入兼容性问题。

---

## Fix 3：后端 Dockerfile

**新文件：** `backend/Dockerfile`

多阶段构建，使用 `uv` 安装依赖：

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies first (layer cache)
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ ./app/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**特点：**
- 多阶段结构，依赖层独立缓存
- `--no-dev` 不装 pytest 等开发依赖
- `HEALTHCHECK` 指令内置，容器编排自动监控
- 不含 `.env` 文件，环境变量由 docker-compose 或 k8s 注入

---

## Fix 4：前端 Dockerfile

**新文件：** `frontend/Dockerfile`

静态构建 + nginx 托管：

```dockerfile
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_API_KEY=""
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**新文件：** `frontend/nginx.conf`

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;          # SSE 需要关闭缓冲
        proxy_read_timeout 300s;      # pipeline 可能运行数分钟
    }

    location / {
        try_files $uri $uri/ /app/index.html;
    }
}
```

**注意：**
- SSE 要求 `proxy_buffering off`，否则 nginx 会缓冲流导致前端无法实时更新
- `proxy_read_timeout 300s` 适配研究 pipeline 的长运行时间
- `try_files` fallback 到 `index.html` 支持 SPA 路由

---

## Fix 5：docker-compose.yml

**新文件：** `docker-compose.yml`（项目根目录）

```yaml
services:
  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    env_file:
      - ./backend/app/.env
    environment:
      - LOG_FORMAT=json
    volumes:
      - session-data:/app/app/.adk
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_KEY: ${VITE_API_KEY:-dev-local-key-change-in-production}
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

volumes:
  session-data:
```

**特点：**
- `backend` 使用 `.env` 文件注入密钥（文件不进镜像）
- `session-data` 命名卷持久化 SQLite session 数据
- `depends_on` + `service_healthy` 确保前端在后端就绪后才启动
- 生产环境用 `LOG_FORMAT=json` 自动切换 JSON 日志

---

## Fix 6：Pipeline graceful shutdown

**文件：** `backend/app/agent.py` — `PipelineGuard` 已有

当前 `PipelineGuard` 已捕获 pipeline 异常并输出 partial report，但不处理 `asyncio.CancelledError`。
当 uvicorn 收到 SIGTERM 时，正在执行的协程会收到 `CancelledError`。

**修改 `PipelineGuard._run_async_impl`：**
```python
async def _run_async_impl(self, ctx):
    try:
        async for event in self._pipeline.run_async(ctx):
            yield event
    except asyncio.CancelledError:
        logger.warning("[PipelineGuard] Pipeline cancelled (shutdown)")
        state = ctx.session.state
        partial_report = self._build_partial_report(state, RuntimeError("Pipeline cancelled during shutdown"))
        state["final_cited_report"] = partial_report
        state["final_report_with_citations"] = partial_report
        yield Event(
            author=self.name,
            actions=EventActions(state_delta={"final_report_with_citations": partial_report}),
        )
    except Exception as exc:
        # ... existing error handling unchanged
```

**收益：** 服务关闭时正在进行的研究会生成 partial report 而非静默中断。

---

## 实施顺序

```
步骤 1  backend/app/config.py            环境变量覆盖 model
步骤 2  backend/pyproject.toml           放宽 Python 版本
步骤 3  backend/app/agent.py             CancelledError 处理
步骤 4  backend/Dockerfile               后端容器
步骤 5  frontend/Dockerfile + nginx.conf 前端容器
步骤 6  docker-compose.yml               编排文件
步骤 7  验证
```

---

## 测试检查清单

```
□ 配置
    □ WORKER_MODEL=deepseek/deepseek-chat 启动后 agent 实际使用该模型
    □ 不设置 WORKER_MODEL → 默认 deepseek-v4-flash
    □ Python 3.13 环境下 uv sync 通过

□ Docker
    □ docker compose build → 两个镜像构建成功
    □ docker compose up → 前端可访问 http://localhost
    □ 后端 HEALTHCHECK 绿色
    □ docker compose down → 无错误、无数据丢失（session-data 卷保留）

□ Graceful shutdown
    □ 运行中的 pipeline 时 docker compose stop → partial report 输出到 SSE
    □ 非运行状态 stop → 无异常日志

□ 回归
    □ 裸机启动（非 Docker）功能不变
    □ 现有测试全部通过
```

---

## 不在此次修复范围内的事项

- **Kubernetes manifests / Helm chart**：当前阶段 docker-compose 足够，k8s 部署在有实际多实例需求时再引入
- **Multi-stage CI/CD deploy pipeline**：Gap 5 CI 已建好 test pipeline，deploy pipeline 需要实际的部署目标（云服务商/VPS）才有意义
- **TLS/HTTPS**：由反向代理（Cloudflare / traefik / cloud LB）处理，不在应用层配置
- **Secrets manager (Vault/AWS SM)**：`.env` + docker secrets 对当前规模已足够
