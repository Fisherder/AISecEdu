# AI 共创工作台与技能机制重构

状态：2026-09-29 已部署到 `10.92.35.7:8080`，完成线上真实模型与浏览器验收。本报告记录本轮增量；此前的任务队列、取消、澄清、幂等和工具执行机制见 [Agent 交互重构报告](2026-09-14-agent-harness-research.md)。

## 研究依据

本轮直接阅读公开源码的固定提交，未将上游运行时整体引入教学平台，也未复制其产品界面或提示词。

| 上游 | 核验的源码 | 采用的机制 |
| --- | --- | --- |
| DeepSeek Harness `4878cdabd87d4041bdaff61d04c966883b9fd07a` | [Skills 设计](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/docs/subsystems/skills.md)、[技能工具](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/skill/tool-skill/src/index.ts)、[会话投影](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/docs/subsystems/conversation.md) | 多来源技能目录、名称/描述先行、按需读取正文、用户与模型分别控制调用权限、技能资源按需读取、聊天与执行轨迹从同一事实投影。 |
| Codex `c248f6d48b97eb4a2aa56147a0b11b7d763278b9` | [技能选择](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/skills/src/selection.rs)、[技能变更监听](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/app-server/src/skills_watcher.rs)、[执行项目协议](https://github.com/openai/codex/blob/c248f6d48b97eb4a2aa56147a0b11b7d763278b9/codex-rs/protocol/src/items.rs) | 显式技能引用、目录变化后重新读取、分类型的模型/工具/步骤记录、用户可切换的执行过程视图。 |

## 已落地的行为

### 技能

- 账号私有技能与文件技能合并为一个目录；同名时账号技能优先，文件根按配置顺序发现。支持 `<name>/SKILL.md` 和 `<name>.md`，并可从 `.dsh/skills`、`.agents/skills`、现有内置目录读取。
- 目录只向模型提供名称和简介。规划选中或用户输入 `/技能名` 后才载入正文；执行模型还可调用 `skill({name})`，随后用 `skill_resource({name,path})` 读取该技能明确引用的文件。账号技能的参考资料也只先列出路径，正文按需读取，不再在加载技能时整份附上。
- 文件技能与账号私有技能都独立保存“模型可调用”“用户可调用”策略。`SKILL.md` 使用 `disable-model-invocation` 和 `user-invocable`；账号技能也可通过同名 Markdown 元数据或管理接口的 `modelInvocable`、`userInvocable` 设置。旧账号技能经增量迁移默认两者均允许。模型目录、用户选择器和加载时均检查对应权限；模型专用技能与用户显式选中的用户专用技能均可读取自己的参考文件。文件资源路径限制在技能目录内，阻止 `..` 与符号链接越界，并限制单文件体积。
- 文件技能在每次读取时重新扫描和读取，正文改动无需重启服务。目录发现失败时保留上次完整的内置目录；账号技能通过受服务令牌保护的内部接口按任务顶层可信 `scope.ownerId` 读取，避免把教师身份误读为请求内容中的字段。
- 把现有账号技能表重新接入教学接口：教师可列出、读取、创建、更新、停用/启用、导入和删除自己的技能；AI 共创的 `skill.*` 工具提案走同一套权限、幂等、审计和会话记录。账号技能变更会反映到下一次技能目录读取。

### 工作台

- AI 共创采用更清晰的会话侧栏、主对话区与任务抽屉；聊天和执行轨迹可以切换查看，轨迹复用服务端已有的模型、工具、步骤和状态事件。
- 输入区支持技能搜索选择、`/` 补全和键盘操作；发送后的回复标示使用过的技能，用户可从同一处展开执行过程。
- 技能列表有窗口内滚动边界，桌面与窄屏均不溢出。新建对话立即清空上一对话的待处理附件引用，避免把旧材料带入下一轮请求。
- 原有课程、权限、产物版本、任务恢复和三方案选择流程继续使用平台现存事实来源。

## 关键实现位置

| 模块 | 路径 |
| --- | --- |
| 技能发现、策略和安全读取 | `services/agent-runtime/lib/server/agent-skills.ts` |
| 模型可调用的技能工具 | `services/agent-runtime/lib/server/agent-skill-tools.ts` |
| 规划、执行与技能装配 | `services/agent-runtime/app/api/integration/jobs/execute/route.ts`、`lib/server/agent-harness/teacher-prompts.ts` |
| 账号技能管理、解析、持久化与教师技能目录接口 | `dojo_plugin/api/v1/teaching.py`、`dojo_plugin/agent_runtime/skills.py`、`dojo_plugin/models/global_agent.py`、`dojo_plugin/__init__.py`、`services/agent-runtime/app/api/integration/skills/route.ts` |
| 工作台视图与交互 | `dojo_theme/templates/teacher_agent.html`、`static/js/dojo/teaching-agent.js`、`static/css/teaching-agent-workbench.css` |

## 验收记录

1. 技能与教师代理 Vitest 45 项通过；另有一项集成回归测试验证账号 ID 从任务顶层可信 `scope` 进入技能加载器。测试覆盖目录增量发现、正文重新读取、文件与账号技能的双重调用策略、账号技能覆盖、模型工具载入、账号参考资料按需读取及越界拦截。Python 语法检查、浏览器 JavaScript 语法检查与差异空白检查通过。
2. 使用线上完整服务源码构建生产 Next 镜像成功；最终镜像 `aisecedu/agent-runtime:ai-coauthor-dsh-20260929-v8`（`sha256:3d07f9482a31876e6bf40db8c5b72cb90cbed5ddfbaa818a41f51bb3e73b8da0`）。隔离容器下带 `/agent-runtime` 前缀的健康接口和受服务令牌保护的技能目录均返回 200，目录有 19 项且 `complete=true`。正式容器健康，教师接口也返回 19 项。
3. 真实浏览器检查 1440 像素桌面和 390 像素窄屏；技能选择、轨迹切换可用，无页面水平溢出及严重控制台错误。新建对话后的实际发送体 `sourceRefs=[]`，确认不会继承前一对话的附件。
4. 真实模型以 `/assessment-validity-checker` 执行两次非写入请求：任务状态 `SUCCEEDED`，回答按技能给出测验效度检查资料与步骤，持久回复记录 `selectedSkills=['assessment-validity-checker']`，轨迹显示规划、技能载入和模型执行。第二次在带正确服务路径前缀的 v4 上执行，页面无控制台错误；验收用对话随后通过平台删除接口清理。
5. 线上使用临时技能验证了账号管理接口的创建、读取、更新、停用、启用、删除，以及前端目录随启停变化；`skill.create/read/update/toggle/list/delete` 经 AI 工具执行接口也均返回完成并写入审计。另验证内置技能导入。所有临时技能和对话均已删除。
6. 线上增量迁移为既有账号技能填充双重调用策略，旧记录均保留默认可调用。创建“仅用户可调用”技能并通过 AI 工具将其改成“仅模型可调用”后，数据库、账号管理接口和内部解析结果一致；非法布尔值返回 400。v6 隔离镜像的用户技能目录仅列出可手动调用的临时技能，排除了同账号的模型专用临时技能。临时数据已清理。
7. v8 上再以临时“仅用户可调用”的账号技能进行真实模型只读验收：提示要求先用 `skill_resource` 读取 `references/proof.md`，资料内只存放校验短语。任务 `SUCCEEDED`，持久回复记录 `selectedSkills=['qa-v8-resource']`，最终回答准确包含资料中的“苍穹九号”。临时技能和对话均通过平台接口删除。此前同一测试在 v7 暴露出账号 ID 取自错误字段，导致技能未加载；修正后通过，且补入自动化回归测试。

## 边界与运维

这里对齐的是可迁移的技能语义与交互契约，不是把 DSH/Codex 的通用编码代理原封不动搬入教学平台：平台依旧使用教学工具、课程权限、受控文件交付和既有任务队列；没有暴露通用 shell、任意文件系统或上游插件进程给教师。文件技能通过请求时重新发现，而不是复制 DSH 的文件监听器及其作用域注册表；账号私有技能持久化在现有教学数据库。此差异不会影响本次验收的目录更新和按需载入，但“底层完全相同”不能据此成立。

线上切换前保留了原始服务文件与编排配置：`/srv/aisecedu-dojo/data/ai-coauthor-dsh-20260929/source-before/`。另存了 `docker-compose.override.v2.yml`、`docker-compose.override.v4.yml`、`docker-compose.override.v5.yml`、`docker-compose.override.v6.yml`、`docker-compose.override.v7.yml`、技能管理修正前的 `teaching.before-skill-crud.py` 和 v6 调用策略迁移前的文件快照；对应镜像也保留。后续调整应在当前线上源码之上继续，因为本地历史工作树与线上已有功能并非同一基线。
