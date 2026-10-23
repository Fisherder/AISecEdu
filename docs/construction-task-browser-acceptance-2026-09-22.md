# 建设任务全流程真实浏览器验收报告

日期：2026-09-22
范围：教师账号创建 → 建设任务领取 → 内容生成 → 提交固定版本 → 独立复核 → 终审 → 验收入库 → 素材采用
方式：真实 Chrome（Chrome for Testing 153，CDP 直连），全部操作通过页面真实点击、真实表单、真实会话完成

## 一、结论

建设任务（`/teacher/construction`）的「领取 → 生成 → 提交 → 复核 → 终审 → 入库 → 采用」全链路
在真实浏览器中可完整走通：**课件（slides）与实践题（practice）两类任务均已入库**，
并额外验证了退回返修闭环与 6 项独立性约束。验收过程中发现并修复了 2 个阻断级缺陷，
另确认 1 处保护行为符合设计。**明暗两种主题 × 12 个页面现在均为 0 个低对比元素。**此后又解决了一个影响整批教师的问题（缺陷 3，任务不再限定产物类型）、
一个全站可读性问题（缺陷 4，深色主题写死浅色）和一个提交负担问题（缺陷 5）。

| 缺陷 | 影响 | 状态 |
| --- | --- | --- |
| 创作入口深度链接把整份任务说明塞进查询串，超过 nginx 请求行上限 4094 字节 | 任务中心的「开始 / 继续创作」对任何真实任务都打不开（400 Bad Request） | 已修复 |
| 固定版本审核副本作为「可选课程 / 可选来源」出现在素材库 | 教师选中后必然 409，无法完成素材采用 | 已修复 |
| 任务用产物类型卡住提交 | 教师做完内容却提交不了；该批次 16 个测验任务全部命中 | 已改为任务接受任意类型 |
| 深色主题下组件样式写死浅色 | 对话框深字压深底、输入框刺眼，教师无法阅读；全站 251 个低对比元素 | 已修复并加双重守卫 |
| 提交任务强制填写大量说明 | 教师每次提交都要写五段文字并勾选清单 | 已改为可选 |

## 二、被测系统与账号

- 站点：`http://10.92.35.7:8080`
- 建设批次：`建设任务端到端验收批次`（`build_fc55cbdb08c14b1a98d02603166cfae0`）
- 课程：`CN-BASE 计算机网络基础`，含 CH01/CH02 两个章节、3 条学习目标、2 份资料登记
- 任务：`CN-BASE-CH01-01`（课件 slides）、`CN-BASE-CH01-02`（实践题 practice）

四个教师账号全部通过 `/register` 页面的真实注册表单创建（角色选择「我是教师」），
注册后各自通过「新建课程」向导获得教师创作空间：

| 账号 | 角色 | 姓名 | 创作空间 |
| --- | --- | --- | --- |
| `build-lead` | coordinator 统筹 | 建设统筹·李老师 | 计算机网络基础 |
| `build-author` | author 创作与互审 | 课件创作·王老师 | 网络课程创作空间 |
| `build-peer` | reviewer 课程终审 | 同行复核·赵老师 | 网络课程互审空间 |
| `build-final` | reviewer 课程终审 | 课程终审·陈老师 | 网络课程终审空间 |

四个账号均须先在任务中心完成「激活我的账号」才能领取任务，
与 `member.activated` 的准入约束一致。

## 三、验证结果

### 1. 账号与准入

| 检查项 | 结果 |
| --- | --- |
| 4 个教师账号可在真实浏览器注册 | 通过 |
| 注册后可创建教师课程并成为课程管理员 | 通过 |
| 建设任务中心显示批次与 4 位成员 | 通过 |
| 未激活账号不能领取任务 | 通过 |

### 2. 领取任务

在「任务大厅」打开 `CN-BASE-CH01-02`，点击「领取任务」，
状态由 `可领取` 变为 `创作中`，主责人记为 `build-author`，写入 `task.claim` 审计事件。

### 3. 生成内容

**(a) 教师手动创作实践题（真实 UI）** — 通过

在教师创作空间用「手动创建 → 实践题」表单填写题面、学习目标、评分依据、教师解法与期望答案，
选择「仅保存草稿」保存。草稿随即出现在任务中心「提交成果」对话框的
「选择本人创作空间内的原项目」下拉中（1 个项目）。

