# 28081 教学服务静态预演

在维护机上用脱敏的 28081 Compose 副本和合成数据验收。基线应标有 `name: aisecedu-develop`，保留原 `app`、`db`、`cache` 和 `edge` 的网络、卷和绑定。只接受 edge 发布 `127.0.0.1:28081`。准备容器镜像时仍按维护者手册核对目标提交、平台和镜像 ID。下面只渲染 Compose，`--no-env-resolution` 跳过环境文件解析。共享宿主使用的 Compose 2.39.1 仍会检查这些路径是否存在，预演使用新建的空文件。

在仓库根目录使用支持 `!override`、`!reset` 和 `env_file.format: raw` 的 Compose。给原有 overlay 提供 `AISECEDU_HARNESS_IMAGE`、`AISECEDU_CLASSROOM_IMAGE` 和 `AISECEDU_INSPECTOR_IMAGE`，值为已校验的镜像 ID 或不可变摘要。下方三个路径变量均指向本次预演的临时文件。

```bash
umask 077
fixture_dir=$(mktemp -d)
export AISECEDU_HARNESS_ENV_FILE="$fixture_dir/harness.env"
export AISECEDU_CLASSROOM_AUTH_FILE="$fixture_dir/auth.env"
export AISECEDU_CLASSROOM_ENV_FILE="$fixture_dir/classroom.env"
touch "$AISECEDU_HARNESS_ENV_FILE" "$AISECEDU_CLASSROOM_AUTH_FILE" "$AISECEDU_CLASSROOM_ENV_FILE"
export AISECEDU_CLASSROOM_PUBLIC_ORIGIN=http://127.0.0.1:28081
compose=(docker compose --env-file /dev/null -f /path/to/redacted-host.json)
render=(config --format json --no-env-resolution)
"${compose[@]}" "${render[@]}" > baseline.json
python3 ops/staging/teaching-rehearsal.py baseline.json > rehearsal.compose.yml
"${compose[@]}" -f ops/staging/harness.compose.yml -f ops/staging/classroom.compose.yml \
  -f rehearsal.compose.yml "${render[@]}" > candidate.json
python3 ops/staging/teaching-rehearsal.py baseline.json candidate.json
```

生成文件给 app 加入 `teaching` 私网，供课堂经 `http://app:8000` 回调。课堂 AI 强制关闭。DSH 仅连接 `teaching`，其模型地址固定为容器网络命名空间内的 `127.0.0.1:3082`。要验证真实 DSH 回合，可在独立测试夹具中运行 `test/harness_client_contract.py`。若要在此 Compose 组合中发合成请求，维护者需在 DSH 同一网络命名空间提供本地 Messages 夹具，方可运行 `check-harness.mjs`。裸健康检查只验证服务进程。

确需验证代理网络时，在两次 Python 命令中均加 `--edge`。这会创建独立私网，供现有 edge 访问课堂，DSH 和检查器不加入该私网。代理配置仍由维护者核对，原有 `/agent-runtime` 路由不会因接网而改变。Worker launcher、开发库 schema 和积压、宿主实际启动环境、课程许可清单及回退需独立验收。静态通过只证明已渲染配置符合此预演的边界。

2026-11-23 在运行 `85d745f5` 的共享宿主上，仅用 Compose 2.39.1 渲染核对了两种组合。两者均保留原四服务和端口映射，合成配置中有七个服务，DSH 仅加入 `teaching` 内网。镜像 ID 用占位值，运行中的容器没有切换。
