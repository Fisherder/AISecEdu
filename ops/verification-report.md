# 本机部署验收报告

- 初始验收时间：2026-07-20（UTC）
- LAN 访问追加验收：2026-07-21（UTC）
- 持久人工验收场追加验收：2026-07-21（UTC）
- Workspace 客户端 TLS 修复验收：2026-07-21（UTC）
- 项目目录：`/mnt/HDD1/LLM/AISecEdu-dojo/dojo`
- 本地分支：`local/deployment`
- 上游基线：`b830d74339000c0fd8408558a13328ae8b1919b6`
- 外层镜像：`pwncollege/dojo:local-b830d743`

## 验收结论

单节点部署的核心功能全部通过实机验证，并已从仅回环访问调整为供客户端 `192.168.200.17` 使用的 LAN 部署。平台可供本机开发和功能扩展；源码以读写方式挂载到 `/opt/pwn.college`，运行数据与源码分离并由 Git 忽略。基础测试只创建了一次性 dojo 和工作区，没有读取、提交或求解任何 flag。LAN 基础验收完成当时的数据库计数为：管理员用户 `1`、dojo `0`、solve `0`、submission `0`，且不存在 `deployment-smoke-*` 测试用户或 dojo。随后按人工验收需求保留了普通账号 `manualtester` 和本地验收 dojo；其四道题的无解题启动检查全部通过，solve/submission 仍保持为零。

## 运行配置

| 项目 | 验收值 |
| --- | --- |
| Web | `https://192-168-3-111.nip.io`，监听 `192.168.3.111:443` |
| Workspace | `https://workspace.192-168-3-111.nip.io` |
| HTTP | `192.168.3.111:80`；健康/证书端点除外，其余跳转到 HTTPS |
| SSH | `192.168.3.111:2223` |
| 目标客户端 | `192.168.200.17`，经网关 `192.168.3.1` 可达 |
| 外层 Docker | `29.1.3` |
| 内层 Docker | `27.5.1` |
| 宿主 Compose | `2.36.2` |
| Kata Containers | `3.19.1`，提交 `acae4480ac84701d7354e679714cc9d084b37f44` |
| PostgreSQL / Redis | `17.5` / `8.8.0` |
| Prometheus / Grafana | `3.13.1` / `13.1.0` |
| nginx | `1.29.1` |

外层容器使用 `unless-stopped` 重启策略和特权模式，以运行嵌套 Docker、Kata、Btrfs homefs 与相关内核功能。源码挂载已验证为可写且 `BindOptions.NonRecursive=true`；`data/` 单独以 shared propagation 持久化。这样既支持直接改代码，也不会把内层 overlay2 子挂载递归暴露回源码树。

本机使用持久的 `pwn.college Local LAN CA` 签发服务器证书，服务器证书包含以下
SAN：

- `192-168-3-111.nip.io`
- `workspace.192-168-3-111.nip.io`
- `future.192-168-3-111.nip.io`
- `localhost.pwn.college`
- `workspace.localhost.pwn.college`
- `future.localhost.pwn.college`
- IP `192.168.3.111`

CA 证书 SHA-256 指纹为 `BF:18:E8:69:16:E1:8D:0D:DF:7D:C0:14:CC:9F:89:D9:71:93:20:B6:5B:BB:08:FA:7F:78:5B:6E:E4:C3:4F:3B`，有效期至 2036-07-18；服务器证书有效期至 2027-08-22。CA 私钥、服务器私钥、管理员密码和数据根目录权限分别验证为 `0600`、`0600`、`0600` 和 `0700`。公开下载端点只提供 CA 证书，不提供任何私钥。

## 功能测试结果

| 范围 | 结果 | 验证内容 |
| --- | --- | --- |
| 基础设施 | 通过 | 外层容器、systemd 单元、全部长期服务和一次性初始化服务 |
| 数据层 | 通过 | PostgreSQL 就绪、Redis `PONG`、连接池、后台统计冷启动 |
| Web 与 TLS | 通过 | 本地 CA 链、真实 LAN DNS、HTTP 跳转、HTTPS 页面、六个 DNS SAN 与 LAN IP SAN、管理员登录和管理页 |
| 监控 | 通过 | Prometheus 健康，`node_exporter` 与 `cadvisor` 的 `up=1`；Grafana 数据库状态 `ok` |
| 用户与认证 | 通过 | 注册、登录、设置页、SSH 公钥添加和删除 |
| dojo 流程 | 通过 | 临时 dojo 创建、列表显示、加入与删除 |
| 隔离工作区 | 通过 | Kata v2 启动、运行时标签、home 的 `nosuid` 挂载、活动工作区 API |
| 交互服务 | 通过 | 带签名的 Terminal、Code、Desktop 代理；无效 HMAC 被拒绝 |
| SSH 工作区 | 通过 | 公钥认证、用户路由和远程命令执行 |
| 持久化 | 通过 | 工作区停止并再次启动后，home 测试文件仍存在 |
| 持久人工验收场 | 通过 | 四道题均使用 Kata 启动；文件、端口和签名 Web 代理可用；未读取或提交 flag |
| 清理与解题边界 | 通过 | 临时用户、dojo、密钥、home 和容器均删除；solve/submission 始终为零 |
| 重启恢复 | 通过 | 外层容器重建后数据库和 SSH 主机密钥保持不变；TLS 按 LAN SAN 受控轮换，服务自动恢复 |
| Kata 独立性 | 通过 | `kata-runtime` 实际启动隔离 guest；guest 内核为 Linux `6.12.36` |

