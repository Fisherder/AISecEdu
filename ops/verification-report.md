# 本机部署验收报告

- 初始验收时间：2026-07-20（UTC）
- LAN 访问追加验收：2026-07-21（UTC）
- 持久人工验收场追加验收：2026-07-21（UTC）
- Workspace 客户端 TLS 修复验收：2026-07-21（UTC）
- 玄甲单系统融合验收：2026-07-21（UTC）
- 统一学生与认证界面验收：2026-07-22（UTC）
- 课程领域语言与教师工作台验收：2026-07-22（UTC）
- 玄甲课程界面全面接管验收：2026-07-22（UTC）
- Workspace 导航、Tutor 与完全重置验收：2026-07-22（UTC）
- Workspace 加载、题目目录、输入与完整工具链验收：2026-07-22（UTC）
- 玄甲品牌、Esc、双向剪贴板与 IDA 图标验收：2026-07-22（UTC）
- DeepSeek Tutor 与三层出题 Agent 路由验收：2026-07-23（UTC）
- Guide、Tutor、Grader 与出题全上下文真实模型质量验收：2026-07-23（UTC）
- 源题 Flash/Pro 出题与 Kata 实时 Tutor 联合验收：2026-07-23（UTC）
- IP 直连与 Workspace 独立端口迁移验收：2026-07-26（UTC）
- Workspace Flag、Tutor 布局与容器生命周期验收：2026-07-26（UTC）
- Workspace 收起、自定义确认、Guide 多题引用与短 Web 入口验收：2026-07-26（UTC）
- 可编辑短 Web URL、题目评分页与 Guide 满高布局验收：2026-07-26（UTC）
- Guide 引用范围隔离与防错题验收：2026-07-26（UTC）
- 项目目录：`/mnt/HDD1/LLM/AISecEdu-dojo/dojo`
- 本地分支：`main`
- 上游基线：`b830d74339000c0fd8408558a13328ae8b1919b6`
- 外层镜像：`pwncollege/dojo:local-b830d743`

## 验收结论

单节点部署的核心功能和玄甲智能学习闭环全部通过实机验证，并已调整为供客户端 `192.168.200.17` 使用的 LAN IP 直连部署。Web 唯一入口为 `https://192.168.3.111`，浏览器 Workspace 使用同一 IP 的 `4443` 端口保持独立 origin，不再依赖 `nip.io`、公网 DNS、hosts 或子域证书。公开 UI 已统一为玄甲，课程列表、课程简介/学习状态/单元/学生排行榜、单元题目、Workspace 与认证页都由同一个 CTFd 主题直接渲染。Terminal、Code、Desktop 统一进入 `/workspace?service=`，带明确加载状态并直接落在 `/challenge`；Web 服务使用完整显示、可复制和可修改后续路径的 `/w/<容器 ID>/<端口>/` 短地址，HMAC 只用于首次授权。题目完成提示包含“查看评分”，独立评分页展示总分、客观/过程分、评分明细、六维能力、复盘和证据时间线。停止题目后内嵌工作区自动收起，生命周期和切题确认使用统一页面内确认框。Guide 支持像引用文件一样引用最多六道题，并把引用固定为本对话唯一题目范围；无关活动 workspace、历史轮次和课程目录不会进入该轮模型上下文，失效引用与偏离引用的模型输出都会被服务端阻断。页面现完整占用视口高度，不再保留基础主题的 100px 页脚空白。Esc 等完整键盘输入、桌面双向剪贴板、静默证据记录、完整安全工具 profile、清晰的 IDA 启动图标、统一提示式 Tutor 和完全重置均已通过真实浏览器与 Kata 容器验证。Guide、Tutor、Grader 和出题流水线此前已使用部署密钥真实调用 DeepSeek API，并由独立 Pro 评审通过；本轮引用隔离改动使用不外传现有学生证据的离线模型冲突测试与真实 Chromium UI/API 回归验证。学习能力复用同一主题、CTFd 身份、PostgreSQL 和 Kata/Nix workspace，没有第二套 API、前端、认证、数据库或终端网关。平台可供本机开发和功能扩展；源码以读写方式挂载到 `/opt/pwn.college`，运行数据与源码分离并由 Git 忽略。

