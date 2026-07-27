# 本机部署与运维

本目录记录 `/mnt/HDD1/LLM/AISecEdu-dojo/dojo` 的单节点 AISecEdu 学生题目平台部署。它在 pwn.college 原生服务拓扑内完成单系统改造；外层镜像和容器继续使用 `pwncollege/dojo:*` 与 `pwncollege-dojo` 兼容名，不代表并存第二套平台。

完整的实机测试范围、结果和边界见 [`verification-report.md`](./verification-report.md)。

服务绑定到本机 LAN 地址 `192.168.3.111`，目标客户端为 `192.168.200.17`：

- Web：`https://192.168.3.111`
- Workspace 代理：`https://192.168.3.111:4443`
- SSH：`192.168.3.111:2223`
- 无 TLS 健康探针：`http://192.168.3.111/lan-health`
- 公开本地 CA 下载：`http://192.168.3.111/local-tls.crt`
- 持久数据：`./data/`
- 构建缓存：`./cache/`
- 本地 CA / 服务器证书：`./data/local-tls/ca.crt`、`./data/local-tls/fullchain.pem`

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
./ops/verify-learning-flow.py
./ops/verify-solution-agent-real.py
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

## 教师验收账号

教师账号应保持为普通 CTFd 用户，并通过目标课程的 `DojoAdmins` 关系获得课程教师权限；不要为人工教师验收直接分配平台超级管理员权限。以下命令会幂等创建或更新账号，并授予 `manual-platform-check` 课程教师身份：

```bash
AISECEDU_TEACHER_PASSWORD='replace-with-a-strong-password' \
  ./ops/provision-teacher-account.sh
```

可通过 `AISECEDU_TEACHER_USERNAME`、`AISECEDU_TEACHER_EMAIL` 和 `AISECEDU_TEACHER_COURSE` 修改账号与课程。脚本不会把密码写入仓库或日志；教师可从课程首页进入教师工作台。

入口服务器证书由持久的 `pwn.college Local LAN CA` 签发，CN 与 SAN 均使用
`192.168.3.111`。Web 与 Workspace 使用同一 IP 证书，但分别监听 `443` 和 `4443`；
端口隔离保留浏览器 origin 边界，主站的 `__Host-aisecedu-session` 也不会转发给题目
服务。CA 证书 SHA-256 指纹为：

```text
BF:18:E8:69:16:E1:8D:0D:DF:7D:C0:14:CC:9F:89:D9:71:93:20:B6:5B:BB:08:FA:7F:78:5B:6E:E4:C3:4F:3B
```

在 `192.168.200.17` 上可以先执行：

```bash
curl http://192.168.3.111/lan-health
curl http://192.168.3.111/local-tls.crt -o pwncollege-local-ca.crt
```

第一个命令应输出 `AISecEdu LAN endpoint ready`。macOS/Edge 客户端可将 CA
导入“钥匙串访问”的“系统”钥匙串，打开证书的“信任”区域并设为“始终信任”；
也可由管理员执行：

```bash
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain pwncollege-local-ca.crt
```

随后必须完全退出并重新打开 Edge。访问 `https://192.168.3.111`，再访问
`https://192.168.3.111:4443/trust-check`；后者应显示
`AISecEdu Workspace TLS is trusted and reachable`。入口只使用 IP，不依赖公网 DNS、
hosts 文件或 wildcard DNS，也不会因代理未绕过 `nip.io` 而把 LAN 请求发往代理。
域名入口的旧会话不会迁移到 IP 入口，切换后需重新登录一次。

CA 私钥只保存在服务器被 Git 忽略且权限为 `0600` 的
`data/local-tls/ca-key.pem`，不通过 Web 提供。只应在受控的测试客户端信任该 CA。

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

`ops/deployment.env` 固化了当前机器的非秘密 LAN IP、Web/Workspace 端口、目标客户端和已验证镜像标签；显式进程环境变量优先于该文件，也可用 `DOJO_DEPLOYMENT_ENV` 指向另一份配置。`run-local.sh` 会读取该配置、验证源码可读性并准备本地 TLS 证书。源码以可写、非递归 bind mount 挂载；非递归设置可防止内层 Docker 的 overlay 挂载反向泄漏到源码树。首次初始化会构建所有内层服务和 Nix 工作区，可能需要较长时间。如果预载前 `pwn.college.service` 因拉取超时失败，预载脚本会导入固定的基础镜像、清除失败状态并重新启动服务。只有首次构建成功后才启用离线模式；它让后续开机复用已验证镜像，不受 Registry 波动影响。查看进度：

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
- `dojo_theme/`：规范 Web UI；直接扩展上游服务端模板、原生组件、页面脚本和样式；
- `frontend/`：上游实验性前端源码，仅为跟随 pwn.college 上游保留，正常部署不启动，也不承载本项目页面；
- `workspace/`：Kata 工作区的 Nix 软件、Terminal、Code 和 Desktop 服务；
- `docker-compose.yml` 及各服务目录：新增或替换平台服务；
- dojo 定义：通过管理界面或独立 dojo 仓库添加课程和模块。

建议每项定制使用独立 Git 提交，并在提交前运行 `./ops/verify-local.sh`；它会执行离线 DeepSeek HTTP 参数、Guide/Tutor/Grader/出题模型路由、全上下文和动态秘密隔离测试，不会使用真实 key 或访问模型 API。涉及基础 Workspace 或认证的改动还应运行 `./ops/smoke-user-flow.py`；只修改容器上下文采集时先运行 `./ops/verify-container-context-real.py`，修改 L1/L2 源题复用/改编时运行 `./ops/verify-source-authoring-real.py`，涉及完整智能出题、证据、Guide、Tutor、评分或推荐的改动应运行 `./ops/verify-learning-flow.py`。改动教师工作台的“已验证解题步骤”、执行策略或动态 Flag 绑定时，额外运行会真实调用模型的 `./ops/verify-solution-agent-real.py`。智能学习域的架构、模型配置和升级说明见 [`../docs/learning.md`](../docs/learning.md)。

