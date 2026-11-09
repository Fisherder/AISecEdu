# 软件安全第 2 次平时作业 · 系统一致性检查

- 检查日期：2026-11-02
- 检查对象：`http://10.92.35.7:8080`（玄甲生产实例，`pwncollege-dojo`；课程「软件安全」，`dojo_id=3839952`）
- 账号：教师 `teacher`（user id 101，本课程教师/草稿可试运行）；学生 `2022211575`（user id 7208）
- 浏览器：Chromium（Playwright 实际驱动，非仅接口调用）
- 实验环境：`aisecedu/hw02-off-by-one:20261031-r3`（Ubuntu 20.04.6、gcc 9.3.0、gdb 9.2、Python 3.8.10）
- 材料：`第2次平时作业要求.doc`（sha256 `c517945b…425eff`，已逐字提取）

## 1. 材料要求（原文要点）

1. **课程研究报告**：介绍软件安全某一领域的研究现状、发展历史、发展趋势；做一定分析与研究（真实攻防实验、对比分析等），写出自己的想法与观点，鼓励创新（堆栈溢出、漏洞挖掘、漏洞利用等）；**5000 字以上**。
2. **思考题**：
   1. 访问「差一错误」模拟环境平台 <http://10.92.35.7/chat/ki8UbF7v6oFRIwv4> 做模拟攻防实验，操作方式见《用于差一错误的模拟环境平台操作手册》；
   2. 熟悉 AI 模拟实验场景，了解被测试的、存在差一错误的目标代码，并对该代码进行**编译**；
   3. 通过 **GDB** 调试目标代码，找出包含漏洞的代码位置，并调试验证漏洞发生；
   4. 编写 **POC** 验证代码，对目标漏洞代码进行验证；
   5. 编写**测试报告**：用截图等方式写出模拟实验过程及通过记录，并写出该方式的优缺点和建议。
3. **提交**：2025-12-03 以前，电子版上传教学云平台；每人一个压缩包，命名 `软件安全第2次平时作业+学号+姓名.zip`。

## 2. 系统中「第二次作业」的实际形态

### 2.1 生产库/页面状态

| 字段 | 实际值 |
| --- | --- |
| 课程章节 | 安全编码（module_index=1） |
| challenge | `hw02-bounds-check`，显示名「第二次平时作业：差一错误复现与 POC 验证」 |
| `challenges.state` | `hidden` |
| `dojo_challenges.required` | `false`（页面显示「选修实践」） |
| `publication_state` | `DRAFT` |
| `learning_challenge_profiles` | `DRAFT`，validation 状态 `PASS`（2026-11-02 02:43 更新） |
| 学生可见性 | 无 `dojo_challenge_visibilities` 记录；仅页面提示「已隐藏 — 因你是本课程教师，此题对你可见」 |
| 运行包 | `path_override=/var/agent-runtime/generated/prepared-drafts/draft_66c50cf5…-gdb-first-r3`，`manifest.taskVersion=2.1.0`，`testVersion=hw02-off-by-one-v2-gdb-first` |
| 工作区 | `/home/hacker/courses/software-security/hw02-off-by-one` |
| 允许编辑 | `poc_exploit.c`；材料 `materials/auth_manager.c/.h`、`debug_target.c` 只读 |
| 核验 | `make check`（公开 2 项）、`make submit`（正式 + Flag） |

### 2.2 课堂上学生实际看到的「第二次」

- 学生端「安全编码」章节**只有**「第一次作业：自主编写安全字符串函数」；第二次、第三次平时作业都不在列表中，直接访问 URL 也会回到章节页。
- 学生端「今天」显示：**已完成 1 / 3 项必修内容；下一项：第二次实验：弧注入**。
- 「软件安全分析与实训」章节对学生可见：第一次实验（Ollydbg 程序分析，已完成）、第二次实验（弧注入）、第三次实验（StackOverrun）。
- 该章节的单元资料表格却把前两项写成「**第一次作业：Ollydbg程序分析**」「**第二次作业：弧注入**」；其中「弧注入」的题面明确引用《栈溢出实验》和《第2次实验报告要求》，与本次材料《第2次平时作业要求》不是同一份作业。

因此系统里同时存在三个容易混淆的「第二次」：