**(b) AI 共创课件（真实 UI）** — 通过

修复缺陷 1 之后，「开始 / 继续创作」在真实浏览器中可正常打开 AI 共创页：

- 深度链接 132 字符
- 任务说明自动带入输入框（实测 790 字符）
- 产物类型自动设为 `slide-deck`
- 创作空间自动切到该教师的课程（`-1626626700`）

补传真实讲义并在课程规划中同步登记资料位置后，AI 依次完成：
读取资料 → 核实来源 → 给出三套生成方案 → 选择「方案一」→ 生成课件。
`teaching_artifacts` 中创建了课件作品并最终达到 `READY`：

```
artifact_7072a8b622ab47deb14856c47300760d
网络分层模型核心概念（概念—证据—应用六页课件）
owner_id=7226  dojo_id=-1626626700  artifact_type=slide-deck  status=READY  revision=2
```

该作品随后作为课件任务的交付物走完提交、复核、终审、入库（见下）。

> 过程中有一次失败：首次生成时未限制篇幅，课件在第 3、8 页触发
> `courseware-inspector` 的版面门禁
> （`Independent layout regions 0 and 1 overlap`、
> `page-title does not fit at readable size`、
> `text needs 392×46px but region is 388×55px`），
> 多次自动修复后 `artifact.materialize` 仍失败。
> 教师按常规做法在对话中追加「控制在 6 页、每页只放一个标题区与一到两个正文区块」
> 的排版要求后重新生成即通过。这属于课件版面质量门禁与提示词约束问题，
> 不属于建设任务流程缺陷，但说明**长课件默认生成存在版面不合格风险**，
> 值得在课件生成子系统中单独跟进。

### 4. 提交固定版本

课件（4 项自测）与实践题（5 项自测）两类任务都走完了本环节。

在任务详情点击「提交成果」，选择原项目，逐项填写资料引用、测试证据、参考答案与评分依据、
运行环境、修订说明，并勾选该产物类型的全部自测项。提交后：

- 任务状态 `创作中 → 待复核`
- 生成第 1 次提交写入 `construction_submissions`
- 同时创建固定版本审核副本 `审核 · CN-BASE-CH01-02 · v1` 并记录内容指纹
  （`construction_spaces.fingerprint`），供后续「副本未变化」校验

### 5. 独立复核与终审

复核人 `build-peer` 在「我的审核」打开任务，点击「打开固定版本原生预览」，
系统在新标签页打开冻结副本的学员视图
（`/teacher/courses?dojo=review-…&tab=questions&selectedId=…&studentPreview=1`）；
核验后在表单内勾选「我已打开固定版本并完成实际核验」、选择「通过本轮审核」、
填写实测过程并勾选全部核验项 → 状态 `待复核 → 待终审`。

终审人 `build-final` 走同一流程 → 状态 `待终审 → 待入库`。

> 复核通过要求「存在 `submission.preview` 审计事件」且「提交内容指纹与审核副本一致」，
> 两次审核都由页面按钮触发预览后才允许通过，未出现绕过。

### 6. 验收入库

终审人点击「将验收版本入库」，两类任务均入库成功：

| 任务 | 素材 | 类型 | 可见范围 |
| --- | --- | --- | --- |
| `CN-BASE-CH01-02` 三次握手抓包观察实践题 | `material_8aa0c5e8…`（v2） | practice | teachers |
| `CN-BASE-CH01-01` 网络分层模型核心概念课件 | `material_1c9d0e07…`（v1） | slide-deck | teachers |

课件任务的固定版本原生预览落在
`/teacher/artifacts/artifact_0a8cf03060d94033a7fd05493e6eaffb`，
说明作品类与题目类审核副本都能正确生成并打开。

### 7. 素材采用（入库后的下游闭环）

复核人 `build-peer` 打开素材库，勾选该素材 →「加入课程」→ 选择自己的课程与章节 → 确认加入。
系统在自己的课程中创建独立可修改的草稿
（`draft_b18b4faec79d4e129716405e1628c00e`），原素材验收版本保持不变。

### 8. 退回返修闭环

对已入库任务走完整个返修闭环，验证「已入库成果可继续演进且历史不丢失」：

