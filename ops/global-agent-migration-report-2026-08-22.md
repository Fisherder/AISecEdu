# 玄甲单一全局智能体迁移报告（2026-08-22）

## 结论

玄甲的教师智能体已统一为 `/teacher` 中的单一全局智能体。原 OpenMAIC 能力只保留为 `services/agent-runtime` 内部渲染与互动执行引擎，不再拥有产品入口、品牌、登录、课程权威、独立 Compose、专属 Skill 或重复工作流。

## 产品与数据边界

- 教师原始自然语言直接进入模型规划—技能—工具—观察循环，不经过关键词意图分类器。
- 同一智能体可直接分析、操作课程、生成/修改教学内容、创建 CTF、组织课堂、分析学情并交付文件。
- 课程和章节是可选操作对象，不是智能体入口或强制识别结果；内部标识由平台生成并隐藏。
- 身份、课程、对话、任务、文件、审批、发布、成绩和学习证据只存于玄甲权威数据层。
- `agent-runtime` 只接受内部服务凭据或短时范围票据；非集成模式除健康检查外返回 404。
- `/agent-runtime` 根路径和 `/openmaic*` 历史路径只回到 `/teacher`。
- 旧 `openmaic_launch_tickets` 表先受限快照后移除，新表为 `global_agent_launch_tickets`。

## 智能体与技能

- 规划器完整保留教师请求、组合要求、指代和交付方式，不输出固定意图标签或机械置信度。
- 执行器在有界循环中消费服务端验证观察，避免重复工具和“计划即完成”的假声明。
- 分析类请求直接返回结论；真实文件请求返回带鉴权下载地址的 DOCX、Markdown、TXT、JSON、CSV、HTML 或 Notebook。
- 全局技能只安装在 `agent_skills/`，生产只读挂载给同一个智能体；规划阶段看元数据，执行阶段按需载入完整说明。
- 当前共有 19 个技能，其中 12 个为带许可证与 commit 固定的外部技能，7 个为玄甲专用技能；已移除 vendored runtime 中面向独立 OpenMAIC 部署的旧 Skill。

## CTF 与 HYBRID 题目契约

- 所有实践题最终都从授权环境取得并提交动态 Flag；不接受 JSON 报告、明文、密钥、布尔值或结论代替 Flag。
- 学生可见 starter file 不得硬编码正确答案，也不得嵌入、生成或返回 Flag；只有平台 `/challenge/check` 可在实时门禁通过后签发 Flag。
- 自定义题通过运行服务、文件完整性、原始进程和实时响应绑定进行确定性验证。
- HYBRID 题先完成可回放过程目标，再进入实时 Flag Gate；模型场景与题目语义不匹配时，平台生成与当前任务绑定且确定可达的过程看板。
- `runtimeContract` 服务由平台自动启动；题面和私有解法中的重复启动指令会被同步为可用性检查，避免端口冲突。
- 生成、红队、修复、独立复验和发布门均 fail-closed；开放的中高风险 finding 会阻止发布。

## UI 收口

- 移除对话侧栏中的课程/章节识别卡片及相关强制绑定提示。
- 移除“任务与知识测评”重复工作流，实践题、模拟演示和课件各自使用直接入口。
- 题目标识、章节标识等内部字段自动生成，不再要求教师填写。
- 任务卡只保留一套动态、阶段化进度；任务抽屉不再显示“其他任务”和重复课程入口。
- 移除机械副标题、内部策略等级和供应方术语；结果卡点击后直接承载完整出题工作台。
- 内容管理、课程中心、智能体、出题、课件、模拟和学情统一使用玄甲产品外壳与组件风格。

## 上游来源

互动课堂与渲染器源自 MIT 许可的 OpenMAIC。`@openmaic/*` 包名、许可证和上游归属仅作为供应链兼容事实保留，不构成产品身份。现行说明是 `docs/global-agent-architecture.md` 与 `docs/global-agent-operations.md`，上游原始说明只保存在明确标注的 `UPSTREAM-README.md` 归档中。

## 验证记录

