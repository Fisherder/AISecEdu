# 本机部署与运维

本目录记录 `/mnt/HDD1/LLM/AISecEdu-dojo/dojo` 的单节点 pwn.college 部署。当前代码基线为上游提交 `b830d74339000c0fd8408558a13328ae8b1919b6`，外层镜像为 `pwncollege/dojo:local-b830d743`，容器名为 `pwncollege-dojo`。

完整的实机测试范围、结果和边界见 [`verification-report.md`](./verification-report.md)。

服务仅绑定回环地址：

- Web：`https://localhost.pwn.college`
- SSH：`127.0.0.1:2223`
- 持久数据：`./data/`
- 构建缓存：`./cache/`
- 本地 TLS 证书：`./data/local-tls/fullchain.pem`

`data/` 与 `cache/` 已由上游 `.gitignore` 排除。不要提交 `data/config.env`、数据库、SSH 密钥或管理员凭据。

## 日常操作

```bash
docker start pwncollege-dojo
docker stop pwncollege-dojo
docker restart pwncollege-dojo
docker exec pwncollege-dojo dojo logs -n 200
docker exec pwncollege-dojo dojo compose ps
./ops/verify-local.sh
./ops/smoke-user-flow.py
./ops/set-offline-mode.sh enable
```

轮换本地管理员密码：

```bash
./ops/rotate-admin-password.sh
```

用户名为 `admin`，生成的密码只保存在被 Git 忽略且权限为 `0600` 的 `data/admin-password.txt`。

```bash
docker exec pwncollege-dojo cat /data/admin-password.txt
```

本机入口使用带 `localhost.pwn.college`、`workspace.localhost.pwn.college` 和 `future.localhost.pwn.college` SAN 的自签名证书。首次用浏览器访问会出现信任提示；可以把 `data/local-tls/fullchain.pem` 导入本机信任库，或只在本机验收时接受该证书。

创建数据库备份：

```bash
docker exec pwncollege-dojo dojo backup
ls -lh data/backups/
```

## 从零重建

本机 Docker 守护进程访问 Docker Hub 和 Dockerfile 的远程 `ADD` 不稳定，因此使用固定提交的本地构建上下文。脚本不会修改上游 `Dockerfile`。

```bash
./ops/build-outer-local.sh
./ops/run-local.sh
./ops/preload-inner-images.sh
docker exec pwncollege-dojo systemctl show pwn.college.service -p ActiveState -p SubState -p Result
./ops/set-offline-mode.sh enable
```

`run-local.sh` 会准备源码读取权限和本地 TLS 证书。源码以可写、非递归 bind mount 挂载；非递归设置可防止内层 Docker 的 overlay 挂载反向泄漏到源码树。首次初始化会构建所有内层服务和 Nix 工作区，可能需要较长时间。如果预载前 `pwn.college.service` 因拉取超时失败，预载脚本会导入固定的基础镜像、清除失败状态并重新启动服务。只有首次构建成功后才启用离线模式；它让后续开机复用已验证镜像，不受 Registry 波动影响。查看进度：

```bash
docker exec pwncollege-dojo systemctl show pwn.college.service -p ActiveState -p SubState -p Result
docker exec pwncollege-dojo journalctl -u pwn.college.service -n 100 --no-pager
docker exec pwncollege-dojo docker logs -f workspace-builder
```

外层镜像构建固定了 Kata Containers `3.19.1`、CTFd `3.6.0` 和 Moby seccomp 配置的实际提交，并校验 seccomp 与 `crane` 下载的 SHA-256。`workspace/flake.lock` 保存了本机成功解析的 Nix 输入提交与 narHash；内层镜像预载是幂等的。导入额外的自定义模块镜像时使用：

```bash
./ops/import-inner-image.sh registry.example/image:tag
```

该命令由宿主机下载镜像，再导入嵌套 Docker，适用于嵌套守护进程无法稳定直连 Registry 的环境。如果确有一个能从外层容器访问的 HTTP 代理，可以在首次运行时设置 `DOJO_PROXY_URL`，或对现有实例执行：

```bash
DOJO_PROXY_URL=http://proxy-host:port ./ops/configure-inner-proxy.sh
```

## 二次开发

本仓库以读写方式挂载到容器的 `/opt/pwn.college`，本地定制代码保存在 `local/deployment` 分支。修改前先备份数据库：

```bash
docker exec pwncollege-dojo dojo backup
```

可以直接扩展的主要区域包括：

- `dojo_plugin/`：后端 API、数据模型、工作区编排和后台任务；
- `dojo_theme/`：服务端模板、页面脚本和样式；
- `frontend/`：独立前端资源；
- `workspace/`：Kata 工作区的 Nix 软件、Terminal、Code 和 Desktop 服务；
- `docker-compose.yml` 及各服务目录：新增或替换平台服务；
- dojo 定义：通过管理界面或独立 dojo 仓库添加课程和模块。

建议每项定制使用独立 Git 提交，并在提交前运行 `./ops/verify-local.sh`；涉及用户流程、工作区或认证的改动还应运行 `./ops/smoke-user-flow.py`。后者只操作一次性测试对象，不读取或提交 flag。

生产实例默认启用 `DOJO_OFFLINE=true`。改动 `dojo_plugin/` 或 `dojo_theme/` 后，同步源码并重启相关服务：

```bash
docker exec pwncollege-dojo dojo sync
docker exec pwncollege-dojo dojo compose restart ctfd stats-worker image-pull-worker
```

改动前端、服务 Dockerfile、依赖或 `docker-compose.yml` 后，只重建受影响的模块：

```bash
docker exec pwncollege-dojo dojo compose build frontend
docker exec pwncollege-dojo dojo compose up -d --no-build frontend
```

需要完整重建时，临时关闭离线模式，成功后立即恢复：

```bash
./ops/set-offline-mode.sh disable
docker exec pwncollege-dojo dojo up
./ops/set-offline-mode.sh enable
```

仅查看最终 Compose 配置或重启单个服务：

```bash
docker exec pwncollege-dojo dojo compose config
docker exec pwncollege-dojo dojo compose restart ctfd
```

改动顶层 `Dockerfile`、`etc/systemd/`、Kata 或外层 Docker 配置时，需要执行 `./ops/build-outer-local.sh`，随后用相同数据目录重建外层容器。合并官方更新时先获取 `origin/master`，再合并到 `local/deployment`；不要在 `data/` 中保存源码或把其中的运行数据提交到 Git。

## 访问范围

当前端口只监听 `127.0.0.1`，不会直接暴露给局域网或公网。需要从另一台机器访问时，先建立 SSH 端口转发，或在配置域名、TLS 和网络访问策略后显式修改 `DOJO_LISTEN_ADDRESS` 并重建外层容器。

`verify-local.sh` 执行基础设施与 HTTP/SSH 只读检查；`smoke-user-flow.py` 临时注册用户、创建 smoke dojo、启动 Kata 工作区，检查 Terminal、Code、Desktop、SSH 和 home 持久化，然后删除测试用户与 dojo；测试不会读取或提交任何 flag。

本部署的验收只启动测试用工作区并检查服务，不读取 flag、不提交 flag，也不完成任何课程题目。