基础与 smoke 测试只创建一次性 dojo 和工作区，没有读取、提交或求解任何 flag。专项学习验证器另行创建随机 L3 教学挑战，并只提交该一次性挑战的动态 flag，以验证客观 Oracle、证据和评分；结束后会删除课程、用户、工作区、home、生成包、challenge/profile、solve/submission 和测试审计，并断言全局 solve/submission 计数不变。当前不存在 `deployment-smoke-*` 或 `learning-e2e-*` 测试用户、dojo、生成题孤儿和测试审计残留。

## 运行配置

| 项目 | 验收值 |
| --- | --- |
| Web | `https://192.168.3.111`，监听 `192.168.3.111:443` |
| Workspace | `https://192.168.3.111:4443`，独立 origin 与 HMAC 路由 |
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
| DeepSeek | 部署密钥保存在 Git 忽略且不对外输出的 `/data/config.env`；官方 `/chat/completions` 真实调用通过；Guide/Tutor/方案层使用 `deepseek-v4-flash`，Grader/私有解法/规格/产物/红队/修复/最终验证使用 `deepseek-v4-pro`；离线 mock 契约与真实模型质量验收均通过 |

外层容器使用 `unless-stopped` 重启策略和特权模式，以运行嵌套 Docker、Kata、Btrfs homefs 与相关内核功能。源码挂载已验证为可写且 `BindOptions.NonRecursive=true`；`data/` 单独以 shared propagation 持久化。这样既支持直接改代码，也不会把内层 overlay2 子挂载递归暴露回源码树。

本机使用持久的 `pwn.college Local LAN CA` 签发服务器证书，服务器证书 CN 与唯一
SAN 均为 IP `192.168.3.111`。CA 证书 SHA-256 指纹为
`BF:18:E8:69:16:E1:8D:0D:DF:7D:C0:14:CC:9F:89:D9:71:93:20:B6:5B:BB:08:FA:7F:78:5B:6E:E4:C3:4F:3B`，
有效期至 2036-07-18；服务器证书有效期至 2027-08-27。CA 私钥、服务器私钥、
管理员密码和数据根目录权限分别验证为 `0600`、`0600`、`0600` 和 `0700`。公开
下载端点只提供 CA 证书，不提供任何私钥。

## 功能测试结果

