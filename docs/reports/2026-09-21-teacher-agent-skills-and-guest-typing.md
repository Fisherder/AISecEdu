# 教师 Agent 自定义技能 + 远程桌面输入兜底（2026-09-21）

## 一、浏览器插件抢按键：现象与彻底解决办法

**现象**：学生装了键盘快捷键类浏览器插件（Vimium / Surfingkeys / Shortkeys 这一类），
插件把单个字母键当成自己的快捷键，远程桌面只能收到一部分按键（截图里只打出了 `sds`）。

**为什么不能靠"页面抢回按键"解决**：插件的内容脚本和我们自己的脚本在同一个页面上下文里竞争，
谁先注册谁先拿到事件；插件种类太多，页面侧的拦截要么无效，要么会把 noVNC 自己的键盘处理一起挡掉。

**采用的方案：给远程桌面加一条完全不依赖浏览器按键的输入通道。**

- 平台新增接口 `POST /pwncollege_api/v1/workspace/type-text`（`dojo_plugin/api/v1/workspace.py`），
  只作用于当前登录学生自己的容器；
- 实现（`dojo_plugin/agent_runtime/guest_input.py`）：平台 → 容器内 → 客户机原生代理（COM2）→
  客户机内 Python 用 `VkKeyScanA + keybd_event` 把文本逐字敲进当前焦点窗口；
- 桌面工具条新增输入框「键盘被插件拦截？在此输入后发送」+「发送」按钮
  （`dojo_theme/templates/components/actionbar.html`、`dojo_theme/static/js/dojo/actionbar.js`）；
  文本框内输入不会触发插件的单键快捷键（插件默认在输入框里禁用），所以这条路径稳定可用。

实测：接口直接发送 `1234567` → 客户机控制台出现 `please input password: 1234567`；
浏览器里在工具条输入 `abc` 点击「发送」→ 客户机控制台追加 `abc`，提示"已把这段文本发送到远程桌面"。

## 二、教师 Agent 的自定义技能（Skill）

### 数据与隔离

- 新表 `teaching_agent_skills`（`dojo_plugin/models/global_agent.py`）：`user_id` 为归属账号，
  `(user_id, name)` 唯一；字段含 name / description / instructions / references / source / origin /
  enabled / version。
- 所有读写都经过 `dojo_plugin/agent_runtime/skills.py`，**每条查询都带 `user_id == 当前账号`**：
  账号 A 创建、导入、启停、删除技能，账号 B 既看不到也读不到（实测 404）。

### 三种添加方式

1. **对话里让 Agent 装**：新工具 `skill.list / read / create / update / toggle / import / delete`
   已注册进 `AGENT_TOOL_SCHEMAS` 并接入 `execute_teacher_tool`（账号级操作，不要求课程作用域），
   支持直接传 `skillMarkdown`（完整 SKILL.md）。工具调用实测全部通过，跨账号调用返回 404。
2. **自然语言草稿**（最稳）：`POST /teaching/agent-skills/draft` 把教师一句话描述交给模型，
   生成规范的 SKILL.md（front matter + 适用场景 / 执行步骤 / 质量检查 / 边界），确认后保存到本人账号。
   实测："每次给学生写实验说明时，都要先列一条可验证的完成清单，再写步骤"
   → 生成 `lab-instructions-checklist-first` 并保存成功。
3. **内置技能一键导入**：平台内置技能目录（仓库 `agent_skills/`，19 个，含 pdf、teaching-slide-deck、
   ctf-flag-challenge、cyber-lab-simulation 等）可浏览并 `import` 到本人账号；
   ctfd 容器新增只读挂载 `./agent_skills:/opt/pwn.college/agent_skills:ro` 以读取该目录。

### Agent 侧集成

- 平台把当前教师账号的技能注入 Agent 上下文（`platformFacts.accountSkills`，含 name/description/
  instructions 与"仅本账号可见"的说明），实测 Agent 能准确复述该账号的技能清单；
- 运行时的技能目录/加载逻辑（`services/agent-runtime/lib/server/agent-skills.ts`）已改造为
  "账号技能 + 内置技能"合并，并新增 `resolve` 内部接口（服务凭据校验，实测无凭据 403）；
- 由于本机**无法访问 Docker Hub**，Next.js 重新构建失败，改为对运行时编译产物做定点补丁
  （把 `skill.*` 加入工具白名单、补进工具说明），以派生镜像
  `aisecedu/agent-runtime:debate-v1-r4-skills` 部署（compose override 指向该镜像）。
  一旦恢复网络，用仓库里的 TypeScript 源码正常 `dojo compose build agent-runtime` 即可得到同样效果。

### 教师界面

`dojo_theme/static/js/dojo/teaching-skills.js`：AI 共创侧栏新增「我的技能」面板——
列出本人技能（自定义/内置标签、启停、查看方法、删除）、内置技能下拉导入、
以及"用一句话生成技能草稿 → 预览 → 保存到我的账号"的自然语言入口。

## 三、已知边界

- 对话式"把这条要求保存成技能"依赖模型主动提出工具调用；当前模型（deepseek-v4-flash）偶尔会在
  answer 里声称已保存却不给 `toolProposals`。因此把**草稿入口**做成了确定路径：教师一句话 →
  平台生成 SKILL.md → 保存，不依赖模型的工具决策。
- 文本直发通道目前只对"带原生客户机代理"的运行环境（Windows 2000/Windows 远程桌面）生效，
  Linux 终端环境会返回"当前实验环境不支持文本直发"。

## 四、验证摘要

| 项目 | 结果 |
| --- | --- |
| 技能创建/导入/更新/启停/删除（工具通道） | 全部 200，跨账号 404 |
| 账号隔离（A/B 双教师） | A 的列表/详情只含本人技能，B 为空且读不到 A 的 |
| 内部 resolve 接口 | 无服务凭据 403，带凭据返回该账号技能 |
| 自然语言草稿 | 一句话 → SKILL.md → 保存 201 |
| 面板 UI | 侧栏按钮、技能列表、内置导入、草稿预览与保存均可用 |
| 文本直发 | API 与界面两条路径都把文本送进了客户机 |