| # | 名称 | 位置 | 状态 | 与材料的关系 |
| --- | --- | --- | --- | --- |
| 1 | 第二次实验：弧注入 | 软件安全分析与实训（module 0） | 学生可见、必修 | 栈溢出/API 复用，引用《第2次实验报告要求》，**不是**本材料 |
| 2 | 第二次平时作业：差一错误复现与 POC 验证 | 安全编码（module 1） | 教师可见试运行；学生不可见、DRAFT、选修 | 主题与材料思考题 2–4 对应，**但未发布** |
| 3 | 第二次平时作业：差一错误边界验证 | 开发实例 127.0.0.1:28080 / 开发草稿包 | DRAFT | 旧版本，要求实现 `handle_session` 并写测试，不含 GDB/POC 步骤 |

## 3. 实际在浏览器中完成 hw02（教师试运行）

从课程页启动题目后，容器 `user_101` 启动成功；`Code（VS Code）` 入口报错（见 4.2），但 `Terminal`、`Desktop`、`SSH` 入口可用。以下操作均在浏览器内的 Terminal（ttyd）实际执行：

```text
cd ~/courses/software-security/hw02-off-by-one
make debug
./auth_debug_target AAAAAAAAAAAAAAAA          # authenticated=1
make gdb
```

GDB 中依次执行：

```text
break handle_session
watch authenticated
run
continue
```

实测输出：

```text
Breakpoint 1 at 0x401176: file materials/auth_manager.c, line 7.
Hardware watchpoint 2: authenticated
Breakpoint 1, handle_session (input=...) at materials/auth_manager.c:7
Continuing.

Hardware watchpoint 2: authenticated
Old value = 0
New value = 1
0x00000000004011bb in handle_session (input=0x7fffffff... 'A' <repeats 16 times>) at materials/auth_manager.c:26
26          authenticated = 1;
```

即：`handle_session` 的 `for (index = 0; index <= sizeof(session.session_id); index++)` 在 16 字节输入时写到 `session_id[16]`（数组只有 16 字节），把相邻的 `session_authenticated` 清零，随后认证条件成立。漏洞位置和触发条件与题面一致。

随后在 `poc_exploit.c` 中写入独立 POC（构造 16 字节输入并检查全局 `authenticated`），执行：

```text
make poc && ./poc_exploit
# POC off-by-one confirmed: authenticated 0 -> 1
make check
# [PASS] POC 严格 C11 编译
# [PASS] GDB 断点、观察点与差一认证状态验证
# 通过 2 / 2 项；测试版本 hw02-off-by-one-v2-gdb-first
make submit
# 正式核验通过；提交以下完成凭证：
# pwn.college{w7POJvlQmZAxDQsZ5G9VtVElrTz.QX4ETNxwSMwEzW}
```

把 Flag 填回题目页后页面显示「🎉 已成功完成 第二次平时作业：差一错误复现与 POC 验证！」；工作区生成 `evidence/formal-receipt.json`（2 项均 PASS，GDB 反馈中包含 `Old value = 0`、`New value = 1`、`POC_OFF_BY_ONE_CONFIRMED`）和 `evidence/submissions/` 存档。

> 说明：这是教师草稿的试运行完成，未计入学生成绩（`solves` 无记录，仅有 `authoring.draft.runtime.complete` 审计事件）。题目本身可解、判分链路有效。

## 4. 一致性与缺陷

### 4.1 与材料一致的部分

- 目标代码同为 `auth_manager.c`，漏洞同为 16 字节 `session_id` 的差一写入；
- 编译（`make debug` / `make gdb` 先构建 `auth_debug_target`）、GDB 断点 + 观察点、POC 独立复现三个环节与材料思考题 2–4 对应；
- 真实隔离 Ubuntu 20.04、GCC 9.3、GDB 9.2，满足材料「编译 + GDB」所需环境（Python 实测 3.8.10；Dify 平台开场提示写的是 3.8.5，属轻微版本差异）；
- 实测漏洞链：`session_id[16]` 越界写 → `session_authenticated` 变 0 → `authenticated` 0→1，可复现。

### 4.2 阻塞级问题（P0）

1. **学生完全看不到第二次平时作业。**
   `hw02-bounds-check` 为 `hidden` + `DRAFT` + `required=false`，且没有可见性时间窗；学生端章节、直接 URL、学习中心均不出现。按现状，学生无法在平台上完成材料里的第二次作业；页面上能看到的「第二次」是弧注入（不同作业）。
