# AISecEdu 学生题目平台

AISecEdu 是基于 [pwn.college DOJO](https://github.com/pwncollege/dojo) 代码基础演进的一体化网络安全课程与学生题目平台。平台直接扩展 `dojo_theme` 的 Jinja/Bootstrap 源码和成熟交互，不另建或仿写一套学生 UI；所有公开页面、产品文案和课程领域语言均统一为 AISecEdu。身份、权限、业务 API、页面和运行时编排由同一个 CTFd 插件进程承担，并共享一个 PostgreSQL 与同一套 Docker/Kata/Nix 实验运行时。

平台复用真实安全环境、动态答案判定、浏览器 Terminal/Code/Desktop、SSH、持久化 Home 和隔离工作区，并在同一应用内提供：

- 学生学习中心、课程进度、六维能力画像与自适应推荐；
- 与当前题目和当前 attempt epoch 绑定的统一提示式防泄露 AI Tutor；
- 教师工作台、题库检索、L1 复用 / L2 改编 / L3 原生生成和多轮修订；
- 发布前 Schema、内容、运行时、评分、Tutor 与供应链验证门；
- 自动采集的命令、运行时、Tutor、答案判定与反思证据；
- S1–S4 信任等级、敏感信息脱敏、逐事件 SHA-256 哈希链与回放；
- 客观结果 60 分、可信过程 40 分的可解释评测，以及申诉和复评；
- 教师班级分析、学生轨迹与审核日志。

即使未配置模型服务，题目设计、Tutor、评测和推荐也有确定性本地实现，可以完整运行；启用 OpenAI-compatible `/chat/completions` 后，模型只增强题目修订与 Tutor 表达，不进入动态 flag Oracle，也不会取代确定性评分。

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

主域名是唯一规范 Web 入口，并以课程 → 单元 → 题目的层级组织学习：`/dojos` 是分组课程列表，`/<course>` 展示课程简介、学习状态、单元与学生排行榜，`/<course>/<unit>` 展示资源、题目和内嵌工作区，`/workspace?service=<mode>` 是 Terminal、Code 与 Desktop 的统一完整工作区。Workspace 左侧提供可收起的课程/单元/题目导航，Workspace 与内嵌工作区右侧都提供可收起 Tutor，操作栏同时区分保留 Home 的 Restart 与彻底恢复题目原始状态的 Reset。工作区模式切换提供明确加载状态；Terminal、Code、Desktop 和 SSH 默认进入 `/challenge`，Desktop 提供完整键盘捕获和双向剪贴板同步，默认 `full` Nix profile 提供编译、调试、逆向、Web、网络和桌面安全工具。登录、注册、密码恢复、邮箱验证、用户页和管理页也全部使用同一套 AISecEdu 主题。智能学习能力通过 `/learning`、`/dojo/<course>/learning`、`/dojo/<course>/studio` 和 Tutor 侧栏提供；`future.<host>` 只做 308 兼容跳转。仓库保留的上游实验性 `frontend/` 源码未作产品定制，正常 `main` 部署不会启动它。详细设计、角色边界、评分规则、AI 配置、数据模型、API 和升级方式见 [智能学习文档](./docs/learning.md)。

## 验证

```bash
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose exec -T ctfd env PYTHONPYCACHEPREFIX=/tmp/aisecedu-pycache python -m compileall -q /opt/CTFd/CTFd/plugins/dojo_plugin
./ops/verify-local.sh
./ops/verify-learning-flow.py
```

`verify-learning-flow.py` 会创建一次性教师/学生流程，在真实 Kata 工作区内验证出题、发布、命令证据、Tutor、动态 flag、60/40 评分、六维能力、申诉和分析，再清理测试课程、用户、工作区、home、提交与生成包。

## 兼容性与来源

项目保留 `/opt/pwn.college`、`/pwncollege_api`、`pwn.college{...}` 答案凭证格式及部分服务名，用于兼容现有题库、工作区协议和运维工具；它们是同一 AISecEdu 系统的内部兼容接口，不代表第二套应用。

本项目基于 pwn.college DOJO 开发，并继续遵循仓库中的许可证与上游归属。上游背景见 [历史](./docs/history.md)，核心架构见 [架构](./docs/architecture.md)，参与开发前请阅读 [贡献指南](./CONTRIBUTING.md) 与 [开发说明](./docs/development.md)。
