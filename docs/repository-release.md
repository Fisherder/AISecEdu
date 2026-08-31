# 仓库、部署与发布约定

玄甲采用单仓库源码交付：主题、Flask 插件、题目工作区、运维脚本和内部智能体运行时使用同一个提交，不依赖未声明的本机源码或 Git 子模块。运行数据和凭据永远不进入提交或源码归档。

## 仓库边界

以下内容属于源码，应随提交分发：

- `dojo_plugin/`、`dojo_theme/`、`workspace/` 与各服务 Dockerfile；
- `services/agent-runtime/` 的应用源码、`pnpm-lock.yaml`、运行时 `public/` 资源和 MIT 许可证；
- `agent_skills/` 的技能、来源记录和第三方声明；
- 数据迁移、Compose、Nginx、Prometheus/Grafana 配置、测试与运维脚本；
- `workspace/flake.lock`、前端锁文件及部署配置示例。

以下内容只属于本机，由 `.gitignore` 和 `.dockerignore` 同时隔离：

- `data/` 中的数据库、课程仓库、Home、证书、SSH 密钥和服务配置；
- `cache/`、`node_modules/`、`.next*`、Python/测试缓存；
- `output/` 中的压力测试报告、截图、视频和合成账号凭据；
- `ops/deployment.env` 中的机器地址、端口与本地镜像选择；
- 内部运行时上游 README 使用但生产镜像不读取的 `services/agent-runtime/assets/` 演示媒体。

`make audit` 会阻止上述本机内容、私钥标记或超过 50 MiB 的文件进入版本历史，同时解析 Compose 并检查 Shell 脚本语法。

## 从 Git 部署

```bash
git clone git@github.com:Fisherder/AISecEdu.git xuanjia
cd xuanjia
cp ops/deployment.env.example ops/deployment.env
${EDITOR:-vi} ops/deployment.env
make doctor
make deploy
make verify
```

`make build` 使用固定提交下载 Kata、CTFd 与 seccomp 构建上下文，并把最终镜像标签写入被忽略的 `cache/local-image`。`make up` 创建持久的 `data/`，生成本机 TLS 资料并以非递归 bind mount 载入源码。部署密钥由 `dojo init` 首次生成到 `data/config.env`，不需要也不允许写入 Git。

更新前先备份数据库，再使用快进拉取并重新验收：

```bash
docker exec pwncollege-dojo dojo backup
git pull --ff-only
make check
make build
```

顶层镜像或端口配置发生变化时，应按 `ops/README.md` 的重建流程替换外层容器；只修改插件或主题时，可以使用已有的定向同步流程。

## 可复现源码包

提交并保持工作区干净后运行：

```bash
make package
cd output/releases
sha256sum -c xuanjia-*.tar.gz.sha256
```

归档由 `git archive` 直接从当前提交生成，并使用确定性 gzip 头；它包含部署所需的全部已跟踪源码，不包含 `.git`、运行数据、缓存或本地配置。文件名包含标签或 12 位提交号，旁边的 `.commit` 文件记录完整提交 ID。解包后的目录可直接执行 `make audit`、`make doctor` 和 `make deploy`；因为没有 Git 元数据，默认外层镜像标签使用 `pwncollege/dojo:local-release`，也可以通过 `DOJO_IMAGE` 显式指定。

发布前至少完成 `make check`。涉及运行时、路由或容器编排的改动还必须在目标 Linux/KVM 主机上完成 `make verify`；完整模型、浏览器和高并发验收按 `ops/README.md` 选择对应脚本。
