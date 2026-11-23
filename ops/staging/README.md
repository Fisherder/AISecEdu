# 28081 教学服务接入与静态预演

在维护机上用脱敏的 28081 Compose 副本和合成数据验收。基线应标有 `name: aisecedu-develop`，保留原 `app`、`db`、`cache` 和 `edge` 的网络、卷和绑定。只接受 edge 发布 `127.0.0.1:28081`。准备容器镜像时仍按维护者手册核对目标提交、平台和镜像 ID。下面只渲染 Compose，`--no-env-resolution` 跳过环境文件解析。共享宿主使用的 Compose 2.39.1 仍会检查这些路径是否存在，预演使用新建的空文件。

在仓库根目录使用支持 `!override`、`!reset` 和 `env_file.format: raw` 的 Compose。给教学 overlay 提供 `AISECEDU_HARNESS_IMAGE`、`AISECEDU_CLASSROOM_IMAGE` 和 `AISECEDU_INSPECTOR_IMAGE`，值为已校验的镜像 ID 或不可变摘要。三个服务环境文件路径指向本次预演的临时空文件。

```bash
umask 077
fixture_dir=$(mktemp -d)
export AISECEDU_HARNESS_ENV_FILE="$fixture_dir/harness.env"
export AISECEDU_CLASSROOM_AUTH_FILE="$fixture_dir/auth.env"
export AISECEDU_CLASSROOM_ENV_FILE="$fixture_dir/classroom.env"
touch "$AISECEDU_HARNESS_ENV_FILE" "$AISECEDU_CLASSROOM_AUTH_FILE" "$AISECEDU_CLASSROOM_ENV_FILE"
export AISECEDU_CLASSROOM_PUBLIC_ORIGIN=http://127.0.0.1:28081
compose=(docker compose --env-file /dev/null -f /path/to/redacted-host.json)
teaching=(-f ops/staging/harness.compose.yml -f ops/staging/classroom.compose.yml)
app_connection=(-f ops/staging/teaching-app.compose.yml)
render=(config --format json --no-env-resolution)
```

## 普通教学接入

维护者在经审核的宿主基线之后依次加载 DSH、课堂和 `teaching-app.compose.yml`。最后一层将 `app` 加入项目的 `teaching` 内网，供课堂经 `http://app:8000` 回调，应用也可通过服务名访问同一内网的 DSH。下面的对比核验原有应用网络、数据库、Redis、edge、宿主端口和卷。DSH 继续使用已有的 `model-egress`，课堂 AI 继续由 `AISECEDU_CLASSROOM_AI_ENABLED` 控制，默认关闭。

```bash
"${compose[@]}" "${teaching[@]}" "${render[@]}" > "$fixture_dir/reference.json"
"${compose[@]}" "${teaching[@]}" "${app_connection[@]}" "${render[@]}" > "$fixture_dir/connected.json"
python3 ops/staging/teaching-rehearsal.py --check-app-connection \
  "$fixture_dir/reference.json" "$fixture_dir/connected.json"
```

切换与回退均使用维护窗口和经审核的宿主配置，按版本确认应用启动环境、内部凭据、代理路由及配套 Worker。回退网络接入时，恢复原 Compose 文件组合和对应的应用配置，由维护者用恢复后的定义重新创建 `app`。[维护者手册](../../docs/development/operations.md) · [配套服务发布说明](../../docs/development/harness-migration.md)

## 离线静态预演

离线配置复用 `teaching-app.compose.yml`，并在它后面加载生成的预演文件，将课堂 AI 强制关闭，移除 DSH 的 `model-egress`，并将模型地址固定为 DSH 容器网络命名空间内的 `127.0.0.1:3082`。

```bash
"${compose[@]}" "${render[@]}" > "$fixture_dir/baseline.json"
python3 ops/staging/teaching-rehearsal.py "$fixture_dir/baseline.json" > "$fixture_dir/rehearsal.compose.yml"
"${compose[@]}" "${teaching[@]}" "${app_connection[@]}" \
  -f "$fixture_dir/rehearsal.compose.yml" "${render[@]}" > "$fixture_dir/candidate.json"
python3 ops/staging/teaching-rehearsal.py "$fixture_dir/baseline.json" "$fixture_dir/candidate.json"
```

可用 `test/harness_client_contract.py` 和独立的回环 Messages 夹具验证 DSH 请求契约。若要在此 Compose 组合中发合成请求，维护者需在 DSH 同一网络命名空间提供本地 Messages 夹具，方可运行 `check-harness.mjs`。裸健康检查只验证服务进程。

确需验证代理网络时，在两次 Python 命令中均加 `--edge`。这会创建独立私网，供现有 edge 访问课堂，DSH 和检查器不加入该私网。代理配置仍由维护者核对，原有 `/agent-runtime` 路由不会因接网而改变。Worker launcher、开发库 schema 和积压、宿主实际启动环境、课程许可清单及回退需独立验收。静态通过只证明已渲染配置符合此预演的边界。

2026-11-23 在运行 `85d745f5` 的共享宿主上，仅用 Compose 2.39.1 渲染核对了两种组合。两者均保留原四服务和端口映射，合成配置中有七个服务，DSH 仅加入 `teaching` 内网。镜像 ID 用占位值，运行中的容器没有切换。
