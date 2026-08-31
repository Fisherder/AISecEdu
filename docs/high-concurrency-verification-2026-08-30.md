# 300 学生高并发验证与加固报告（2026-08-30）

## 结论

在当前 64 核、约 256 GiB 内存的单节点环境上，最终验收以 300 个独立学生账号同时访问完整
学生内容、300 人同时开启同一道题目的独立 Kata 工作区、300 份 VS Code、300 份远程桌面、
300 路真实 RFB WebSocket，以及 100 路真实 Guide 模型生成为负载。最终报告为
`passed: true`，所有被测操作均为 100% 成功，失败项和清理错误均为空。

机器可读主证据：
[`output/high-concurrency-full-300-pass-2026-08-30-verified.json`](../output/high-concurrency-full-300-pass-2026-08-30-verified.json)。

这证明的是当前硬件、镜像和准入参数下的 300 人课堂容量，不代表可以取消限流或继续线性增加
人数。最终轮最小可用内存约 17.74 GiB，共享内存峰值约 168.80 GiB，已经进入应持续监控的
容量区间。

## 负载模型

- 300 个真实注册用户，各自维护独立 Cookie、CSRF 与数据库身份并加入同一临时公开课程。
- 每人访问学生首页、课程列表/详情/学习页、Guide、学习分析、个人资料、设置、Workspace 页面，
  六个题目页以及 UI/学习/Workspace API。
- 每人执行 Guide 会话创建、重命名、置顶、取消置顶、归档与恢复。
- 300 人通过同一屏障同时启动各自的 Kata 题目容器；测试确认启动后仍同时存在 300 个容器。
- 300 人同时请求 Code，只有在返回页面包含 Workbench/code-server/VS Code 标志时才记成功。
- 300 人同时请求 Desktop，验证页面包含平台键盘/剪贴板桥；随后建立真正的 RFB WebSocket、
  校验协议问候并保持 15 秒。
- 100 人同时向真实 Guide 生成接口发送合成学习问题；只有提供方标记为 `MODEL` 才记成功。
- 全程每 5 秒采集宿主 load average、内存、外层 `/dev/shm`、关键服务资源和工作区数量。
- 默认精确清理本次用户、容器、Home、Btrfs 子卷、课程和目录；不匹配固定测试前缀时拒绝删除。

## 最终结果

| 场景 | 成功 | P50 | P95 | P99 | 最大值 |
|---|---:|---:|---:|---:|---:|
| 300 个题目工作区启动 | 300/300 | 52.46 s | 71.25 s | 73.52 s | 73.99 s |
| 300 个 VS Code 可用 | 300/300 | 57.84 s | 97.37 s | 279.06 s | 285.42 s |
| 300 个 Desktop 页面可用 | 300/300 | 52.29 s | 125.36 s | 131.58 s | 137.96 s |
| 300 路 RFB WebSocket | 300/300 | 39.30 s | 53.01 s | 54.30 s | 54.66 s |
| 100 路真实 Guide 模型 | 100/100 | 7.07 s | 7.95 s | 8.19 s | 8.24 s |

其他验收事实：

- 普通内容请求全部成功，最慢操作的 P95 为 4.159 秒，低于 5 秒门槛。
- Guide 会话写操作全部成功，最慢操作的 P95 为 1.304 秒。
- 最大同时工作区数与启动后工作区数均为 300。
- 模型来源计数为 `MODEL: 100`，没有 mock、fallback 或规则模板冒充模型成功。
- 1 分钟负载峰值 449.25；最小可用内存 17.74 GiB；外层共享内存峰值 168.80 GiB。
- 自动清理 `cleanupErrors: []`；随后独立审计确认测试账号 0、测试课程 0、运行工作区 0、
  启动租约 0、临时课程目录不存在。

VS Code 的 P99 明显高于 P95，是受 64 路准入队列影响的预期长尾，而不是失败。课堂同时点击时
大多数用户约 1–2 分钟可用，最后少量用户最长约 4.8 分钟。产品若需要把 P99 压到 2 分钟内，
下一步应增加工作区节点或预热 Code，而不是在本节点上提高冷启动并发并重新制造过载。

## 真实浏览器深度回归

并发验收之后又使用实际 Chromium 与 ChromeDriver 完成一轮独立、非解题式端到端回归，最终
`ops/smoke-user-flow.py` 以退出码 0 完成。该回归不是只检查 HTML 标志，而是实际执行了以下链路：

- 注册临时学生、加入临时课程、启动 Kata 工作区并通过真实 OpenSSH 密钥登录，确认起始目录为
  `/challenge`。
- 打开真实 VS Code Web 界面，确认工作区根目录为 `/challenge`、没有 Workspace Trust 弹窗，
  并在集成终端中完成键盘输入。
- 打开真实远程桌面，确认平台桥脚本、RFB 页面、键盘焦点以及本机与远程桌面的双向剪贴板路径。
- 打开 Web 服务的可编辑短地址，访问同一服务的子路径；打开真实 ttyd 终端并验证 Enter、Escape
  与 WebSocket 输出，不出现后台证据记录噪声。
- 验证 Flag 错误、网络失败与成功三种 UI 恢复路径，停止、重启、内嵌题目折叠和
  `/home/hacker` 持久化，以及统一确认弹窗和分阶段加载状态。
- 验证统一学生智能体能创建对话、只按显式题目引用建立回答范围、移动端侧栏与输入区铺满视口，
  并验证专用成绩页能回到正确题目。
- 清理临时课程、账号、容器和 Home 后确认没有新增 solve 或 submission。