| 范围 | 结果 | 验证内容 |
| --- | --- | --- |
| 基础设施 | 通过 | 外层容器、systemd 单元、全部长期服务和一次性初始化服务 |
| 数据层 | 通过 | PostgreSQL 就绪、Redis `PONG`、连接池、后台统计冷启动 |
| Web 与 TLS | 通过 | 本地 CA 链、IP 证书、HTTP 跳转、443/4443 HTTPS 页面、管理员登录和管理页 |
| 监控 | 通过 | Prometheus 健康，`node_exporter` 与 `cadvisor` 的 `up=1`；Grafana 数据库状态 `ok` |
| 用户与认证 | 通过 | 玄甲登录、注册、密码恢复、邮箱验证、原生 session 登录态与防枚举恢复流程 |
| 课程题目界面 | 通过 | 玄甲 `/dojos` 分组列表、课程简介、学习状态、单元、学生排行榜、单元资源/题目手风琴和选课流程 |
| 教师工作台 | 通过 | 普通 CTFd 用户通过课程教师关系获得工作台权限，可直接新建课程、单元和题目，并使用学生分析与评价复核；无平台超级管理员越权 |
| dojo 流程 | 通过 | 临时 dojo 创建、列表显示、加入与删除 |
| 隔离工作区 | 通过 | Kata v2 启动、运行时标签、home 的 `nosuid` 挂载、默认工作目录和 Code 根目录均为干净的 `/challenge`、活动工作区 API |
| 交互服务 | 通过 | 带签名的 Terminal、Code、Desktop 代理；Web 使用授权后完整显示的可编辑短 URL；四种模式均有加载提示/动画；无效 HMAC 与无能力 Cookie 的短路由均被拒绝 |
| Workspace 交互 | 通过 | 统一 `/workspace?service=` 路由、左侧课程/单元/题目切换、右侧全宽可收起 Tutor、紧凑实时就绪状态、非阻塞 Flag 结果、停止后自动收起内嵌工作区、统一确认框及明确的重启/停止/重置操作 |
| Workspace 输入与工具 | 通过 | Terminal/Code/Desktop 的 Esc 不被页面抢占；noVNC 对画布与隐藏输入框统一捕获完整键盘、全屏 Keyboard Lock 和浏览器↔远端双向剪贴板；终端命令输出不显示 evidence job；GCC/Clang、Vim/Neovim、GDB/GEF、Nmap/Wireshark、Burp、IDA、Ghidra、Cutter、radare2、Firefox、tmux 等 full profile 可执行；IDA 使用独立高辨识度图标 |
| SSH 工作区 | 通过 | 公钥认证、用户路由和远程命令执行 |
| 持久化 | 通过 | 工作区停止并再次启动后，home 测试文件仍存在 |
| 持久人工验收场 | 通过 | 四道题均使用 Kata 启动；文件、端口和签名 Web 代理可用；未读取或提交 flag |
| 智能出题 | 通过 | Flash 策略 Agent 基于题库和教师自然语言自动选择 L1/L2/L3；Pro 构建、独立红队及后台“验证—修复—复验”自主闭环逐轮可见；模型高危阻断、确定性 finding、真实服务响应绑定、文件/根进程完整性、私有解法禁止重启托管服务、稳定挑战身份、不可变版本和原生模块发布 |
| Guide、证据与 Tutor | 通过 | Guide 支持最多六道可见题目引用并将其持久化为线程范围；上下文过滤无关活动题、历史轮次、目录与推荐，失效引用返回 400，偏题模型输出触发范围保护；读取各题真实 attempt、评测、反思、事件和 Tutor 历史；当前 epoch、CLI 自动命令、allowlist、脱敏、S1–S4、SHA-256 哈希链；Tutor 使用完整题面、基线/实时容器、私有解法和学生过程 |
| 学习评测 | 通过 | Oracle 独立锁定客观 60 分；`deepseek-v4-pro` Grader 使用完整上下文、反思和 Oracle 结果评过程 40 分，返回可核对的事件/容器证据引用；完成提示可进入本次独立评分页查看总分、分项、能力、复盘与证据；支持回放、推荐、申诉和确定性复评 |
| 单系统与单入口 | 通过 | CTFd + `dojo_theme` 统一学生、认证与管理 UI；可选 frontend 未运行；Web 只使用 LAN IP |
| 清理与解题边界 | 通过 | 临时用户、dojo、密钥、home、容器、原生/生成 challenge、版本包和审计均删除；有符号 dojo ID 目录换算与 solve/submission 边界均通过 |
| 重启恢复 | 通过 | 外层容器重建后数据库和 SSH 主机密钥保持不变；TLS 按 LAN SAN 受控轮换，服务自动恢复 |
| Kata 独立性 | 通过 | `kata-runtime` 实际启动隔离 guest；guest 内核为 Linux `6.12.36` |

`./ops/verify-local.sh` 的全部非题目健康检查通过，其中 mock HTTP 契约覆盖 Guide、Tutor、Grader、私有解法及出题方案/构建/验证调用点的模型、思考参数、JSON 模式、全上下文和动态验证秘密隔离。随后使用部署密钥执行真实 DeepSeek 调用：Guide 连续两轮、Tutor、Grader 和完整出题链均返回 `MODEL` provider，并由两个互相独立的 Pro 评审请求分别评价学习 Agent 与出题 Agent；所有维度均不低于 4/5，综合得分 4.85/5，`criticalFindings=[]`。`./ops/smoke-user-flow.py` 的全部非解题用户流程检查通过；`./ops/verify-learning-flow.py` 的单点身份、角色边界、课程单元创建权限、L1/L2/L3 出题、DeepSeek 三层路由元数据、两版稳定发布、源包快照、真实 workspace、容器与 Home 完全重置、新 epoch、证据、Tutor、动态 flag、60/40、六维能力、申诉、分析和清理检查全部通过。玄甲 UI 完成匿名与管理员登录态逐页验证，并以匹配版本的真实 headless Chrome-for-Testing/ChromeDriver 验证 Workspace 三种加载动画、Code `/challenge` 根目录和无信任弹窗、Terminal/Code/Desktop 中的 Vim Esc、noVNC 完整键盘事件不会传播到模拟浏览器快捷键处理器、浏览器与远端双向剪贴板、Terminal WebSocket 可见输出中没有 evidence 后台任务信息，以及无等级的统一 Tutor；随后验证停止/启动后的 Home 持久化，且全局 solve/submission 计数保持不变。主题脚本同时按 `.js` / `.dev.js` / `.min.js` 软链接约定验收，避免生产资源 URL 404；JavaScript、Python 3.12、Shell、XML、关键 Ruff 规则与 Git whitespace 检查通过。可选 frontend 容器和旧镜像已删除且不属于 `main` profile。日志审计未发现服务崩溃、fatal 或 unhealthy 状态。cAdvisor 对本机未安装 CRI-O/Podman 的探测失败是可选运行时发现信息；CTFd 在验证期间回收已成功完成的 Docker HTTP 日志流时输出过若干 `Exception ignored`，均为 Python 3.13 `HTTPResponse.close()` 对已关闭流再次 flush 的 `ValueError`，对应启动请求全部返回 `200` 且后续功能均成功，不影响平台行为。