| 步骤 | 结果 |
| --- | --- |
| 主责人对已入库任务点击「开始新版本」 | `已入库 → 创作中` |
| 再次提交 | 第 2 次提交，`创作中 → 待复核` |
| 复核人退回并写明修改意见 | `待复核 → 待返修`，原提交与意见保留 |
| 主责人按意见修订后再次提交 | 第 3 次提交，历史保留 1、2、3 |
| 复核通过 → 终审通过 → 入库 | `待返修 → 待复核 → 待终审 → 待入库 → 已入库` |

入库结果为同一素材的 v2（`material_8aa0c5e8…` 版本号 1 → 2），
`construction_releases` 同时保留 v1 与 v2 两条有效验收记录，
`material_library_versions` 保存两版内容，v1 未被覆盖。

### 9. 流程与独立性约束（负向验证）

| 检查项 | 实际返回 |
| --- | --- |
| 作者不能审核自己的提交 | 当前账号不是本轮指定审核人员 |
| 提交必须来自本人创作空间（他人代提交） | 仅主责人可提交创作中或返修任务 |
| 未完成终审不能入库 | 仅终审或统筹可以将已验收版本入库 |
| 已领取任务不能被他人重复领取 | 任务当前不可领取，或账号尚未激活 |
| 非主责人不能开始新版本 | 仅主责人可为已入库任务开始修订 |
| 非主责人不能取得他人任务的创作入口 | 请先领取任务 |

以上均为服务端业务规则拒绝（而非 CSRF 或权限框架拒绝），说明边界确实生效。

### 10. 审计留痕

`construction_events` 记录完整轨迹：
`member.activate ×4`、`task.claim ×2`、`course.update`、`submission.create`、
`submission.preview`、`review.peer`、`review.final`、`release.create`。

## 四、修复的缺陷

### 缺陷 1：创作入口深度链接超出 nginx 请求行上限

`dojo_plugin/construction.py::creation_context` 把包含学习目标、交付范围、验收标准、
资料登记 JSON 在内的整份提示词作为 `prompt` 查询参数拼进 `/teacher?...`。
真实任务说明约 3200 字符，URL 编码后请求行达到 4375 字节，
超过 nginx 默认 `large_client_header_buffers` 的 4094 字节上限：

```
400 Bad Request
Request Line is too large (4375 > 4094)
```

后果：任务中心的「开始 / 继续创作」按钮对填写完整的任务一律打开失败页，
「生成内容」入口整体不可用。由于 `validate_brief` 恰恰要求这些字段齐全，
**越规范的任务越必然触发**。

修复：深度链接只携带任务标识，提示词改由页面按需拉取。

- `dojo_plugin/construction.py`：链接参数由 `prompt=<整份提示词>` 改为 `constructionTask=<任务ID>`；
  接口响应仍保留 `prompt` 字段供调用方使用。
- `dojo_theme/static/js/dojo/teaching-agent.js`：`applyLaunchIntent()` 支持 `constructionTask`，
  经 `/construction/tasks/<id>/create-context` 取回提示词填入输入框，失败时给出明确提示。
- `dojo_theme/templates/teacher_agent.html`：提升静态资源版本号，避免旧脚本被缓存。

修复后链接长度 132 字符（原 4375 字节），任务说明仍完整带入输入框（实测 790 字符）。

### 缺陷 2：固定版本审核副本泄漏到素材库的可选课程与可选来源

`create_space()` 为了让复核人和终审人能预览冻结副本，会把他们加为该副本的管理员。
`library_sources.py` 的 `library_courses()` 与 `list_sources()` 仅按 `DojoAdmins` 过滤，
于是冻结副本 `审核 · CN-BASE-CH01-02 · v1` 出现在：

- 素材库「加入课程」的目标课程下拉中，选中后必然返回
  `409 这是固定版本审核副本，只能预览。请在建设任务中返回原稿修改并重新提交。`
- 「保存已有内容」的候选来源中，使复核人可能把冻结副本当成自己的项目

修复：`dojo_plugin/library_sources.py` 新增 `frozen_course_ids()` / `exclude_frozen()`，
在 `library_courses()` 与 `list_sources()` 中排除 `construction_spaces` 中的审核副本，
同时保留 `dojo_id IS NULL` 的个人素材以免误伤。

