# 本机部署与运维

本目录记录 `/mnt/HDD1/LLM/AISecEdu-dojo/dojo` 的单节点 pwn.college 部署。当前代码基线为上游提交 `b830d74339000c0fd8408558a13328ae8b1919b6`，外层镜像为 `pwncollege/dojo:local-b830d743`，容器名为 `pwncollege-dojo`。

完整的实机测试范围、结果和边界见 [`verification-report.md`](./verification-report.md)。

服务绑定到本机 LAN 地址 `192.168.3.111`，目标客户端为 `192.168.200.17`：

- Web：`https://192-168-3-111.nip.io`
- Workspace：`https://workspace.192-168-3-111.nip.io`
- SSH：`192.168.3.111:2223`
- 无 TLS 健康探针：`http://192.168.3.111/lan-health`
- 公开证书下载：`http://192.168.3.111/local-tls.crt`
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

## 人工功能验收账号

`local-dojos/manual-platform-check.yml` 提供四道不依赖外部服务的本地验收题，覆盖
Terminal、Code、Desktop、SSH、home 持久化、文件权限、动态 flag 提交以及挑战内
Web 服务。创建或复用普通账号、验收 dojo 和成员关系：

```bash
./ops/provision-manual-test.py
cat data/manual-test-account.txt
```

账号凭据只保存在被 Git 忽略且权限为 `0600` 的
`data/manual-test-account.txt`。执行以下命令可做逐题启动检查；它不会读取、提交
或求解 flag，且会确认 solve/submission 计数没有变化：

```bash
./ops/provision-manual-test.py --verify-startup
```

修改题目 YAML 后，如确认可以删除该验收 dojo 已有的进度，可使用
`--replace-dojo` 重新发布。详细题目范围见
[`local-dojos/README.md`](../local-dojos/README.md)。

入口使用自签名证书，SAN 包含 LAN 主域名、Workspace/Future 子域名、`192.168.3.111` IP 以及原有的三个 localhost 域名。证书 SHA-256 指纹为：

```text
E5:97:C8:A1:24:C0:80:53:F3:AC:6F:7A:E0:B7:89:AD:28:01:14:D6:CC:0F:C3:D8:69:F1:B8:4A:6F:2E:50:73
```

在 `192.168.200.17` 上可以先执行：

```bash
curl http://192.168.3.111/lan-health
curl http://192.168.3.111/local-tls.crt -o pwncollege-local.crt
```

第一个命令应输出 `pwn.college LAN endpoint ready`。将第二个命令下载的证书导入该客户端的系统或浏览器信任库后，再访问 Web 地址；也可以仅在浏览器验收时接受自签名证书。若客户端 DNS 拦截指向私网的 wildcard DNS，请在其 hosts 文件加入：

```text
192.168.3.111 192-168-3-111.nip.io workspace.192-168-3-111.nip.io future.192-168-3-111.nip.io
```

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

`ops/deployment.env` 固化了当前机器的非秘密 LAN 地址、访问域名、目标客户端和已验证镜像标签；显式进程环境变量优先于该文件，也可用 `DOJO_DEPLOYMENT_ENV` 指向另一份配置。`run-local.sh` 会读取该配置、准备源码读取权限和本地 TLS 证书。源码以可写、非递归 bind mount 挂载；非递归设置可防止内层 Docker 的 overlay 挂载反向泄漏到源码树。首次初始化会构建所有内层服务和 Nix 工作区，可能需要较长时间。如果预载前 `pwn.college.service` 因拉取超时失败，预载脚本会导入固定的基础镜像、清除失败状态并重新启动服务。只有首次构建成功后才启用离线模式；它让后续开机复用已验证镜像，不受 Registry 波动影响。查看进度：

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

当前端口只监听物理 LAN 地址 `192.168.3.111`，不监听 Docker bridge 或其他主机地址。已验证到 `192.168.200.17` 的路由经 `192.168.3.1`，源地址为 `192.168.3.111`，客户端连续响应 ICMP；UFW 当前为禁用状态，因此经路由可达该 LAN 地址的其他客户端也能连接这三个端口。若要求“仅允许 `192.168.200.17`”，应由有 root 权限的管理员在不中断宿主机其他业务的前提下添加源地址防火墙策略。

外层端口为 Web `80/443` 和 Workspace SSH `2223`。网页及浏览器内 Terminal、Code、Desktop 必须使用上面的主域名与 Workspace 域名，不能只把主页面改成一个任意 Host 名；这些服务依赖独立的 TLS/SNI 与签名路由。

`verify-local.sh` 执行基础设施与 HTTP/SSH 只读检查；`smoke-user-flow.py` 临时注册用户、创建 smoke dojo、启动 Kata 工作区，检查 Terminal、Code、Desktop、SSH 和 home 持久化，然后删除测试用户与 dojo；测试不会读取或提交任何 flag。

本部署的验收只启动测试用工作区并检查服务，不读取 flag、不提交 flag，也不完成任何课程题目。
