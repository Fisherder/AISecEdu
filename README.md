# 玄甲全局智能体教学平台

玄甲是基于 [pwn.college DOJO](https://github.com/pwncollege/dojo) 代码基础演进的一体化网络安全课程与学生题目平台。平台直接扩展 `dojo_theme` 的 Jinja/Bootstrap 源码和成熟交互，不另建或仿写一套学生 UI；所有公开页面、产品文案和课程领域语言均统一为玄甲。身份、权限、业务 API、页面和运行时编排由同一个 CTFd 插件进程承担，并共享一个 PostgreSQL 与同一套 Docker/Kata/Nix 实验运行时。

平台复用真实安全环境、动态答案判定、浏览器 Terminal/Code/Desktop、SSH、持久化 Home 和隔离工作区，并在同一应用内提供：

- 学生学习中心、课程进度、六维能力画像与自适应推荐；
- 与教师工作台统一的学生 Guide，结合真实课程、attempt、评分、能力和推荐提供持续的个性化学习对话，同时保持学生数据与工具边界；
- 与当前题目/epoch 绑定、能读取完整基线、实时容器、私有标准解法和过程证据的统一防泄露 AI Tutor；
- 统一的角色化智能体工作台：教师入口保留原始自然语言并自主选择技能与工具，学生入口复用同一会话、任务和结果体验，但只开放本人学习范围内的安全能力；
- 由全局智能体统一调用的题库检索、动态 Flag CTF 出题，以及持续“验证—修复—复验”直至通过的内部质量流水线；
- 发布前 Schema、内容、受限运行合约、绑定真实服务响应与文件/进程完整性的私有声明式 Oracle、评分、Tutor 与供应链验证门；
- 自动采集的命令、运行时、Tutor、答案判定与反思证据；
- S1–S4 信任等级、敏感信息脱敏、逐事件 SHA-256 哈希链与回放；
- 客观结果 60 分、可信过程 40 分的可解释评测，以及申诉和复评；
- 教师班级分析、学生轨迹与审核日志。

配置 DeepSeek API key 后，教师请求先由全局智能体直接理解和规划；系统不会先把请求压缩成“课件生成”等固定意图。智能体可从仓库内、带来源和许可证的技能目录中按需选择方法，并通过有界“模型—工具—服务端观察”循环继续处理原始目标。分析类请求直接返回分析，文件请求生成带鉴权下载地址的真实 DOCX、Markdown、CSV、HTML、JSON 或 Notebook，只有需要平台原生交互内容时才创建内容产物。课程和章节只是权限内可操作对象，不是对话的固定容器。

Guide、Tutor、一般规划与方案使用 `deepseek-v4-flash`；复杂规格构建、红队、修复、最终验证、旧题私有解法和过程评分使用 `deepseek-v4-pro`。CTF 内部流水线仍可自动决定 L1 复用、L2 改编或 L3 新建，但它只是全局智能体的一项受控工具。L1/L2 保留源题原生文件、`.init`、checker/flag 和运行镜像，不叠加第二套提交协议；L3 生成自包含产物与私有声明式 Flag Gate。学生完成目标后统一取得并提交动态 Flag，不以 `solution.json` 报告作为完成条件。任何开放的中高风险 finding 或确定性门禁失败都会阻止发布。

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
| Web 产品界面 | 直接从上游源码演进的玄甲 `dojo_theme/` Jinja/Bootstrap 主题 |
| 数据 | CTFd 与学习域共用一个 PostgreSQL |
| 实验运行时 | Docker/Kata 工作区与 Nix 工具层 |
| 工作区入口 | 同一题目环境的 Terminal、Code、Desktop 与 SSH |
| 智能学习域 | `dojo_plugin/learning/`、`/pwncollege_api/v1/learning` |
| 全局智能体与可信工具网关 | `dojo_plugin/api/v1/teaching.py`、`dojo_plugin/agent_runtime/`、`agent_skills/` |
| 私有生成与课堂能力运行时 | `services/agent-runtime/`；无独立产品入口、账号或课程权威 |
| 本机部署与验收 | `ops/` |

## 快速开始

部署依赖 Linux、Docker、KVM/Kata 所需的虚拟化能力和足够的磁盘空间。仓库内的锁文件、固定上游提交和统一命令保证同一提交可以在另一台主机重新构建；数据库、课程数据、密钥、测试录像与本机地址不会进入 Git 或构建上下文。

```bash
git clone git@github.com:Fisherder/AISecEdu.git xuanjia
cd xuanjia
cp ops/deployment.env.example ops/deployment.env
${EDITOR:-vi} ops/deployment.env
make doctor
make deploy
make verify
```

`make help` 会列出审计、构建、启动、验收、测试和可复现打包入口。完整的仓库边界与发布流程见 [仓库、部署与发布约定](./docs/repository-release.md)，生产配置和迁移见 [全局智能体运维说明](./docs/global-agent-operations.md)，主机与 Workspace 运维见 [本机部署文档](./ops/README.md)。

平台以课程 → 单元 → 题目的层级组织学习：`/dojos` 是分组课程列表，`/<course>` 展示课程简介、学习状态、单元与学生排行榜，`/<course>/<unit>` 展示资源、题目和内嵌工作区，`/workspace?service=<mode>` 是 Terminal、Code 与 Desktop 的统一完整工作区。Workspace 与主站保持 origin 和会话隔离，左侧提供课程导航，右侧提供 Tutor；Restart 保留 Home，Reset 恢复题目原始状态。Terminal、Code、Desktop 和 SSH 默认进入 `/challenge`，默认 `full` Nix profile 提供编译、调试、逆向、Web、网络和桌面安全工具。登录、注册、密码恢复、邮箱验证、用户页和管理页全部使用同一套玄甲主题。智能学习能力通过 `/guide`、`/learning`、`/dojo/<course>/learning`、课程工作台和 Tutor 侧栏提供。仓库保留的上游实验性 `frontend/` 源码不承载玄甲产品页面，正常部署不会启动它。详细设计、角色边界、评分规则、AI 配置、数据模型、API 和升级方式见 [智能学习文档](./docs/learning.md)。

## 验证

```bash
make check
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose exec -T ctfd env PYTHONPYCACHEPREFIX=/tmp/aisecedu-pycache python -m compileall -q /opt/CTFd/CTFd/plugins/dojo_plugin
make verify
./ops/verify-container-context-real.py
./ops/verify-source-authoring-real.py
./ops/verify-learning-flow.py
```

`verify-container-context-real.py` 使用一次性原生题和 Kata 工作区验证 Tutor/Grader 能安全读取独立挂载在 `/challenge` 下的实时文件；`verify-source-authoring-real.py` 使用部署密钥真实验证 L1/L2 的 Flash 方案、Pro 构建/审查、原生源题快照，以及 Flash Tutor 对基线、实时工作区、过程证据和固定包版本的联合使用；`verify-learning-flow.py` 会创建一次性教师/学生流程，在真实 Kata 工作区内验证出题、红队修复、绑定实时服务/文件/进程的私有 Flag Gate、Guide、Tutor、命令证据、Pro 60/40 评分、六维能力、申诉和分析。三个脚本都会清理各自创建的临时课程、用户、工作区、Home 与生成数据。

## 兼容性与来源

项目保留 `/opt/pwn.college`、`/pwncollege_api`、`pwn.college{...}` 答案凭证格式及部分服务名，用于兼容现有题库、工作区协议和运维工具；它们是同一玄甲系统的内部兼容接口，不代表第二套应用。

本项目基于 pwn.college DOJO 开发，并继续遵循仓库中的许可证与上游归属。上游背景见 [历史](./docs/history.md)，核心架构见 [架构](./docs/architecture.md)，参与开发前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发说明](./docs/development.md)。