消息提示回归已在真实 Chromium 中通过：Tutor 就绪、Workspace 状态、剪贴板和操作结果均使用页面内提示或原版操作栏横幅，不生成确认窗口；横幅显示期间仍可继续切换 Terminal、Code 和 Desktop。重启、停止、重置、切题、删除等需要明确决策的操作使用与当前主题一致的玄甲确认框，普通用户脚本中不存在浏览器原生 `window.confirm`、`window.prompt` 或 `window.alert`。教师出题工作台的 Agent 生成、验证、修复和发布提示保持原有模态交互。

## Workspace Flag、Tutor 与容器生命周期专项验收

- 故障日志复现确认：修复前一次正确 Flag 请求在 `DojoChallenge.solve()` 中同步执行两次 Pro Grader 调用，模型阶段分别约 34 秒和 75 秒，`POST /api/v1/challenges/attempt` 总耗时 110.26 秒；前端又缺少 `catch/finally`，网络异常或长请求会让提交图标永久保持旋转。该路径还在 `BaseChallenge.solve()` 提交 Solve 后写学习记录却未再次提交事务，存在学习基线被请求结束回滚的问题。
- 正确 Flag 现在只同步记录 Oracle 证据并生成本地确定性 60 分基线，显式提交并在失败时回滚隔离，不再等待外部模型，也不会因学习记录异常阻断 Flag 结果。学生主动提交反思、教师复核和申诉仍走 `deepseek-v4-pro`，过程分评分能力没有删除。
- `actionSubmitFlag()` 增加重复提交锁、严格 Flag 格式检查、30 秒超时、异常横幅和无条件状态恢复。真实部署的 `/api/v1/challenges/attempt` 严格定向测试在 `0.15s` 返回正确结果，并确认客观分 `60`、assessment revision `1`、source 与 Grader provider 均为 `DETERMINISTIC`；临时 dojo、用户、工作区、Home、Solve 和 Submission 均自动清理，清理前后全局计数一致。
- Tutor 展开态取消占宽的左侧切换轨道，内容使用整个面板宽度；趋势图入口移到面板底部的“查看学习分析”。大块“就绪”通知和基于历史回复推测的“容器待就绪”均已移除，改为直接查询当前活动 attempt 的紧凑状态元素。
- 左右侧栏切换按钮现分别固定在外侧左上角和右上角，展开/收起只改变面板宽度和图标，真实 Chromium 中两种状态的按钮横纵坐标均保持一致。左侧原 `3.25rem` 占宽轨道改为覆盖式按钮层，课程、单元与题目列表从面板内边距开始，使用原绿框空间。
- 底部圆形箭头不是“重新连接”，现明确标为“重启”：替换题目容器并开启新 attempt，保留 `/home/hacker`，但进程和 Home 之外的容器改动会丢失。新增“停止”按钮：结束 attempt 并移除容器，仍保留 Home；“重置”继续表示清空 Home 后从初始状态重建。
- 真实 Chromium 已完成停止、停止态遮罩、重新启动、Home 文件保留、容器临时状态清除及 Tutor 布局断言；JavaScript 语法、Python 编译、Shell 语法、静态回归守卫和 Git whitespace 检查均通过。
- 本次额外完整学习流复跑在进入 Flag 阶段前，被真实 Pro 对随机 L1 出题包给出的 `PUBLICSPEC` 高风险 finding 正常阻断；这是 AI 出题门禁的非确定性结果，不是 Workspace 回归。此前完整学习流验收仍有效，本次改动相关路径由浏览器实测、定向 Flag 测试及确定性静态/单元断言覆盖。

## Workspace 收起、统一确认、Guide 引用与 Web 入口专项验收