### 缺陷 3：任务用产物类型卡住提交（已改为任务接受任意类型）

**现象**（教师 build-chaser 报告）：任务 `WX14-P01` 已领取，内容也放进了创作空间，
但「提交成果」的原项目下拉里只有「请选择」，并提示「尚无可提交项目」。

**原因**：该任务是 `quiz`（出题项目），而创作空间里唯一的项目是
`slide-deck`（课件）「从一个难题到两把钥匙：公钥密码三页入门」。
提交对话框按任务类型筛来源（`quiz` → 只要 `quiz/assignment/question-set/assessment/knowledge-test`），
课件被过滤掉；服务端 `submit()` 用同一套规则拒绝。该批次 16 个已领取任务**全部是 `quiz`**，
其中 14 位教师的创作空间里没有任何类型匹配的项目。

**产品判断**：任务是课程对**教学内容**的需求，不该规定教师必须交哪一种产物。
教师用手头最合适的形态交付（课件、演示、实践题、测验，甚至教案、辩论、仿真）都应该被接受。
因此不再让任务指定类型。

**改动**：

- `dojo_plugin/construction.py`
  - **移除提交时的产物类型门禁**：任何 `CONTENT_TYPES` 中的类型都可提交给任何任务。
  - 新增 `CHECK_FAMILY`，把实际交付的产物映射到四类自测清单之一
    （如 `slide-deck/lesson-plan/learning-path/classroom-scenario → slides`，
    `simulation/attack-defense-scene/debate/roleplay/vulnerable-lab → demo` 等），
    **自测清单与计划覆盖度改为跟随"实际交付物"而不是"任务设定"**。
  - 提交快照记录 `contentType`（实际类型）、`productKind`（清单家族）、`taskKind`（任务原设定）。
  - 复核通过所需的自测项同样按实际交付物校验。
  - `KINDS` 增加 `any`（不限），`save_task` 未指定类型时默认 `any`；
    课程规划里目标的 `requiredKinds` 仍按四类产物校验（用 `PRODUCT_KINDS`）。
  - `creation_context()` 不再给创作台钉死产物类型，交回教师自己决定。
  - 修掉自己引入的一个回归：`check_family()` 对已是家族名的入参不幂等，
    会把 `slides` 再映射成 `quiz`，导致复核永远报「请完成全部核验」。

- `dojo_theme/static/js/dojo/construction-center.js`
  - 提交对话框**列出教师创作空间里的全部项目**（artifact / assignment / practice），不再按类型过滤；
  - 四个家族的自测清单同时渲染，选中项目后**自动切换到对应家族**，
    其余家族整体 `disabled`（`FormData` 不会带上，服务端只收到匹配的一组）；
  - 复核/终审表单按该次提交的 `contentType` 渲染对应清单，并标明项目类型；
  - 任务卡的产物类型下拉默认「不限（任意类型）」。

**验证**（`test/browser/verify-any-type-submit.mjs`，真实浏览器，把一个 `slide-deck` 交到 `quiz` 任务上）：

| 检查项 | 结果 |
| --- | --- |
| 测验任务现在能列出课件项目 | 通过 |
| 对话框说明本任务接受任意类型 | 通过 |
| 未选项目时不显示任何自测清单 | 通过 |
| 自测清单切换为课件（slides）家族 | 通过 |
| 其他家族的清单被禁用（不会随表单提交） | 通过 |
| 课件家族的全部自测项可勾选（4 项） | 通过 |
| 课件可以提交到测验任务 | 通过（`创作中 → 待复核`） |
| 提交记录 `contentType=slide-deck / productKind=slides / taskKind=quiz` | 通过 |
| 复核清单与所交课件一致（不是测验清单） | 通过 |
| 复核页标明项目类型 | 通过 |
| 冻结副本可打开 | 通过 |
| 复核通过 → 终审通过 → 入库 | 通过（素材 `material_92e5bc7e…`，类型 `slide-deck`） |
| 在 `kind=any`（不限类型）任务上重跑整条链 | 通过（素材 `material_516801b5…`） |
| 「不限类型」任务详情列出四类清单且无 JS 异常 | 通过 |

**这次改动本身暴露并修掉的两个问题**：