2. **`Code（VS Code）` 工作区打不开。**
   题目页显示「暂时无法连接工作区 — 课程和作业目录名称无效」，接口 `GET /pwncollege_api/v1/workspace?service=code` 返回 HTTP 409：
   ```json
   {"success": false, "active": true, "error": "课程和作业目录名称无效"}
   ```
   根因：`dojo_challenges.data.coding_workspace` 只有 `{"title", "source"}`，缺 `course` 与 `assignment`；`prepare_assignment_workspace.validate_config()` 要求二者符合 `[a-z0-9][a-z0-9-]{0,79}`。同章节第一次/第三次作业的 `coding_workspace` 都带这两个字段（例如 `{"course":"software-security","assignment":"hw01-safe-copy",...}`），所以只有 hw02 失败。
   实测在容器内用补齐后的配置调用准备脚本成功：
   ```json
   {"folder": "/home/hacker/courses/software-security/hw02-off-by-one",
    "workspace": ".../hw02-off-by-one.code-workspace", "source": ".../poc_exploit.c", ...}
   ```
   题面要求「在 VS Code 打开 `poc_exploit.c`」，但当前只能改用 Terminal/Desktop；对只按题面操作的学生是直接阻塞。

### 4.3 与材料不一致的交付要求（P1）

| 材料要求 | 系统实际 | 判定 |
| --- | --- | --- |
| 5000 字以上课程研究报告 | 平台无此入口/说明；题面和章节说明明确「不要求研究报告」 | 不一致（缺失） |
| 思考题 1：访问 Dify 差一错误模拟平台 + 操作手册 | 平台未引用该链接；且该 Dify 应用当前不可用（见 4.4） | 不一致（替代为真实容器） |
| 思考题 5：测试报告、截图、优缺点和建议 | 题面明确「不要求研究报告、测试报告、截图或压缩包」 | 不一致（缺失） |
| 压缩包上传教学云平台、2025-12-03 截止 | 平台用 Flag 提交，无截止时间/无上传入口 | 不一致（替代协议） |

这些差异看起来是「平台只承担实验判分、报告另交教学云平台」的有意设计，但系统题面和章节说明目前直接写「不要求报告」，与材料字面冲突；学生若只读平台会以为不需要报告。

### 4.4 材料指定的 Dify 平台当前故障（P1）

- 打开 <http://10.92.35.7/chat/ki8UbF7v6oFRIwv4> 可见「差一错误」应用和实验介绍，输入 `start` 后页面停在 `Workflow Process`。
- Dify `workflow_runs` 最新一条（2026-11-02 03:20，app `5bdd8d9c-…`）状态 `failed`：
  `[deepseek] … status code 401: Authentication Fails, Your api key: ****c18e is invalid`。
- 也就是说材料思考题第 1 步（访问模拟平台）当前无法完成，且与平台作业没有任何互相引用。

### 4.5 命名与文案问题（P1/P2）

1. 单元资料把「第一次实验/第二次实验」写成「第一次作业：Ollydbg程序分析」「**第二次作业：弧注入**」，与真正的「第二次平时作业」冲突；学生按「第二次作业」搜索会落到弧注入。
2. 软件安全分析与实训单元说明仍写「当前本单元上线了下面两项考核任务；资料组 3–7 尚未发布」，但第三次实验（StackOverrun）已对学生可见（2026-10-27 起）；安全编码章节写「依据三次平时作业组织」，但学生只看到第一次。
3. 平台的「第二次平时作业：差一错误复现与 POC 验证」题面把「**先进行动态调试。**」等 Markdown 粗体原样显示（列表项里未渲染），属展示瑕疵。
4. 平台素材库/教学材料中没有《用于差一错误的模拟环境平台操作手册》，也没有第 2 次平时作业要求原文的入口（仅第一次作业的 zip 材料）。

### 4.6 环境/版本漂移（P2）

- 生产实例已是 r3 + `taskVersion 2.1.0`（先 GDB 后 POC），开发实例 127.0.0.1:28080 仍是旧版「差一错误边界验证」（实现 `handle_session` + 测试），仓库 `data/dojos/003a97d0/dojo.yml` 甚至没有 hw02/hw03/lab03–07。
- 若后续按 `dojo.yml` 重新导入/部署开发状态，会把生产里已有的人工/草稿题目覆盖掉，需要先同步或明确「数据库为准」。