回归脚本同时修正了两类测试环境误差：强制使用系统 OpenSSH 并忽略开发机通配
`ProxyCommand`，避免本地代理冒充平台 SSH 失败；同时将旧版工作区/Guide DOM 断言升级为当前
可复用操作栏和统一学生智能体结构。这样后续部署验收会覆盖当前真实产品，而不是对过时页面误报。

## 发现的问题与修复

### 1. Gevent 与阻塞式 PostgreSQL 驱动互锁

最初仅 25 人就会停滞约 1000 秒：PgBouncer 的 20 个连接全部处于
`idle in transaction`，CTFd worker 阻塞在 psycopg2，其他绿色线程无法推进。现在 Gunicorn
`post_worker_init` 安装 gevent-aware psycopg2 polling callback；CTFd 使用 32 个 worker，
PostgreSQL `max_connections=256`，PgBouncer 使用 160 个默认槽、32 个保留槽和 192 个数据库
连接上限。25 与 100 人阶梯测试随即通过。

### 2. Kata virtiofsd 耗尽外层 `/dev/shm`

第一次 300 人运行曾同时出现 300 个工作区，但 `/dev/shm` 的 126 GiB 上限被填满，
`virtiofsd` 因 SIGBUS（signal 7）退出，QEMU 随后 EOF，工作区降到 222。外层启动脚本现在将
`/dev/shm` 持久重挂载为默认 230 GiB，且校验配置格式；本地外层启动也使用 `--shm-size 230g`。

### 3. HomeFS 同步 worker 自调用死锁

64 个工作区跨过旧容量边界时，32 个同步 HomeFS worker 全部处理 Mount，同时递归 HTTP 调用
同一服务的 `/volume/...`，导致线程池自锁。HomeFS 现在使用 32 worker × 8 threads，并为存储
HTTP 设置 5 秒连接、60 秒读取超时。64 人边界复测的 workspace、Code、Desktop 和 RFB 均
为 64/64。

### 4. Code/Desktop 冷启动惊群

完全无界的 300 路 Code 启动把负载推到约 700，仅 27/300 可用；初版 30 秒包装超时会在
`dojo-service` 双重 fork 后过早释放租约，实际子进程继续无界启动，第二轮仍只有 208/300。
现在 Redis 有序集合租约跨 32 个 CTFd worker 统一限制冷启动：Code 与 Desktop 均为 64 路，
Code/桌面单次执行上限 240/120 秒，排队 600 秒，租约至少 300 秒；Nginx 的 Workspace API
窗口为 900 秒。最终两者均为 300/300。

基线到最终轮的 1 分钟负载峰值由 699.93 降至 449.25（约下降 35.8%）。该峰值仍高，因此
64 是当前节点的容量保护值，不是建议继续上调的起点。

### 5. 学生题目页执行无用 Git/文件系统工作

普通教师课程没有 GitHub 源码编辑链接，但每次题目页请求仍执行 `git rev-parse` 和描述文件
扫描。300 人同步访问时形成子进程风暴，四个题目页 P95 超过 5 秒，最坏为 5.801 秒。
现在仅官方且配置 repository 的课程构造源码编辑链接；同规模复测最坏 P95 降到 4.159 秒，
约改善 28.3%，严格 5 秒门槛通过。

### 6. HomeFS 显式删除留下激活元数据

容器、Docker 卷和 Btrfs 路径都已删除后，`active_volumes` 仍会保留位置记录。根因是
VolumeDriver `Remove` 只删除 `docker_volumes`。现在基础卷删除会在同一事务删除激活记录，
并支持“卷记录已不存在、激活记录仍在”的幂等恢复。真实回归从 `(active=1, docker=1)` 变为
删除后的 `(0,0)`；两轮共 600 个合成 ID 的旧记录在精确集合校验后清除。

## 关键实现

- `ops/verify-high-concurrency.py`：可重复的 300/300/100 验收、协议检查、资源采样和精确清理。
- `test/test_high_concurrency_verifier.py`：统计、边界校验与失败判定单测。
- `ops/gunicorn-ctfd.py`：gevent-aware psycopg2 初始化。
- `dojo_plugin/utils/workspace.py`：跨 worker 的 Code/Desktop 冷启动租约。
- `nginx/conf.d/location-workspace-api.conf`：只扩大工作区生命周期端点，不放宽全站超时。
- `homefs/Dockerfile`、`homefs/btrfs_volume.py`：可重入并发与有界存储超时。
- `homefs/volume_driver.py`：Docker 卷与激活元数据一致性清理。
- `dojo/dojo`、`ops/run-local.sh`：230 GiB 外层共享内存保障。
- `dojo_plugin/pages/dojo.py`：跳过学生无法使用的 Git/文件扫描。
- `ops/smoke-user-flow.py`：真实浏览器、OpenSSH、VS Code、远程桌面和学生智能体深度回归。

## 复现与判定

完整命令见 `ops/README.md`。运行前确认没有同名 `load-e2e-<run-id>`，运行后同时检查：

1. 报告 `passed` 为 `true`，`failures` 与 `cleanupErrors` 均为空。
2. `agentProviders.MODEL == 100`。
3. `maximumWorkspaceCount == workspaceCountAfterStart == 300`。
4. 数据库不存在 `load-e2e-%` 用户与课程，内层不存在 `user_*` 测试容器。
5. Redis 不存在 `workspace:service-start:*:leases`，临时课程目录不存在。

如果 300 人要求长期同时交互而不只是课堂级冷启动与 15 秒 RFB 保持，应在多节点环境继续做
30–60 分钟 soak、输入/终端流量和故障注入测试。当前测试已经证明全部入口和服务可同时建立，
但没有把单节点短时通过误写成无限时长或无限容量承诺。