1. `d.checks[t.kind]` 在任务类型为 `any` 时会取到 `undefined` 并让任务详情弹窗整块崩掉；
   已改为：任务类型是四类产物时显示该类型参考清单并注明"实际按所交项目核对"，
   类型为「不限」时列出四类可选清单。真实浏览器已验证（`test/browser/verify-any-kind-task.mjs`）。
2. 前端资源版本号没跟着改，浏览器仍在用缓存的旧脚本——**教师端因此看不到任何修复**。
   已把 `teacher_construction.html` 的 `v=` 提升为 `construction-v7-any-checklist`、
   `teacher_agent.html` 提升为 `aisecedu-agent-workbench-v3-construction-task`。
   页面已确认引用新版本（`construction-center.js?v=construction-v7-any-checklist`）。

**对已有任务的影响**：无需数据迁移。`WX14-P01/P02` 等既有 `quiz` 任务**现在直接接受任何类型的项目**，
教师手上那份课件可以直接提交；任务卡里的类型标签只是任务说明，
可以在「编辑任务卡」里改成「不限（任意类型）」。

### 缺陷 4：深色主题下组件样式不可读

**现象**（教师反馈）：深色主题下「提交成果」对话框整体发暗、文字几乎看不见，输入框却是刺眼的白色。

**排查**：`construction-center.css` 完全没有使用主题令牌，而是把一整套浅色写死在自己身上：

```css
.cc-shell{--ink:#172b46; --muted:#65788e; --line:#dce5ef; --blue:#235fa9; --pale:#eaf2fb}
.cc-shell input,.cc-shell textarea,.cc-shell select{background:#fff; color:var(--ink)}
```

更关键的是 `.cc-dialog` **没有声明 `background`**。页面加载时会把 `color-scheme` 设为 `dark`，
浏览器据此用深色画 `<dialog>`，而文字仍是写死的 `--ink:#172b46`（深藏青）——
**深字压深底**。实测计算样式：

```
dialog 背景 rgb(18,18,18)   文字 rgb(23,43,70)   → 对比度 1.04
```

**修复**：把组件改为使用主题令牌 `--theme-surface / --theme-field / --theme-text /
--theme-text-muted / --theme-border / --theme-primary / --theme-on-primary /
--theme-shadow / --theme-overlay`（`learning-themes.css` 已按 4 套配色 + 明暗定义好）。
重点是给 `.cc-dialog` 显式补上 `background: var(--theme-surface)`。修复后：

```
dialog 背景 rgb(17,27,45)   文字 rgb(238,244,255)   输入框 rgb(14,25,42)
```

**系统性问题**：这不是个例，而是"组件样式绕过主题令牌"这一类缺陷。做了三件事：

1. **运行时对比度扫描**（`test/browser/verify-dark-contrast.mjs`）：
   在真实浏览器里逐页采样每个含文字元素，向上回溯有效背景，按 WCAG 计算对比度
   （正文 4.5:1、大字 3:1），列出低对比元素。
2. **静态守卫**（`test/test_theme_tokens.py`，已并入 pytest 套件）：
   - 主题化样式表里出现纯白填充 → 失败；
   - 引用了未定义的 CSS 变量、且兜底值是颜色 → 失败
     （`var(--surface, #fff)` 这类正是"浅色正常、深色变白"的元凶）。
   已用两个历史缺陷做过反证，确认守卫不是空转。
3. **按扫描结果逐个修复**，全量结果：

| 页面 | 修复前低对比元素 | 修复后 |
| --- | --- | --- |
| 建设任务中心 | 20 | 0 |
| 素材库 | 14 | 0 |
| 生成项目合集 | 6 | 0 |
| 教师课程中心 / 新建课程 / AI 共创 | 0 | 0 |
| 平台管理（总览/用户/课程/题目/提交/配置） | 211 | 0 |

修掉的根因包括：`construction-center.css` 写死浅色、`teacher-library.css` /
`teacher-assignment.css` 引用并不存在的 `var(--surface,#fff)`、
`teacher-projects.css` 与 `teaching-agent-workbench.css` 用关键字 `white` 填充、
`teaching-job-progress.css` 引用未定义的 `--status-*`、
`admin-product.css` 62 处写死颜色、以及依赖浏览器默认按钮底色的侧栏按钮。

明暗两种模式、共 12 个页面现在都是 0 个低对比元素。