## 5. 建议的修复顺序

1. **发布与可见性**：用正式发布流程（`promote_prepared`）发布 `hw02-bounds-check`，或至少设置 `challenge.state=visible`、合适的可见性时间窗，并把 `required` 设为课程要求的必修；同时在「软件安全分析与实训」中把「第二次作业：弧注入」改回「第二次实验：弧注入」，避免与第二次平时作业混淆。
2. **修复 Code 工作区（P0）**：
   - 数据修正：把 `dojo_challenges.data.coding_workspace` 补成
     `{"course":"software-security","assignment":"hw02-off-by-one","title":"…","source":"poc_exploit.c"}`；
   - 代码兜底：在 `dojo_plugin/assignment_workspaces.py:coding_workspace_options()`（或草稿运行时写入处）用 `workspace_layout.course/assignment` 补齐缺失字段，避免同类草稿再次出现；
   - 修复后重新打开 `service=code` 验证 VS Code 能进入工作区。
3. **报告与提交口径**：明确第二次作业的报告是「平台不判、教学云平台另交」，或给平台增加报告提交入口；无论哪种，都要修改题面和章节说明中「不要求研究报告/测试报告」的绝对表述，使其与材料不冲突。
4. **Dify 平台**：修复模型 Key（401），并决定是否在 hw02 题面/章节资料中提供该链接和《操作手册》；若不使用，材料也应同步改为平台真实流程。
5. **文案同步**：「两项考核任务」「三次平时作业」等过期表述，及题面 Markdown 粗体未渲染问题。
6. **环境同步**：把生产 r3 草稿包、作业定义同步回开发实例和 `dojo.yml`，避免重部署回退。

## 6. 结论

- **题目本身可用**：hw02 的差一错误复现、GDB 断点/观察点、POC、`make check` 2/2、`make submit` 发 Flag、页面回填 Flag 全部实测通过；核心实验内容与材料思考题 2–4 一致，漏洞位置和触发条件正确。
- **但作为「第 2 次平时作业」交付给学生目前不一致、不可用**：
  1. 学生端完全看不到该题（DRAFT/hidden/选修）；
  2. 题面要求的 VS Code 工作区因 `coding_workspace` 缺字段无法打开；
  3. 材料要求的研究报告（5000 字）、思考题 5 的测试报告/截图、Dify 平台第 1 步、压缩包提交与截止日期，在系统中均无对应或被明确取消；
  4. 学生端可见的「第二次作业」实际指向弧注入（另一份材料），命名冲突会误导学生。

**判定：实践内核一致且已验证可完成；交付契约、平台入口和发布状态与材料不一致，当前不能直接当作学生的第 2 次平时作业使用。**

## 附：证据附件

- `docs/assets/hw02-check/gdb-watchpoint.png`：GDB `break handle_session` / `watch authenticated` / `run` / `continue` 命中观察点，Old value = 0、New value = 1。
- `docs/assets/hw02-check/poc-run.png`：`make poc && ./poc_exploit` 输出 `POC off-by-one confirmed: authenticated 0 -> 1`。
- `docs/assets/hw02-check/make-check.png`：`make check` 2/2 PASS。
- `docs/assets/hw02-check/make-submit-flag.png`：`make submit` 正式核验通过与 Flag。
- `docs/assets/hw02-check/formal-receipt.json`：工作区保存的正式核验回执（含完整 GDB 反馈、源码 SHA256）。
- `docs/assets/hw02-check/dify-off-by-one.png`：材料链接指向的 Dify「差一错误」应用首页。

> 截图由无中文字体的 headless Chromium 生成，界面中文会显示为方框；终端中的 ASCII 命令/输出、Flag 和 GDB 反馈不受影响，以截图中可见的 ASCII 部分及 `formal-receipt.json` 为准。

## 附：本次实际产生/修改的状态

- 教师（user 101）试运行容器 `user_101`（镜像 `aisecedu/hw02-off-by-one:20261031-r3`）已启动并保留，工作区含本次 POC、GDB 构建产物、`evidence/formal-receipt.json`。
- 页面 Flag 提交为教师草稿试运行，仅写入 `learning_audit_events`（`authoring.draft.runtime.complete`），未产生学生 `solves`，未修改学生 2022211575 的任何数据。
- 未修改生产数据库中的题目配置；第 5 节第 2 条的数据修正是建议操作。
