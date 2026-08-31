# 玄甲全局智能体运维手册

## 服务

- `ctfd`：全局智能体 API、权限、课程事实、文件下载与发布。
- `teaching-worker`、`teaching-interactive-worker`：可恢复的课堂模型、材料分析和工具任务执行。
- `teaching-authoring-worker`、`teaching-authoring-worker-2`：有界并发的重型出题、修复和独立验证；两道独立题可以并行，但不会形成无界模型请求突发。
- `agent-runtime`：内部渲染、互动场景与课堂执行；不能独立使用。
- `db`、`cache`：持久事实与队列。
- `nginx`：统一玄甲入口和运行时 Cookie 隔离。

停止 `agent-runtime` 只会暂停预览与互动课堂，不会破坏课程、CTF、提交、Flag 判题、成绩或工作区。任务事实保存在 PostgreSQL，恢复 Worker 后可以继续执行。

## 配置

| 变量 | 用途 |
| --- | --- |
| `GLOBAL_AGENT_RUNTIME_SERVICE_SECRET` | 平台与运行时之间的服务认证，至少 24 字符 |
| `GLOBAL_AGENT_RUNTIME_TICKET_SECRET` | 一次性启动票据与短期能力签名 |
| `GLOBAL_AGENT_RUNTIME_INTERNAL_URL` | 默认 `http://agent-runtime:3000/agent-runtime` |
| `GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN` | 默认 `https://$DOJO_HOST/agent-runtime` |
| `GLOBAL_AGENT_RUNTIME_MODELS` | 运行时可用模型 |
| `GLOBAL_AGENT_RUNTIME_DEFAULT_MODEL` | 普通内部任务默认模型 |
| `GLOBAL_AGENT_RUNTIME_MODEL_ROUTES` | 复杂渲染任务的模型路由 |
| `GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS` | 允许嵌入运行时的玄甲来源 |
| `DOJO_AI_TOTAL_TIMEOUT_SECONDS` | 一次复杂模型调用在重试间共享的总墙钟预算，默认 `600` 秒，单次无响应超时仍为 `120` 秒 |
| `AISECEDU_AGENT_SKILLS_DIR` | 全局智能体技能目录；生产默认只读挂载 `/app/agent-skills` |

`dojo init` 会把旧部署的两个 `OPENMAIC_*_SECRET` 值一次性迁移到新名称，避免发布时使所有服务失去共享密钥；新配置文件不再保留旧键。`/data/openmaic` 会在新目录不存在时原子改名为 `/data/agent-runtime`。旧命名只作为迁移兼容读取，不能再写入新部署文档或配置。

运行时命名卷统一为 `pwncollege_agent-runtime-data`，并通过 `GLOBAL_AGENT_RUNTIME_DATA_VOLUME` 显式记录在配置中。升级旧部署时，应先归档旧卷，再将 `pwncollege_openmaic-data` 的内容逐文件复制到新卷并核对清单；新服务验证通过前保留旧卷作为回滚副本，禁止让新安装继续创建旧命名卷。

## 发布前检查

```bash
python -m compileall -q dojo_plugin
node --check dojo_theme/static/js/dojo/teaching-agent.js
node node_modules/typescript/bin/tsc --noEmit
docker compose config --quiet
pytest -q test/test_agent_files.py test/test_model_router.py
```

TypeScript 命令在 `services/agent-runtime` 执行。随后运行定向 Vitest、生产构建和浏览器验收：

```bash
node node_modules/vitest/vitest.mjs run \
  tests/integration/aisecedu-jobs-route.test.ts \
  tests/server/integration-metrics.test.ts
AISECEDU_INTEGRATED=true \
NEXT_PUBLIC_AISECEDU_INTEGRATED=true \
NEXT_PUBLIC_BASE_PATH=/agent-runtime \
node node_modules/next/dist/bin/next build
./ops/verify-teacher-agent-intelligence.py
./ops/verify-teacher-agent-ui.py
```

## 部署与健康

```bash
docker exec pwncollege-dojo dojo compose build agent-runtime ctfd teaching-worker teaching-interactive-worker teaching-authoring-worker nginx
docker exec pwncollege-dojo dojo compose up -d agent-runtime ctfd teaching-worker teaching-interactive-worker teaching-authoring-worker teaching-authoring-worker-2 nginx prometheus grafana
docker exec pwncollege-dojo dojo compose restart nginx
docker exec pwncollege-dojo dojo compose ps agent-runtime ctfd teaching-worker teaching-interactive-worker teaching-authoring-worker teaching-authoring-worker-2 nginx prometheus grafana
docker exec pwncollege-dojo dojo compose logs --tail=100 agent-runtime teaching-worker teaching-interactive-worker teaching-authoring-worker teaching-authoring-worker-2
```

内部健康接口为 `http://agent-runtime:3000/agent-runtime/api/health`。浏览器可访问同源健康探针，但 `/agent-runtime` 根路径必须跳回 `/teacher`，`/openmaic/*` 必须只跳回 `/teacher`，外部访问 `/agent-runtime/api/integration/metrics` 必须返回 404。

重建 `agent-runtime` 后必须重启 Nginx：Docker 会给重建后的容器分配新地址，而长驻 Nginx 可能仍缓存旧地址。随后再从统一 HTTPS 入口检查健康接口。复杂 Pro 构建、红队复核和自动修复允许多次长推理；`DOJO_AI_TOTAL_TIMEOUT_SECONDS=600` 防止后续重试只剩不足一次正常推理的时间，但不会改变每次请求的无响应保护，也不会绕过流水线轮次上限。

Prometheus 作业名为 `aisecedu_agent_runtime`，核心指标为 `aisecedu_agent_runtime_up`、`aisecedu_agent_runtime_requests_total` 和 `aisecedu_agent_runtime_request_duration_seconds`。规则文件是 `prometheus/global-agent-runtime.rules.yml`，Grafana 仪表盘是 `玄甲 Global Agent`。

## 故障处理

- `GlobalAgentRuntimeUnavailable`：检查容器健康、内存、内部 URL 和服务密钥。
- `GlobalAgentRuntimeUnavailableDuringClass`：停止新课堂渲染，保留现有课程与 CTF 能力。
- `TeachingQueueStalled`：检查 Worker 租约、Redis Stream 和最老任务。
- `TeachingJobFailureBurst`：按 trace ID、kind、stage 和模型路由排查。
- `GlobalAgentClassroomRenderFailure`：核对产物 schema 与运行时日志。

不得在日志、验收记录或聊天中输出配置文件、票据、Cookie、模型密钥或服务密钥。

## 回滚

回滚前备份 PostgreSQL、`/data/dojos`、`/data/agent-runtime`、运行时数据卷和配置，并在隔离环境验证可恢复。应用回滚可以保留新表和数据；若必须恢复旧代码，旧 `/openmaic` 产品入口仍不得重新启用。服务恢复后重新运行健康、身份隔离、真实模型文件交付和浏览器 E2E。