- 在课程题目页停止容器后，内嵌 iframe、操作栏和 Tutor 自动销毁并收起，题目恢复到紧凑未启动状态；独立 `/workspace` 页面保留停止状态和“重启”入口。真实 Chromium 已断言手风琴关闭、初始化区域恢复且 iframe 内容清空。
- 重启、停止、重置、sudo 权限切换、运行中切题、Guide 会话删除和设置中的确认流程均改用同一主题确认框；Enter 可确认，取消与关闭不执行操作，危险操作使用明确的警告/危险样式。静态守卫确认普通主题脚本没有浏览器原生确认、提示或警告框。
- 导航和 Tutor 标题已从“学习 Guide”“学习 Tutor”收敛为“Guide”“Tutor”。真实浏览器验收确认不存在旧标题。
- Guide 输入框支持通过 `@` 或引用按钮检索并选择最多六道可见题目，所选题以可移除引用芯片显示并持续作为本对话范围。服务端按稳定标识重新校验权限，提取公开题目说明、目标、最近 attempt、最新评测、反思、可信过程事件和 Tutor 历史；越权、失效或部分无法解析的引用返回 400，不会退回其他题目。真实数据库验证取得 4 个可引用题目、目标题 7 次 attempt 和 17 条最近过程事件；离线模型路由测试确认这些证据进入 `referencedStudyContexts`，而无关活动 Web 题、Web 历史消息和目录不会进入模型负载。
- Web 题首次 iframe 请求使用 `/w/<容器 ID>/auth/<HMAC>/<端口>/` 验证既有 HMAC，并写入限定到 `/w/<容器 ID>/` 的 `Secure`、`HttpOnly`、`SameSite=Lax` 能力 Cookie；随后重定向到实际可访问的 `/w/<容器 ID>/<端口>/`。操作栏展示并复制完整短地址。真实 Chromium 将后续路径改为 `index.html` 后仍正确访问目标资源；未携带能力 Cookie 的短路由返回 `404`。
- 正确 Flag 响应的非阻塞横幅和题目卡片提示均会生成“查看评分”按钮，指向当前用户该题最近一次已完成 attempt。独立 `/learning/attempts/<attempt-id>/score` 页面通过真实登录态和 API 数据验收，包含总分、客观 60 / 过程 40、可信度、评分项、六维能力、复盘和证据时间线；测试中的正确响应由前端 mock 提供，没有提交真实 Flag。
- Guide 清除了基础 CTFd `main { margin-bottom: 100px }` 对嵌套主区域的影响，页头压缩到 64px 内，消息区占用剩余高度，输入区固定在视口底部，页面不再渲染通用 Footer。760×1000 与 1600×1000 的真实 Chromium 尺寸切换均通过满高断言。
- 本轮完整 Chromium smoke 未读取或提交任何 flag，验证了自定义确认、可编辑短 Web URL、评分页、Guide 引用与满高布局、停止后收起、Code 根目录、Desktop 剪贴板、Terminal 静默证据与 Tutor；`./ops/verify-local.sh` 全部非题目健康检查通过。

## Guide 引用范围隔离专项验收

- 根因确认：旧提示词把 `activeStudyContext` 声明为最高优先级；用户引用“终端握手”时，当前活动的“浏览器 Web 服务”、旧 Web 对话和完整课程目录仍同时进入模型，导致引用 chip 正确但回答对象错误。
- 新范围规则为“显式引用 > 其他一切”。引用存在时，只保留引用题目的档案、同范围历史和可选的同题实时环境；活动题与引用不一致时不会读取其容器上下文。无引用的“这道题”类提问不会猜测最近活动题，而是要求先使用 `@`。
- 引用会保存在 Guide 线程中，发送后 chip 不再消失，切换对话时按各线程恢复。顶部状态条只显示“整体学习记录”或“本对话题目”，不再把当前 Web workspace 伪装成回答范围。修复前生成且没有范围校验记录的助手消息不会进入后续引用上下文，并在界面标为“历史回答 · 引用范围未校验”。
- 模型必须回报完整 `usedReferenceIds`、点名全部引用题，并通过未引用题名冲突检查；偏离范围的输出会替换为安全回答并记录 `MODEL_SCOPE_BLOCKED`，无效引用在调用模型前直接拒绝。
- 离线冲突测试使用“活动题=浏览器 Web 服务、引用题=终端握手、历史=Web”组合，确认模型负载中不含 Web 题；另用故意返回 Web 答案的 mock 模型确认服务端拦截。真实 Chromium 验证引用范围条、持久 chip、满高布局和 `@` 交互；真实 HTTP 验证无引用歧义问题不会偷选活动题、失效引用返回 400。全流程未调用外部模型、未读取或提交 Flag，临时用户、课程和 workspace 均已清理。