`./ops/verify-local.sh` 的全部非题目健康检查通过；`./ops/smoke-user-flow.py` 的全部非解题用户流程检查通过。日志审计未发现服务崩溃、fatal 或 unhealthy 状态。cAdvisor 对本机未安装 CRI-O/Podman 的探测失败是可选运行时发现信息；CTFd 在一次已经成功完成的 Docker HTTP 流对象回收时输出过一条 `Exception ignored`，对应请求及其后续功能均为成功，不影响平台行为。

## LAN 与目标客户端验收

- Docker 端口绑定精确验证为 `192.168.3.111:80`、`:443` 和 `:2223`，不是回环地址。
- 主域名、Workspace 域名与 Future 域名均通过真实 DNS 解析为 `192.168.3.111`。
- 使用真实域名和证书信任链访问 HTTPS 返回 `200`；HTTP 返回 `307` 并跳转到同一 LAN 域名；无效 Workspace HMAC 返回预期的 `404`。
- 客户端 `192.168.200.17` 的 Edge 日志显示主站和三个 Workspace URL 生成 API 均返回 `200`，但修复前没有任何 Workspace 子域请求到达 nginx；同时当前 Kata 工作区的 `6080`、`7681`、`8080` 端口与对应进程均正常。根因是客户端只绕过主域证书告警，跨域 iframe 的 Workspace 证书仍未受信任。
- TLS 已改为持久本地 CA 签发结构，并增加 CA 下载、Workspace `/trust-check` 端点和页面预检提示。使用该 CA 对当前用户的 Terminal、Code、Desktop 三个真实签名代理逐项复测，均返回 `200 text/html`。
- 从外层容器的独立网络命名空间回连 LAN HTTPS 入口返回 `200`，验证并非依赖宿主回环路径。
- 到 `192.168.200.17` 的路由使用 `eno1`、网关 `192.168.3.1` 和源地址 `192.168.3.111`；三次 ICMP 全部成功，丢包率 `0%`。
- UFW 配置为 `ENABLED=no`，没有阻止 Docker 发布端口。当前绑定对所有经路由可达 `192.168.3.111` 的客户端开放，并非只允许单一源 IP。
- `192.168.200.17:22` 明确拒绝 SSH 连接，因此无法在该客户端上自动执行最终 `curl`；没有尝试密码或绕过认证。客户端可用 `http://192.168.3.111/lan-health` 做无 DNS/无 TLS 的最终探测，并从 `/local-tls.crt` 获取公开证书。

## 持久化与备份

数据库、Redis、Docker、workspace Nix store、homefs、SSH 主机密钥和 TLS 材料均位于 `data/`。已创建并验证 PostgreSQL 17 自定义格式备份：

`data/backups/db-2026-07-21T01:01:27+00:00.dump`

该 LAN 变更前备份大小为 `97929` 字节，并已由 PostgreSQL 17.5 的 `pg_restore -l` 成功解析（自定义格式 1.16，302 个 TOC 条目）。部署早期数据库未就绪时生成的 0 字节文件已删除。

## 为本机环境实施的修正

- 使用固定提交的 Kata、CTFd 和 Moby seccomp 构建上下文，替代不稳定的远程 Dockerfile `ADD`；下载内容带 SHA-256 校验。
- 增加宿主机下载后导入内层 Docker 的通用镜像导入脚本，并预载平台及烟雾测试镜像；正常运行启用离线模式。
- 增加持久本地 CA、CA 签发服务器证书、管理员密码轮换和 LAN 部署配置；域名、Workspace 域名、LAN IP SAN、监听地址与已验证镜像标签均由 `ops/deployment.env` 固化。
- 增加无 TLS 的 LAN 健康探针、公开 CA 下载、Workspace 证书信任检测端点和 iframe 预检提示，同时保持私钥目录和私钥权限不变。
- 将 Prometheus target 文件改为临时文件加原子替换，避免重启竞争期间读取半写 JSON。
- 关闭 Grafana 插件自动更新，避免离线部署产生无意义的更新失败。
- 为 Desktop 创建正确的 X11 socket 目录，并仅限制 noVNC 进程的 OpenBLAS/OMP 线程数，避免高核数主机上 fork 时触发 guest 内存提交限制。
- 使用非递归源码 bind mount，防止嵌套 overlay2 挂载泄漏和卸载冲突。
- 向 node-exporter 暴露宿主 udev 数据库并指定稳定读取路径，保留完整磁盘设备属性采集。

## 二次开发能力

当前部署支持直接个性化修改代码和添加功能模块：

- 修改 `dojo_plugin/`、`dojo_theme/` 后执行 `dojo sync` 并重启相关服务；
- 修改 `frontend/`、服务依赖或 Dockerfile 后仅重建受影响的 Compose 服务；
- 可在 `docker-compose.yml` 增加服务，并用 `ops/import-inner-image.sh` 导入额外镜像；
- 修改 `workspace/` 可扩展 Kata 工作区软件和 Terminal、Code、Desktop 服务，Nix 输入由 `workspace/flake.lock` 固定；
- 所有定制保存在 `local/deployment` 分支，可用普通 Git 提交、对比、回退和合并上游更新。

具体命令见 [`README.md`](./README.md) 的“二次开发”章节。

## 未启用的外部集成

本次是绑定私有 LAN 地址的单节点部署。需要外部凭据或额外基础设施的可选能力未配置，因此不在本次实机验收范围内，包括 Discord/OAuth、SMTP、Splunk profile、macOS 或远程 workspace nodes、公网 DNS 与受信任 CA 证书。这些不影响已启用的 LAN 核心平台功能；启用时应分别提供凭据或节点并追加专项测试。
