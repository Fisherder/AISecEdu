# AISecEdu 学生题目平台

AISecEdu 是基于 [pwn.college DOJO](https://github.com/pwncollege/dojo) 代码基础演进的一体化网络安全课程与学生题目平台。平台直接扩展 `dojo_theme` 的 Jinja/Bootstrap 源码和成熟交互，不另建或仿写一套学生 UI；所有公开页面、产品文案和课程领域语言均统一为 AISecEdu。身份、权限、业务 API、页面和运行时编排由同一个 CTFd 插件进程承担，并共享一个 PostgreSQL 与同一套 Docker/Kata/Nix 实验运行时。

平台复用真实安全环境、动态答案判定、浏览器 Terminal/Code/Desktop、SSH、持久化 Home 和隔离工作区，并在同一应用内提供：

- 学生学习中心、课程进度、六维能力画像与自适应推荐；
- ChatGPT 式 Guide，结合真实课程、attempt、评分、能力和推荐提供持续的个性化学习对话；
- 与当前题目/epoch 绑定、能读取完整基线、实时容器、私有标准解法和过程证据的统一防泄露 AI Tutor；
- 教师工作台、题库检索、Agent 自动选策，以及持续“验证—修复—复验”直至通过的可观察多 Agent 出题流水线；
- 发布前 Schema、内容、受限运行合约、绑定真实服务响应与文件/进程完整性的私有声明式 Oracle、评分、Tutor 与供应链验证门；
- 自动采集的命令、运行时、Tutor、答案判定与反思证据；
- S1–S4 信任等级、敏感信息脱敏、逐事件 SHA-256 哈希链与回放；
- 客观结果 60 分、可信过程 40 分的可解释评测，以及申诉和复评；
- 教师班级分析、学生轨迹与审核日志。

配置 DeepSeek API key 后，Guide、Tutor、出题策略与方案 Agent 使用 `deepseek-v4-flash`；第二层规格/产物构建与第三层红队、最小闭环恢复、精确修复、一致性重建、最终验证，以及旧题私有解法和过程评分使用 `deepseek-v4-pro`。教师只描述目标，策略 Agent 会结合题库候选自动决定 L1 复用、L2 改编或 L3 新建；只有教师在自然语言要求中明确指定时才覆盖该决策。草稿生成和教师主动修订都会在后台自动执行独立验证、修复和重新验证，并以逐轮进度展示阻断、修复周期和收敛结果。L1/L2 由 Pro 构建或调整公开教学规格，但发布器只快照源题并保留其原生文件、`.init`、checker/flag 和运行镜像，不允许模型叠加另一套 `solution.json` 协议；L3 才由 Pro 生成自包含产物与私有声明式 Oracle。全部调用走 DeepSeek 官方 OpenAI-compatible `/chat/completions`。公开生成 Agent 不接触动态 flag 或验证值；受信任的 Tutor/Grader/验证 Agent 只在服务端私有上下文中读取标准解法和验证合约，全部学生可见文本再次经过脱敏与防泄露检查。自定义 Web 题的客观 Oracle 会独立探测平台已启动的原始服务、校验强响应证据、starter file 哈希和 root 进程记录；确定性诊断作为可追踪 finding 直接驱动 Pro 修复。Oracle 锁定客观 60 分，模型只能在固定 rubric 内评过程 40 分；任何开放的中高风险 finding 或确定性门禁失败都会阻止发布。

## 领域对应关系

| 平台概念 | 兼容模型 | 含义 |
| --- | --- | --- |
| 课程 | `Dojos` / `dojo` | 学生加入、教师授课和进度汇总的课程聚合 |
| 教学单元 | `DojoModules` / `module` | 课程内有序组织的教学内容与题目集合 |
| 题库发布项 | `DojoChallenges` / `DojoChallenge` | 一道 CTFd `Challenge` 发布到课程单元后的稳定关系 |
| 作答结果 | CTFd `Submissions` / `Solves` | 每次提交及首次正确完成的事实记录 |

兼容 URL 和内部代码仍保留 `dojo`、`module` 等名称，产品界面统一使用上述课程领域语言。

## 目录与技术栈

| 领域 | 唯一实现 |
| --- | --- |
| 身份、课程、API、权限 | `dojo_plugin/` 中的 CTFd Flask 插件 |
| Web 产品界面 | 直接从上游源码演进的 AISecEdu `dojo_theme/` Jinja/Bootstrap 主题 |
| 数据 | CTFd 与学习域共用一个 PostgreSQL |
| 实验运行时 | Docker/Kata 工作区与 Nix 工具层 |
| 工作区入口 | 同一题目环境的 Terminal、Code、Desktop 与 SSH |
| 智能学习域 | `dojo_plugin/learning/`、`/pwncollege_api/v1/learning` |
| 本机部署与验收 | `ops/` |

## 快速开始

部署依赖 Linux、Docker、KVM/Kata 所需的虚拟化能力和足够的磁盘空间。上游通用部署方法见 [部署文档](./docs/deployment.md)，当前仓库的本机部署与运维方法见 [ops/README.md](./ops/README.md)。已有本机实例可执行：

```bash
docker start pwncollege-dojo
./ops/verify-local.sh
./ops/verify-learning-flow.py
```

当前本机部署以 `https://192.168.3.111` 作为唯一 Web 入口，并以课程 → 单元 → 题目的层级组织学习：`/dojos` 是分组课程列表，`/<course>` 展示课程简介、学习状态、单元与学生排行榜，`/<course>/<unit>` 展示资源、题目和内嵌工作区，`/workspace?service=<mode>` 是 Terminal、Code 与 Desktop 的统一完整工作区。浏览器 Workspace 代理直接使用同一 IP 的独立 `4443` 端口，不依赖域名或 DNS，同时保留与主站的 origin 和会话隔离。Workspace 左侧提供可收起的课程/单元/题目导航，Workspace 与内嵌工作区右侧都提供可收起 Tutor，操作栏同时区分保留 Home 的 Restart 与彻底恢复题目原始状态的 Reset。工作区模式切换提供明确加载状态；Terminal、Code、Desktop 和 SSH 默认进入 `/challenge`，Desktop 提供完整键盘捕获和双向剪贴板同步，默认 `full` Nix profile 提供编译、调试、逆向、Web、网络和桌面安全工具。登录、注册、密码恢复、邮箱验证、用户页和管理页也全部使用同一套 AISecEdu 主题。智能学习能力通过 ChatGPT 式 `/guide`、`/learning`、`/dojo/<course>/learning`、`/dojo/<course>/studio` 和 Tutor 侧栏提供。仓库保留的上游实验性 `frontend/` 源码未作产品定制，正常 `main` 部署不会启动它。详细设计、角色边界、评分规则、AI 配置、数据模型、API 和升级方式见 [智能学习文档](./docs/learning.md)。

## 验证

```bash
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose exec -T ctfd env PYTHONPYCACHEPREFIX=/tmp/aisecedu-pycache python -m compileall -q /opt/CTFd/CTFd/plugins/dojo_plugin
./ops/verify-local.sh
./ops/verify-container-context-real.py
./ops/verify-source-authoring-real.py
./ops/verify-learning-flow.py
```

`verify-container-context-real.py` 使用一次性原生题和 Kata 工作区验证 Tutor/Grader 能安全读取独立挂载在 `/challenge` 下的实时文件；`verify-source-authoring-real.py` 使用部署密钥真实验证 L1/L2 的 Flash 方案、Pro 构建/审查、原生源题快照，以及 Flash Tutor 对基线、实时工作区、过程证据和固定包版本的联合使用；`verify-learning-flow.py` 会创建一次性教师/学生流程，在真实 Kata 工作区内验证出题、红队修复、绑定实时服务/文件/进程的私有报告 Oracle、Guide、Tutor、命令证据、Pro 60/40 评分、六维能力、申诉和分析。三个脚本都会清理各自创建的临时课程、用户、工作区、Home 与生成数据。

## 兼容性与来源

项目保留 `/opt/pwn.college`、`/pwncollege_api`、`pwn.college{...}` 答案凭证格式及部分服务名，用于兼容现有题库、工作区协议和运维工具；它们是同一 AISecEdu 系统的内部兼容接口，不代表第二套应用。

本项目基于 pwn.college DOJO 开发，并继续遵循仓库中的许可证与上游归属。上游背景见 [历史](./docs/history.md)，核心架构见 [架构](./docs/architecture.md)，参与开发前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发说明](./docs/development.md)。