## 教师出题自主闭环专项验收

- 教师工作台已移除“复用 / 改编 / 新建”策略选择器。题库检索完成后，Flash 策略 Agent 同时读取教师需求、公开约束与最多八个候选摘要，返回唯一 L1/L2/L3、候选题和理由；教师在自然语言中明确指定策略时不调用策略模型并优先服从，客户端遗留的 `level` 字段被忽略。
- 草稿建立后自动进入最终发布门，不再显示或依赖教师手动“校验”按钮。独立 Pro 验证和确定性门禁的所有 BLOCK 会被统一转换为带稳定 ID 的修复 finding；Pro 修复后由另一 Pro 复验，再重新运行完整发布门，最多五轮以避免异常无限循环。
- `LearningAuthoringJobs.steps` 支持动态追加“第 N 轮独立验证”和“第 N 轮自主修复与复验”。任务卡片与进度弹窗实时展示每轮阻断数、修复周期、剩余 finding、题包是否变化和最终状态；教师主动修订也使用同一后台编排器。
- 离线契约测试模拟“首轮运行时门禁 BLOCK → 精确修复 → 第二轮 PASS”，确认验证调用两次、修复调用一次、草稿转为 `VALIDATED`，并产生 `validation-repair-1` 与 `validate-2` 进度。策略测试确认 Agent 可选择第二候选执行 L1，同时确认教师明确 L3 时模型不会覆盖。部署容器内完整 `verify-ai-routing.py` 已通过全部既有路由、安全、源题、Oracle、修复闭环测试及新增自主编排断言。
- 真实部署验收故意向后台接口提交遗留 `level=L1`，正文不指定策略。Flash 策略 Agent 实际比较 5 个候选后选择 L3，说明候选均不满足 Web 证据分析、基线、可证伪假设和客观验证要求；任务随后完成方案、Pro 构建、独立红队和预审闭环，并在第 1 轮最终验证以 0 项阻断、2 项警告达到 100%。验收草稿、任务和 3 条审计记录已按精确 ID 删除，未发布题目。真实无头 Chromium 确认策略下拉框与手动校验按钮均不存在、新文案和进度容器可见、脚本已加载且没有相关控制台错误；`./ops/verify-local.sh` 全部通过，应用日志无后台异常。

## 真实 DeepSeek Agent 质量验收

真实 API 验收未输出 API key、私有答案或动态 flag，聚焦验证器使用事务回滚或临时目录，不发布生成题，也不修改学生当前 attempt：

- Guide 使用 `deepseek-v4-flash` 完成两轮连续对话，读取活动题目的课程/单元/题目身份、实时进程和端口、文件变化及最近事件。独立 Pro 评分为 specificity 4、personalization 5、actionability 5、safety 5、coherence 5；回答不再建议重复启动已经运行的服务。
- Tutor 使用 `deepseek-v4-flash`，确认基线与实时容器均可用、题目包版本一致，并引用 2 个参考文件、1 个实时文件和 5 个过程事件；回答通过私有解法防泄露检查。
- Grader 使用 `deepseek-v4-pro`，在服务端锁定的 6 项过程 rubric 内返回 18 个有效证据引用，题目包版本一致，私有标准解法来源为 `MODEL`，未泄露受保护事实。
- 完整出题质量评审中，Flash 方案层与 Pro 构建/验证层先因确定性运行/Oracle 闭环不足被正确 BLOCK，再由 Pro 修复并把全部中高风险 finding 标记为 `RESOLVED`，最终独立验证 PASS。
- 新增“私有解法不得手动重启平台托管服务”门禁后又单独运行一次真实 Pro 出题：初审捕获 `det-private-solution-runtime` HIGH finding 并强制 BLOCK，Pro `CONTRACT_CLOSURE` 一轮修复后该 finding 为 `RESOLVED`，最终 PASS；生成 1 个 starter file、1 个 runtime service、2 个实时响应绑定，私有检查器权限为 `0700`。
- `verify-container-context-real.py` 使用真实 Kata 工作区确认源题 `/challenge/run` 挂载文件进入可信 live context 且内容可用；采集器改用非登录 shell 和只读平台工具绝对路径，避免题目优先 `PATH` 与 profile 输出污染机器记录，同时保留虚拟文件系统剪枝、符号链接不跟随和有界读取。
- `verify-source-authoring-real.py` 进一步使用部署密钥真实创建并发布 L1/L2：两者的第一层均为 `deepseek-v4-flash/MODEL`，公开规格构建、红队与最终验证均为 `deepseek-v4-pro`；发布包分别为 `USE_EXISTING` / `ADAPT_EXISTING` 的独立快照，保留源题原生文件、启动和 checker/flag 语义，且 `verificationAnswer`、starter files、自定义 Oracle 和第二套运行合约均为空。发布后真实启动 L2 Kata workspace，Flash Tutor 返回 `MODEL`，同时使用 1 个源题参考文件、至少 1 个实时文件、3 个可信过程事件和匹配的 attempt/package 版本，未触发泄漏拦截。临时课程、workspace、Home、用户、draft、challenge/profile、快照和审计全部清理，solve/submission 计数未变化。

