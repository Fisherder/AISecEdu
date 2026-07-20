# 本机部署验收报告

- 验收时间：2026-07-20（UTC）
- 项目目录：`/mnt/HDD1/LLM/AISecEdu-dojo/dojo`
- 本地分支：`local/deployment`
- 上游基线：`b830d74339000c0fd8408558a13328ae8b1919b6`
- 外层镜像：`pwncollege/dojo:local-b830d743`

## 验收结论

单节点部署的核心功能全部通过实机验证。平台可供本机开发和功能扩展；源码以读写方式挂载到 `/opt/pwn.college`，运行数据与源码分离并由 Git 忽略。测试只创建了一次性 dojo 和工作区，没有读取、提交或求解任何 flag。验收完成后的数据库计数为：管理员用户 `1`、dojo `0`、solve `0`、submission `0`，且不存在 `deployment-smoke-*` 测试用户或 dojo。

## 运行配置

| 项目 | 验收值 |
| --- | --- |
| Web | `https://localhost.pwn.college`，仅监听 `127.0.0.1:443` |
| HTTP | `127.0.0.1:80`，跳转到 HTTPS |
| SSH | `127.0.0.1:2223` |
| 外层 Docker | `29.1.3` |
| 内层 Docker | `27.5.1` |
| 宿主 Compose | `2.36.2` |
| Kata Containers | `3.19.1`，提交 `acae4480ac84701d7354e679714cc9d084b37f44` |
| PostgreSQL / Redis | `17.5` / `8.8.0` |
| Prometheus / Grafana | `3.13.1` / `13.1.0` |
| nginx | `1.29.1` |

外层容器使用 `unless-stopped` 重启策略和特权模式，以运行嵌套 Docker、Kata、Btrfs homefs 与相关内核功能。源码挂载已验证为可写且 `BindOptions.NonRecursive=true`；`data/` 单独以 shared propagation 持久化。这样既支持直接改代码，也不会把内层 overlay2 子挂载递归暴露回源码树。

本机证书为带以下 SAN 的自签名证书：

- `localhost.pwn.college`
- `workspace.localhost.pwn.college`
- `future.localhost.pwn.college`

证书 SHA-256 指纹为 `1B:BD:44:7A:66:CF:DF:69:21:4A:04:AF:3C:36:57:EC:8B:97:CC:00:AA:FA:FC:0A:A9:31:45:4F:01:12:39:1D`，有效期至 2027-08-21。管理员密码、本地 TLS 私钥和数据根目录权限分别验证为 `0600`、`0600` 和 `0700`。

## 功能测试结果

| 范围 | 结果 | 验证内容 |
| --- | --- | --- |
| 基础设施 | 通过 | 外层容器、systemd 单元、全部长期服务和一次性初始化服务 |
| 数据层 | 通过 | PostgreSQL 就绪、Redis `PONG`、连接池、后台统计冷启动 |
| Web 与 TLS | 通过 | HTTP 跳转、HTTPS 页面、三个本地域名的证书匹配、管理员登录和管理页 |
| 监控 | 通过 | Prometheus 健康，`node_exporter` 与 `cadvisor` 的 `up=1`；Grafana 数据库状态 `ok` |
| 用户与认证 | 通过 | 注册、登录、设置页、SSH 公钥添加和删除 |
| dojo 流程 | 通过 | 临时 dojo 创建、列表显示、加入与删除 |
| 隔离工作区 | 通过 | Kata v2 启动、运行时标签、home 的 `nosuid` 挂载、活动工作区 API |
| 交互服务 | 通过 | 带签名的 Terminal、Code、Desktop 代理；无效 HMAC 被拒绝 |
| SSH 工作区 | 通过 | 公钥认证、用户路由和远程命令执行 |
| 持久化 | 通过 | 工作区停止并再次启动后，home 测试文件仍存在 |
| 清理与解题边界 | 通过 | 临时用户、dojo、密钥、home 和容器均删除；solve/submission 始终为零 |
| 重启恢复 | 通过 | 外层容器多次重建后数据库、TLS 和 SSH 主机密钥保持不变，服务自动恢复 |
| Kata 独立性 | 通过 | `kata-runtime` 实际启动隔离 guest；guest 内核为 Linux `6.12.36` |

`./ops/verify-local.sh` 的全部非题目健康检查通过；`./ops/smoke-user-flow.py` 的全部非解题用户流程检查通过。日志审计未发现服务崩溃、fatal 或 unhealthy 状态。cAdvisor 对本机未安装 CRI-O/Podman 的探测失败是可选运行时发现信息；CTFd 在一次已经成功完成的 Docker HTTP 流对象回收时输出过一条 `Exception ignored`，对应请求及其后续功能均为成功，不影响平台行为。

## 持久化与备份

数据库、Redis、Docker、workspace Nix store、homefs、SSH 主机密钥和 TLS 材料均位于 `data/`。已创建并验证 PostgreSQL 17 自定义格式备份：

`data/backups/db-2026-07-20T17:12:29+00:00.dump`

备份大小为 `97881` 字节，并已在 PostgreSQL 17 容器内通过 `pg_restore -l` 成功解析。部署早期数据库未就绪时生成的 0 字节文件已删除。

## 为本机环境实施的修正

- 使用固定提交的 Kata、CTFd 和 Moby seccomp 构建上下文，替代不稳定的远程 Dockerfile `ADD`；下载内容带 SHA-256 校验。
- 增加宿主机下载后导入内层 Docker 的通用镜像导入脚本，并预载平台及烟雾测试镜像；正常运行启用离线模式。
- 增加本机 TLS 配置、持久证书、管理员密码轮换、只监听回环地址的默认设置。
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

本次是仅回环地址的单节点本机部署。需要外部凭据或额外基础设施的可选能力未配置，因此不在本次实机验收范围内，包括 Discord/OAuth、SMTP、Splunk profile、macOS 或远程 workspace nodes、公网 DNS 与受信任 CA 证书。这些不影响已启用的本机核心平台功能；启用时应分别提供凭据或节点并追加专项测试。