生产实例默认启用 `DOJO_OFFLINE=true`。改动 `dojo_plugin/` 或 `dojo_theme/` 后，同步源码并重启相关服务：

```bash
docker exec pwncollege-dojo dojo sync
docker exec pwncollege-dojo dojo compose restart ctfd stats-worker image-pull-worker
```

改动 Nginx、服务 Dockerfile、依赖或 `docker-compose.yml` 后，只重建受影响的模块：

```bash
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose up -d --no-build nginx
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

当前端口只监听物理 LAN 地址 `192.168.3.111`，不监听 Docker bridge 或其他主机地址。已验证到 `192.168.200.17` 的路由经 `192.168.3.1`，源地址为 `192.168.3.111`，客户端连续响应 ICMP；UFW 当前为禁用状态，因此经路由可达该 LAN 地址的其他客户端也能连接这四个端口。若要求“仅允许 `192.168.200.17`”，应由有 root 权限的管理员在不中断宿主机其他业务的前提下添加源地址防火墙策略。

外层端口为 Web `80/443`、浏览器 Workspace `4443` 和 Workspace SSH `2223`。Web、Terminal、Code 与 Desktop 都直接使用 `192.168.3.111`；Workspace 通过独立 HTTPS 端口和 HMAC 签名路由保持隔离，不再使用域名或 SNI 分流。

`verify-local.sh` 执行基础设施、IP 端口映射、HTTP/SSH、AISecEdu 首页/课程列表/认证页面、Workspace Cookie 隔离、可选前端停用状态，以及使用 mock HTTP 的 DeepSeek Guide/Tutor/Grader/出题路由、上下文、审查状态和秘密边界检查；`smoke-user-flow.py` 临时注册用户、创建 smoke 课程、启动 Kata 工作区，检查 `/challenge` 默认目录、完整工具集、IP:4443 上的 Terminal、Code、Desktop、SSH 和 Home 持久化。在宿主存在 Chromium/ChromeDriver 和 Selenium 时，它还会验证真实加载动画、Code 根目录、noVNC 完整键盘输入、双向剪贴板、终端静默证据记录和统一 Tutor；缺少任一浏览器依赖时自动跳过该段，非标准安装位置可通过 `DOJO_BROWSER_BINARY` 和 `DOJO_CHROMEDRIVER_BINARY` 指定，也可用 `DOJO_SKIP_BROWSER_SMOKE=true` 显式跳过。脚本最后删除测试用户与课程，且不会读取或提交 flag。

`verify-learning-flow.py` 使用一次性课程、用户和由验证器随机生成的 L3 教学挑战，在真实 Kata workspace 中验证红队修复、私有声明式报告 Oracle、Guide、Tutor、证据链和 Pro 过程评分。验证器按私有 `liveBindings` 主动请求该题当前运行的本地服务，生成与真实响应一致的一次性报告，并由 root 私有检查器复核响应、starter file 完整性和平台服务进程记录；随后只提交该挑战返回的动态 flag。结束时会删除对应 workspace、home、用户、课程、生成包、solve 与 submission，并断言运行前后的全局 solve/submission 数量一致，不读取或完成任何现有课程题目。

`verify-solution-agent-real.py` 创建一次性课程和普通学习者可见的握手题，真实调用 `deepseek-v4-pro` 以临时隐藏学习者身份启动 Kata workspace。它要求 Agent 仅沿题面公开入口解题、在 uid 1000 下获得与该临时账号和题目绑定的动态 Flag，并断言 Flag 只以脱敏证据出现。教师步骤必须与真实允许命令轨迹逐 turn、逐顺序一一对应；最后验证器删除临时课程、题目、工作区、用户和解题记录。

`verify-container-context-real.py` 创建一次性原生题和 Kata 工作区，直接验证可信容器快照能识别并有界读取 `/challenge` 下的挂载文件；扫描固定使用只读平台工具的绝对路径、非登录 shell、虚拟文件系统剪枝、深度/数量/字节上限，且不会跟随符号链接。`verify-source-authoring-real.py` 使用部署 key 创建一次性课程，依次真实验证 L1/L2 的 `deepseek-v4-flash` 方案、`deepseek-v4-pro` 规格构建/红队/最终验证、原生源题快照，并在发布后启动真实 Kata workspace，要求 Flash Tutor 同时使用源题基线、实时文件、学生证据和固定包版本；它断言复用题不会获得模型生成的 `solution.json`、Oracle 或第二套运行合约，并确保全局 solve/submission 计数不变。两个脚本都会删除其临时 workspace、Home、用户、课程及相关数据。

真实模型质量验收可依次运行 `verify-agent-context.py`、`verify-guide-real.py`、`verify-tutor-real.py`、`verify-grader-real.py`、`verify-authoring-build.py`、`verify-solution-agent-real.py` 和 `evaluate-ai-agents.py`。它们分别验证完整基线/实时容器上下文、连续 Guide/Tutor 交互、证据型 Pro 评分、Pro 构建与红队修复闭环、真实学习者边界内的教师解题轨迹，以及由独立 Pro 评审的四类 Agent 综合质量；除完整学习流程、源题发布和教师解题验证脚本外，这些聚焦验证器使用事务回滚或临时目录，不发布题目，也不会输出私有答案。