## LAN 与目标客户端验收

- Docker 端口绑定精确验证为 `192.168.3.111:80`、`:443`、`:4443` 和 `:2223`，不是回环地址。
- 迁移前系统 DNS 已无法解析 `192-168-3-111.nip.io`，且 HTTPS 客户端会把该域名送入代理；直接 IP 健康探针仍返回 `200`，说明故障位于域名/DNS/代理入口层，不在应用或 LAN 路由。
- 当前 Web 和 Workspace 都直接使用 `192.168.3.111`；HTTP 返回 `307` 到同一 IP 的 HTTPS，443 与 4443 均使用 IP SAN 证书，无效 Workspace HMAC 返回预期的 `404`。
- Workspace 独立端口保留跨 origin 隔离；主站会话使用 `Secure`、`HttpOnly`、`SameSite=Lax` 的 `__Host-aisecedu-session`，Nginx 不向题目上游转发该 Cookie。Web 短路由使用按容器路径限定、12 小时失效的独立能力 Cookie；容器重启后 ID 改变，旧短地址自然失效。
- 当前真实临时用户流程对 Terminal、Code、Desktop 三个签名代理逐项返回 `200`，SSH、公钥路由、Home 持久化和清理均通过，未记录 solve/submission。
- 从外层容器的独立网络命名空间回连 LAN HTTPS 入口返回 `200`，验证并非依赖宿主回环路径。
- 到 `192.168.200.17` 的路由使用 `eno1`、网关 `192.168.3.1` 和源地址 `192.168.3.111`；此前三次 ICMP 验收全部成功。本次 Workspace 回归期间该客户端未响应 ICMP，因此跳过客户端存活断言后完成服务端、真实浏览器和 IP 入口验证；当前部署端口与路由未改变。
- IP 入口的 `/`、`/dojos`、课程、单元、Workspace、登录、注册、密码恢复、邮箱验证与 `/learning` 均由 CTFd 的玄甲主题提供。
- UFW 配置为 `ENABLED=no`，没有阻止 Docker 发布端口。当前绑定对所有经路由可达 `192.168.3.111` 的客户端开放，并非只允许单一源 IP。
- `192.168.200.17:22` 明确拒绝 SSH 连接，因此无法在该客户端上自动执行最终 `curl`；没有尝试密码或绕过认证。客户端可用 `http://192.168.3.111/lan-health` 做无 DNS/无 TLS 的最终探测，并从 `/local-tls.crt` 获取公开证书。

## 持久化与备份

数据库、Redis、Docker、workspace Nix store、homefs、SSH 主机密钥和 TLS 材料均位于 `data/`。已创建 PostgreSQL 17 自定义格式备份：

`data/backups/db-2026-07-26T03:45:29+00:00.dump`

该备份在 IP 入口切换前创建。部署早期数据库未就绪时生成的 0 字节文件已删除。

## 为本机环境实施的修正