以下结果均在 2026-08-22 对当前生产部署执行；临时账号、课程、任务和启动票据已在复验后清理为零。

| 验证层 | 命令或检查 | 最终结果 |
| --- | --- | --- |
| 原始指令、技能、工具观察、文件闭环与浏览器下载 | `python3 ops/verify-teacher-agent-intelligence.py` | 原始复合请求直接到达模型；正确选择材料分析、教案与文件交付能力；分析 PDF 后返回受鉴权 DOCX；模型消费服务端工具观察后继续原任务；浏览器只显示一个可下载结果卡；全部通过 |
| 课程、作业、平台内容与课堂全流程 | `python3 ops/verify-teacher-agent-flow.py --job-timeout 900 --authoring-timeout 2400 --post-authoring-regression` | 69/69 通过；覆盖课程、章节、成员、学情、知识测试、成绩复核、课件、攻防演示、引擎模拟、版本修订、发布、课堂生命周期与辩论 |
| 原生 CTF、仿真与配套课件 | `python3 ops/verify-teacher-agent-flow.py --job-timeout 900 --authoring-timeout 2400 --simulation-courseware-regression` | 20/20 通过；动态 Flag、原生可发布 CTF、引擎仿真、课件物化和预览全部通过 |
| 教师/学生产品 UI | `python3 ops/verify-teacher-agent-ui.py` | 唯一教师入口、对话管理、四套主题、移动端、全局搜索、统一内容管理、学生任务与嵌入式运行环境全部通过；完成任务只保留单一结果卡 |
| 卡片内完整出题工作台 | `python3 ops/verify-teacher-manual-create-ui.py` | 13 项浏览器检查全部通过；课程、章节和题目标识隐藏并自动生成，校验可恢复，CTF 草稿可检查、发布并返回精确去向 |
| 运行时全量单元/集成测试 | `vitest run` | 389 个文件：386 通过、3 跳过；3597 项测试：3592 通过、5 跳过 |
| 文件存储与下载鉴权 | `python3 -m pytest -q test/test_agent_files.py` | 8/8 通过 |
| TypeScript / ESLint / Prettier | `tsc --noEmit`、`eslint .`、关键改动文件 `prettier --check` | 类型检查通过；ESLint 0 错误、20 个既有警告；格式检查通过 |
| Python / JSON / Shell / 浏览器脚本 / 补丁 | `compileall`、`json.tool`、`bash -n`、`node --check`、`git diff --check` | 全部通过 |
| 生产总体验收 | `bash ops/verify-local.sh` | 服务、健康、数据库、Redis、队列、监控、HTTPS/TLS、工作区、Kata 隔离、统一路由和出题安全门禁全部通过 |
| Compose | 生产容器内 `dojo compose config --quiet`；退役运行时 Compose `config --quiet` | 主部署可解析；独立运行时 Compose 不再定义服务 |

生产中的内部服务名为 `agent-runtime`，镜像摘要为
`sha256:2155d4ca1bb33c01748d7b58f76ebdbe345128c3fe4fb9c6867ff2d3739889ee`，健康状态为 `healthy`。内部容器列表不存在名为 OpenMAIC 的服务；可选旧前端未运行。

路由与数据审计结果：

- `/openmaic`、`/openmaic/*` 和 `/agent-runtime` 根路径均以 `308` 重定向到 `/teacher`；`/agent-runtime/api/health` 为同源内部健康探针。
- 数据库只存在 `global_agent_launch_tickets`，不存在 `openmaic_launch_tickets`。
- `agent-e2e-*` 验收账号、课程、任务及启动票据计数均为 `0`。
- 根目录 `agent_skills/` 恰有 19 个技能；不存在第二套 OpenMAIC 技能目录。
- 产品 UI 不显示 OpenMAIC、Dojo、Studio、内部策略名或供应商流水线术语。源码中保留的旧名称仅用于一次性迁移读取、退役路由断言以及许可证和上游包兼容。

最终状态：代码、UI、路由、部署、数据、文档、技能与真实端到端行为均已迁移到同一个玄甲全局智能体；没有待完成的独立 OpenMAIC 产品工作流。