### 缺陷 5：提交任务被要求填写大量说明

**现象**：提交对话框要求填写「引用来源」「自测步骤」「参考答案」「环境版本」「修订说明」
五个必填文本域，并勾选整份自测清单，否则无法提交。

**修复**：提交只需要选择项目。

- 五个说明字段改为可选，并折叠进「补充说明与自测记录（可选，不填也能提交）」；
- 服务端 `_text(..., required=False)`，`checks` 为空即接受；
  若填了但与所交类型不符仍会拒绝（错填不能通过）；
- 唯一的必填项是「选择本人创作空间内的原项目」。

真实浏览器验证（`test/browser/verify-optional-evidence.mjs`）：表单只剩 1 个必填项，
说明区默认折叠，什么都不填直接提交成功进入待复核，落库证据为
`{"tests":"","checks":[],"answers":"","changes":"","sources":"","environment":""}`。

> 复核人一侧的自测清单仍然要求勾选，作为最后一道质量门禁。
> 如果这一步也想去掉，说一声即可。

### 非缺陷：AI 拒绝编造资料

首次让 AI 共创课件时，课程规划登记了教材 PDF 与 Wireshark 在线文档，
但创作空间里并没有可读文件。AI 的回复是：

> 资料核实结果：两份来源目前都读不到，因此我不会先做正式生成，也不会编造任何页码或截图。
> 当前课程「网络课程创作空间」的资料档案为空（可读材料 0 份）……

这正是 `creation_context()` 提示词中
「请先核实你能读取资料；不能访问的资料应明确要求补充，不得编造」所要求的正确行为，
不属于缺陷。补传真实讲义并在课程规划中同步登记资料位置后，AI 才进入正式生成。

## 五、验收环境的已知限制

验收用的无头 Chrome 运行在宿主机上，而宿主机**未安装中文字体**
（`fc-list` 仅 8 项，无任何 CJK 字体）。因此 `test/browser` 采集的 PNG 截图里
中文会显示为空白，但：

- 所有断言都基于 DOM（`innerText`、元素几何、`checkValidity`、接口响应），与字体无关；
- 真实用户浏览器带有中文字体，不受影响。

截图仅作为「确实发生了真实渲染与真实点击」的旁证，不作为中文排版验收依据。

## 六、复现方式

全部脚本位于 `test/browser/`，零第三方依赖
（Node 内置 WebSocket 直连 Chrome DevTools Protocol，不依赖 playwright/selenium）：

| 文件 | 作用 |
| --- | --- |
| `cdp.mjs` | CDP 驱动：真实鼠标/键盘事件、命中检测、弹窗接管、独立浏览器上下文 |
| `provision-teachers.mjs` | 注册 4 个教师账号并创建各自课程空间 |
| `seed-construction.py` | 在 CTFd 应用上下文内建立批次、课程规划、任务卡 |
| `e2e-construction.mjs` | 分阶段端到端验收 |
| `networking-layering-handout.md` | 供 AI 读取的真实课程讲义 |
| `seed-quiz-task.py` | 复现用：为验收课程补一张 `quiz` 任务卡 |
| `verify-quiz-type-mismatch.mjs` | 缺陷 3 早期验证（类型不匹配提示） |
| `verify-any-type-submit.mjs` | 缺陷 3 最终验证：课件提交到测验/不限任务并走完入库 |
| `verify-any-kind-task.mjs` | 「不限类型」任务详情与四类清单的真实浏览器验证 |
| `verify-dark-contrast.mjs` | 明暗两模式下逐页低对比元素扫描（教师 6 页 / 管理 6 页） |
| `verify-optional-evidence.mjs` | 提交表单必填项与空证据提交验证 |
| `test/test_theme_tokens.py` | 静态守卫：纯白填充与未定义令牌（已并入 pytest 套件） |
| `seed-anytype-demo-task.py` | 复现用：建立一张「不限类型」任务 |

`e2e-construction.mjs` 支持的阶段：
`activate` / `claim` / `content` / `submit` / `review-peer` / `review-final` /
`publish` / `verify` / `adopt` / `guards` / `material` / `plan` / `ai` / `rework` / `slides` / `all`。

运行环境要求：Chrome for Testing（`/usr/bin/chromium-browser`），测试站点可从宿主机访问。