- 使用固定提交的 Kata、CTFd 和 Moby seccomp 构建上下文，替代不稳定的远程 Dockerfile `ADD`；下载内容带 SHA-256 校验。
- 增加宿主机下载后导入内层 Docker 的通用镜像导入脚本，并预载平台及烟雾测试镜像；正常运行启用离线模式。
- 增加持久本地 CA、CA 签发 IP 服务器证书、管理员密码轮换和 LAN 部署配置；Web/Workspace IP、独立端口、监听地址与已验证镜像标签均由 `ops/deployment.env` 固化。
- 增加无 TLS 的 LAN 健康探针、公开 CA 下载、Workspace 证书信任检测端点和 iframe 预检提示，同时保持私钥目录和私钥权限不变。
- 将 Prometheus target 文件改为临时文件加原子替换，避免重启竞争期间读取半写 JSON。
- 关闭 Grafana 插件自动更新，避免离线部署产生无意义的更新失败。
- 为 Desktop 创建正确的 X11 socket 目录，并仅限制 noVNC 进程的 OpenBLAS/OMP 线程数，避免高核数主机上 fork 时触发 guest 内存提交限制。
- 使用非递归源码 bind mount，防止嵌套 overlay2 挂载泄漏和卸载冲突。
- 向 node-exporter 暴露宿主 udev 数据库并指定稳定读取路径，保留完整磁盘设备属性采集。
- 在 CTFd/DOJO 原生模型中加入出题草稿、学习档案、attempt epoch、可信证据、Tutor、60/40 评测、六维能力、推荐、申诉和审计，并把课程删除与生成 challenge/profile/package 生命周期统一。
- 在现有 Nix workspace CLI 与 Bash profile 中加入脱敏命令证据采集；本机只对 Docker 私网开放内部 API 代理，LAN 请求明确拒绝。
- 将公开界面收敛到直接从上游源码演进的玄甲 `dojo_theme`，停用自研橙白前端、Future 域和对应 Nginx 路由；学习中心、课程分析、教师工作台和 Tutor 复用同一套组件。
- 将题目内嵌工作区的模式按钮收敛到统一 Workspace，通过可收起的左右侧栏提供课程树和 Tutor，并增加带确认、审计及新 attempt epoch 的容器/Home 完全重置。
- 为 Terminal、Code、Desktop 模式切换增加可见的加载动画、慢启动说明和失败状态；Code 直接以 `/challenge` 为唯一根目录，Terminal、Desktop 与 SSH 同样从该目录开始。
- 将 Bash 命令证据采集改为完全重定向的后台子进程，保留既有 `PROMPT_COMMAND`，避免每次回车显示 job/记录提示；Tutor 移除 L1/L2/L3 选择，统一为防泄露的苏格拉底式提示。
- 为 noVNC 注入原生键盘焦点恢复、Esc 捕获和双向剪贴板桥接脚本，并在 Workspace 全屏时使用 Keyboard Lock，避免 Vimium 等浏览器快捷键吞掉远程桌面输入。
- 将默认 Workspace profile 切换为 `full`，构建并实测玄甲的完整安全工具集合；IDA Free 固定使用 Hex-Rays 官方 8.4 安装器及校验哈希，并安装独立 128×128 高分辨率应用图标；移除不可稳定获取的 Binary Ninja Free 与其桌面残留入口。

## 二次开发能力

当前部署支持直接个性化修改代码和添加功能模块：

- 修改 `dojo_plugin/`、`dojo_theme/` 后执行 `dojo sync` 并重启相关服务；
- 修改 `dojo_theme/` 后同步并重启 CTFd；上游实验性 `frontend/` 不参与正常产品部署；
- 可在 `docker-compose.yml` 增加服务，并用 `ops/import-inner-image.sh` 导入额外镜像；
- 修改 `workspace/` 可扩展 Kata 工作区软件和 Terminal、Code、Desktop 服务，Nix 输入由 `workspace/flake.lock` 固定；
- 所有定制保存在 `local/deployment` 分支，可用普通 Git 提交、对比、回退和合并上游更新。

具体命令见 [`README.md`](./README.md) 的“二次开发”章节。

## 未启用的外部集成

本次是绑定私有 LAN 地址的单节点部署。需要外部凭据或额外基础设施的可选能力未配置，因此不在本次实机验收范围内，包括 Discord/OAuth、SMTP、Splunk profile、macOS 或远程 workspace nodes、公网 DNS 与受信任 CA 证书。这些不影响已启用的 LAN 核心平台功能；启用时应分别提供凭据或节点并追加专项测试。
