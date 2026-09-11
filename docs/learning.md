# 玄甲智能学习与证据评测

玄甲把智能教学能力直接实现于现有课程、题目与工作区边界内，而不是在旁边部署另一套服务。本页描述设计边界、角色流程、数据、API、安全约束和运维方法。

## 一体化原则

系统中的用户、教师权限、课程、模块、题目、工作区、flag、学习证据与评分共享同一个事务和权限边界：

```text
玄甲 dojo_theme（Jinja / Bootstrap）
    │ 原生 CTFd session / CSRF
    ▼
CTFd + dojo_plugin (Flask)
    ├── Courses / Course / Unit / Exercise 页面
    ├── 智能出题、Tutor、证据、评测与推荐
    └── Docker/Kata 工作区编排
              │
              ├── Terminal / Code / Desktop / SSH
              └── Nix dojo CLI 自动上报脱敏证据
    │
    ▼
单一 PostgreSQL
```

没有单独的 FastAPI、自研 Next.js 学生站、Go terminal gateway、第二身份系统或第二数据库。LAN IP 是唯一规范 Web 入口，直接由 CTFd 与玄甲 `dojo_theme` 提供学生、课程、Workspace、认证和管理页面；开发和部署均不再引入域名兼容层。`/dojos`、`/<course>`、`/<course>/<unit>` 与题目手风琴采用课程 → 单元 → 题目的信息架构；学习中心、课程分析、教师工作台和 Tutor 复用同一 `base.html`、导航、卡片、学习状态、表格、Tab 和侧栏。模型服务是可选的出站增强依赖，不拥有业务状态，也不参与 flag 判定。

## 功能映射

| 对外领域概念 | 唯一事实源 | 平台中的含义 |
| --- | --- | --- |
| 课程 | `Dojos` 与 `DojoUsers` | 一门可加入、可授课、可统计进度的课程；`DojoAdmins` 表示课程教师，`DojoMembers` 表示已加入学生 |
| 教学单元 | `DojoModules` | 课程内有序的教学内容容器 |
| 题库发布项 | `DojoChallenges` | 底层 CTFd `Challenge` 在课程单元中的发布关系；发布关系决定名称、必做性、顺序、可见性与版本档案 |
| 作答结果 | CTFd `Submissions` / `Solves` | 每次提交形成 `Submission`，首次正确完成形成 `Solve`；学习概览按课程聚合两者 |
| 学生与教师身份 | CTFd 用户与同一 session | 平台管理员或课程 `DojoAdmin` 进入教师工作台，其他已加入成员使用学生视图 |
| 题库与版本 | 稳定的 `DojoChallenges` 身份 + 不可变运行包版本 | 草稿修订与发布历史分别持久化 |
| 智能出题 | `LearningAuthoringJobs`、`LearningDrafts`、策略/方案 Agent、Pro 构建/红队/修复/验证 Agent 与不可变运行包 | Agent 自动选策，并自主执行验证、修复和复验；问题未闭环时禁止发布 |
| 实验环境 | 统一 Workspace + Kata/Docker + Simulation Engine | 每道题选择容器、模拟或混合模式；共享题目身份、attempt、证据、评分与完成记录 |
| Terminal/IDE/Desktop/SSH | 现有 Workspace 页面和服务 | 围绕当前题目提供统一实验入口 |
| Guide | `LearningGuideThreads` / `LearningGuideMessages` 与完整学习档案 | ChatGPT 式长期学习对话，结合真实课程、attempt、评分、能力和推荐提供个性化规划 |
| Tutor 3.0 | `LearningTutorMessages`、完整题目/容器上下文、私有标准解法与当前 attempt/epoch | 比对标准路径和学生实时状态，给出统一提示式、防答案泄露的过程引导 |
| 过程证据 | `LearningEvidenceEvents` | Workspace CLI、运行时事件、Tutor、反思和答案判定形成统一时间线 |
| 评分与复核 | `LearningAssessments` / `LearningAppeals`、Pro 评分 Agent | Oracle 锁定客观 60 分；Pro 结合全上下文评过程 40 分，支持修订、申诉与教师复评 |
| 自适应学习 | `LearningSkillStates` / `LearningRecommendations` | 六维能力状态、置信度和下一题推荐 |
| 教师分析 | 课程教师 API 与教师工作台 | 汇总参与者、attempt、得分、进度、能力与申诉 |

## 完整学生端

`/student` 是学生登录后的规范起点，不创建独立账号、课程副本或第二套学习数据库。它把已有课程、教师任务、活动实验、个人工作区、学习证据、能力状态、推荐和公开资源组织为一个“计划 → 行动 → 监控 → 复盘”的自主学习闭环，并始终给出一项可直接执行的下一步，而不是要求学生先理解平台内部模式。

| 学习环节 | 入口 | 学生可完成的工作 |
| --- | --- | --- |
| 规划与继续学习 | `/student` | 查看真实课程与待办，优先继续活动实验、教师任务或基于证据的推荐；没有待办时进入下一课程内容或用自然语言制定计划 |
| 长期学习对话 | `/guide` | 创建持久线程，用自然语言分析、提问、制定计划和复盘；学生可显式引用课程题目、管理自己的记忆与对话范围 |
| 教师任务 | `/learning/assignments/<id>` | 阅读要求、关联课程与题目，提交成果并查看教师反馈 |
| 个人自主实践 | `/learning/extend` | 从已加入课程选择目标，创建学生自己的学习工作区，并进入受限 `/security-learn` 运行环境 |
| 课程与材料 | `/<course>`、`/<course>/<unit>` | 阅读教师发布的内容、课件、演示和资源，按课程顺序进入题目 |
| 真实实验 | `/<course>/<unit>/<challenge>`、`/workspace` | 使用 Terminal、Code、Desktop、SSH、模拟视图和 Tutor 完成容器、模拟或混合题 |
| 证据与复盘 | `/dojo/<course>/learning` | 查看 attempt、客观完成、过程证据、评分、六维能力、推荐与申诉，并填写反思 |

学生端遵循以下产品约束：

- 身份、选课、课程内容、任务、attempt、Flag、评分和学习证据全部使用 CTFd/Dojo 的唯一事实源；学生门户不维护影子账号或虚假课程数据。
- 学生智能体可以自动读取当前学生自己的记忆、对话、工作区、成果、已加入课程和已发布内容；不得读取其他学生数据、教师私有答案或课程管理信息。
- 修改个人记忆、提交成果等有外部影响的动作必须来自明确指令；提交评测等高影响动作保留确认或教师复核。客观 Flag、模拟目标与评分边界由确定性服务端规则判定，不交给模型猜测。
- 辅导优先采用“提示 → 线索 → 示例”的最小帮助原则，先让学生解释计划和证据，再逐步增加支持；不把标准答案、私有验证条件或完整利用链直接泄露给学生。
- 首页推荐只依据可追溯的真实证据，展示薄弱能力、理由和可执行目标；学生可以控制对话引用、长期记忆和个人工作区，而不是被系统自动绑定到某个章节。

这一交互取舍参考了 [OpenAI Study Mode](https://openai.com/index/chatgpt-study-mode/) 的分步引导与主动参与、[Claude for Education](https://www.anthropic.com/news/introducing-claude-for-education?subjects=announcements&type=product) 的苏格拉底式提问，以及 [EEF 元认知与自我调节指南](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/metacognition) 中的计划、监控和评价循环；具体能力边界同时吸收项目内保留的 OpenMAIC 自主学习实现，但统一落在玄甲的真实身份、课程、工作区和安全策略之内。

## 统一题目模式与模拟引擎

模拟题不是独立应用或第二套题库。`DojoChallenges` 仍是唯一题目发布实体，每道题只增加一个 `exercise_mode`：

| 模式 | 运行环境 | 完成方式 | 适用场景 |
| --- | --- | --- | --- |
| `CONTAINER` | 现有 Kata/Docker Workspace | 动态 Flag / 原生 checker | CTF、代码分析、真实工具与服务操作 |
| `SIMULATION` | 结构化状态模拟内核 | 必需目标的确定性条件 | 无线通信、侧信道、移动终端、工控、云控制面、应急推演等难以完整实装的场景 |
| `HYBRID` | 容器与模拟内核同时运行 | `OBJECTIVES`、`FLAG`、`EITHER` 或 `BOTH` | 真实分析工具处理样本，同时在情境状态中作决策和验证 |

三种模式共享课程导航、题目 URL、可见性与解锁、`LearningAttempts`、`Submissions/Solves`、Tutor、Guide、60/40 评分、申诉、能力画像和推荐。纯模拟题不创建空容器、不展示 Flag 输入框；完成必需目标后仍写入标准 CTFd `Solve`，因此排行榜、进度和前置题逻辑无需分叉。

### 引擎边界

```text
题目 YAML / 教师 Agent
        │ 结构校验、泄漏检查、可达性搜索
        ▼
版本化 Simulation Scenario
        │
        ├── public state ──► Topology / Spectrum / Metrics / Table / Timeline / State
        ├── private state ─► 仅服务端条件、Tutor/Grader 安全参考
        ├── actions ───────► 类型化参数 + 前置条件 + 使用次数/冷却
        ├── effects/rules ─► 受限声明式状态转移
        └── objectives ────► 确定性完成判定
                  │
                  ▼
       事件哈希链 + 每步快照 + 可重放验证
                  │
                  ├── LearningEvidenceEvents
                  ├── Tutor / Guide / Grader
                  └── CTFd Solve
```

引擎不执行题目或模型提供的 Python、Shell、JavaScript、HTML/XML。场景只能使用有界 JSON 和白名单 DSL：

- 条件：`eq`、`ne`、`gt/gte`、`lt/lte`、`in`、`contains`、`exists`、`truthy` 等；
- 效果：`set`、`increment`、`append`、`merge`、`remove`、`toggle`；
- 参数：`boolean`、`choice`、`entity`、`number`、`text`，均在服务端验证；
- 状态路径使用 JSON Pointer；学生界面和模型语义补丁只能写 `/public`，视图也只能绑定公开路径；
- 每个场景限制大小、动作数、规则数、目标数、条件数、效果数和最大回合数。

模型可用于解释开放式学生输入或提出语义补丁，但不能直接决定分数、完成状态或执行代码。服务端只接受题目显式允许的公开路径，并在应用前校验类型、长度、私有字面量泄漏和不变量；模型不可用、超时或输出越界时，确定性规则仍可独立运行。所有必需目标最终都由声明式条件判定。

### 场景规范

最小的手写题目可以使用平台预设：

```yaml
challenges:
  - id: wireless-simulation
    name: 无线接入异常诊断
    exercise_mode: SIMULATION
    interfaces:
      - name: Simulation
    simulation:
      preset: WIRELESS
      title: 无线接入异常诊断
      description: 分析无线拓扑和频谱状态，形成假设、实施调整并复测。
```

`WIRELESS`、`MOBILE`、`SIDE_CHANNEL`、`ICS`、`GNSS` 与
`SECURITY`/`GENERAL` 预设会在课程导入时展开为完整、版本化场景。其中后四类
分别提供移动终端权限滥用、功耗侧信道、工控 PLC 非授权写入和 GNSS 欺骗的
探索式调查实验。它们不会在初始状态公开完整证据，也没有固定的“检查 → 收集
→ 处置”按钮顺序：学习者可并行选择不同证据源，关键实验要求配置采集点、
样本量、触发方式、签名基线或独立时间参考。错误配置会消耗回合并返回可解释
的测量反馈，但不会直接结束题目；错误假设、处置和验收范围同样可以根据可见
后果修正。

每个领域预设同时提供：

- 明确的角色、任务、完成要求、现场约束和推荐调查方法；
- 3–4 个安全域、至少 8 个带地址/角色/状态的实体，以及带方向、协议和状态的动态关系；
- 只显示症状的初始告警、逐步形成的证据矩阵和可点击的实体详情；
- 当前阶段、当前任务、证据数量、风险与业务状态，以及可回放的分类时间线；
- 要求学习者写出证据依据的根因假设、写出安全检查点的最小处置和覆盖威胁、业务、安全边界的独立验收。

场景升级会创建新的 package 版本，并将旧场景保留在 `history` 中；已有 attempt
继续按原版本和 digest 回放，新作答才进入新版。教师出题 Agent 发布的题目则
保存完整规范，核心字段为：

```json
{
  "schemaVersion": "dojo-simulation/1.0",
  "version": 1,
  "maxTurns": 12,
  "completionPolicy": "OBJECTIVES",
  "initialState": {"public": {}, "private": {}},
  "actions": [],
  "rules": [],
  "objectives": [],
  "views": [],
  "invariants": []
}
```

场景发布前必须同时通过 Schema 检查、公开视图路径检查、私有状态泄漏检查、必需目标有界可达性搜索和确定性重放。题目版本、场景摘要和 attempt 绑定；教师后来更新题目不会改变学生已经开始的运行。

### 运行、持久化与回放

启动纯模拟题会创建普通 attempt 和一条 `LearningSimulationRuns`，初始状态经过规则求值后写入第 0 快照。每次动作在事务与行锁内检查 `expectedTurn`，拒绝过期客户端写入；接受的动作依次执行参数校验、前置条件、效果、分支、规则、不变量和目标求值。运行记录保存：

- 公开/私有/目标状态、随机种子、回合、场景版本与摘要；
- 只追加的 `LearningSimulationEvents`，每项包含前一哈希和本事件哈希；
- 每个接受动作后的 `LearningSimulationSnapshots`；
- 同步写入 attempt 证据链的动作、拒绝、目标、停止和完成事件。

`GET /pwncollege_api/v1/simulations/<run>/replay` 从初始状态按事件重新执行，不信任数据库中的最终状态；返回事件链、状态哈希和快照一致性。停止保留历史但终止当前运行；重启创建新 attempt/run；重置对纯模拟题不删除 `/home/hacker`，因为该题没有把 Home 作为运行状态。混合题仍沿用容器的 Home 语义。

### Workspace 与学习智能

Workspace 的 Simulation 服务使用固定结构化渲染器，不渲染模型原始标记。题目可组合拓扑、频谱、指标、表格、时间线和通用状态视图；窄屏自动重排。动作表单只显示当前可用操作、类型化参数、拒绝原因、目标进度、回合数和事件完整性，动作完成后局部刷新状态而不重载页面。

Tutor 同时接收当前容器快照和/或模拟公开状态、可用动作、目标进度与最近事件，并在服务端用私有状态和标准路径做防泄漏比较。Guide 只有在学生明确引用该题且活动 attempt 匹配时才得到同一公开现场证据。Grader 将成功/拒绝的模拟动作和目标事件与终端命令同等纳入过程 40 分；客观 60 分仍只来源于平台完成判定。

## 角色流程

### 学生

1. 从 `/dojos` 的分组卡片进入课程；`/<course>` 依次展示简介、学习状态、单元与学生排行榜。
2. 从单元卡片进入 `/<course>/<unit>`，按资源/题目手风琴阅读内容和启动工作区。
3. 在 `/learning` 查看跨课程学习概览，在 `/dojo/<course>/learning` 查看单门课程进度、六维能力、推荐题与历史 attempt。
4. 启动题目会创建新的 attempt epoch；切题、重启或停止会结束旧 epoch，避免证据串线。
5. 在 Terminal、Code、Desktop 或 SSH 中完成实验。交互式 Bash 会通过 `dojo evidence` 静默异步上报唯一命令及退出状态，不在终端显示后台作业记录。
6. 从 Workspace 右侧可收起 Tutor 直接提问；模块题目中展开的内嵌工作区也提供相同右侧栏。Tutor 在服务端读取题目基线文件、实时 `/challenge` 文件、进程、端口、脱敏环境、可信过程证据、历史问答和私有标准解法，比较目标状态与学生现状后只跨越一个认知台阶。
7. 从 `/guide` 进入类似 ChatGPT 的长期学习对话。输入 `@` 或点击引用按钮，可像引用文件一样选择最多六道当前用户可见题目。所选题目会固定为“本对话范围”，直到学生移除引用或切换对话；后续追问继续沿用。存在引用时，Guide 只使用这些题目的公开目标、真实 attempt、评测、反思、可信事件和 Tutor 历史，过滤无关的活动 workspace、历史消息、课程目录和推荐。只有当前活动题目本身也在引用集合内时，才补充读取不含私有解法的实时环境证据。需要逐步排障时仍会引导学生转到能读取私有标准解法的 Workspace Tutor。
8. 提交报告、填写反思并提交评测。Oracle 独立决定客观 60 分，Pro 评分 Agent 使用同一全上下文评定过程 40 分；学生可查看时间线、证据引用、评分理由、能力变化和推荐。
9. 对评分提出申诉；课程教师可保留原评分或生成带来源的复评修订。

### 教师

1. 以课程教师身份从课程管理进入 `/teacher/courses?dojo=<course>&tab=questions` 统一课程工作台的题目管理区，无需第二套身份系统。兼容实现中该身份存储为 `DojoAdmins`；旧 `/dojo/<course>/studio` 与 `/teacher/courses/<course>/questions` 链接会重定向到统一入口。
2. 选择教学单元并输入教学目标、难度、类别和运行约束；界面不再要求教师预先选择复用、改编或新建。
3. 策略 Agent 先检索可导入题库，再综合教师要求、候选匹配度、运行约束和验证合约自动选择：
   - **L1**：目标与已有挑战高度一致，原样复用其运行与教学内容；
   - **L2**：存在可靠候选并保留原生运行/判题，只调整教学呈现；
   - **L3**：候选不足或要求新的运行/验证产物，创建自包含新题。
   教师只有在题目需求中明确写出“直接复用”“基于现有题改编”“从零新建”或 L1/L2/L3 时才覆盖 Agent 决策；客户端提交的隐藏 `level` 字段不参与选策。选策来源、理由、候选数和源题身份随任务持久化并显示在进度中。
4. `deepseek-v4-flash` 方案 Agent 理解教师输入和后续修改，冻结公开题目信息并形成教学、实现、产物、验证和风险控制方案。
5. `deepseek-v4-flash` 构建实现规格。L1/L2 的构建只允许调整公开教学元数据并审阅真实源题参考文件；平台在发布时复制源题目录，并原样保留其 `.init`、checker/flag、运行镜像、权限和接口，不生成 `verificationAnswer`、starter files、私有 Flag Gate 或第二套运行合约。L3 才由 Pro 单独生成最小自包含的 starter files、私有标准解法、声明式 `FLAG_GATE_V1` 和受限运行合约。自定义服务不得依赖联网安装或题目自定义环境变量注入，平台只允许 Python/Bash/Node 的受限启动方式。Flag Gate 的每个判定字段都必须通过 `liveBindings` 由私有检查器直接读取运行合约中已有服务的状态码、完整响应哈希或 JSON 字段，并具有非 `exists` 的具体目标值断言；学生自报的布尔值、结论或报告文件不参与客观判题。
6. 独立的 Pro 红队 Agent 逐项检查题面、全部文件、运行假设、Flag Gate 和标准解法；平台同时把依赖、语法、常见标准库属性错误、未支持的环境输入、路径、端口、缺失服务、未绑定状态字段等确定性诊断注入同一 finding 流，直接驱动后续修复。finding 带稳定 ID 及 `OPEN/RESOLVED` 状态；模型声称 PASS 但仍有开放中高风险项时，服务端会强制纠正为 BLOCK。
7. 确定性检查若发现自定义题缺少 starter file 或运行合约，先交给有严格大小、路径、依赖和端口边界的 Pro 最小闭环恢复 Agent；Flag Gate、运行合约或私有解法不一致时，交给不允许改动公开文件的 Pro 验证闭环 Agent。平台会强制同步 starter file 完整性清单，并阻止 status-only 弱判据、没有同名实时绑定的判定字段、过期文件路径，以及私有解法重新启动平台已经托管的服务。其余问题由 Pro 修复 Agent 应用可审计的精确文件差异并同步修复标准解法与合约。若局部补丁仍无法闭环，再整体重建四类耦合产物并重新红队复审。遗漏的旧 finding 会保守地继续保持 OPEN。
8. 草稿建立后不再等待教师点击“校验”。后台编排器立即运行独立 Pro 最终验证和全部确定性 Schema、运行时、Flag 条件、评分、路径、权限与供应链门禁；若出现 BLOCK，服务端把模型 finding 与确定性失败统一转换为修复输入，自动执行“修复—独立复验—完整发布门重跑”。每一轮验证、阻断数、修复周期、剩余 finding 和题包是否变化都会动态追加到任务进度。
9. 闭环最多执行五轮，防止模型或外部服务异常造成无限任务。通过时草稿直接进入 `VALIDATED`；安全上限内仍未收敛时保持不可发布，并保留草稿、全部轮次和最后阻断原因，而不是要求教师手工组织验证意见。教师主动提出内容修订时也创建同类后台任务，并重新自动选策和闭环验证。
10. 发布到所选教学单元后，学生从课程题目页启动它。再次修订并发布会保留题库发布项 ID、递增版本并生成新的不可变运行包；教师工作台同时提供题库、班级分析和申诉处理。
11. “已发布题目”中的删除操作只允许本课程教师执行，并使用页面内确认框明确影响范围。删除会在同一事务中移除本课程关联的 attempt、评分、模拟回放、推荐和解题 Agent 记录，保留原草稿供重新发布，并重建受影响学生的派生能力状态。若底层题目仍被其他课程引用，只解除当前课程关联；仅在没有任何课程引用时删除底层 CTFd challenge 及平台生成的版本目录。

教师也可将外部 JSON package 规范化为 L3 草稿，但 package 必须经过完全相同的安全验证和发布过程，不能直接写入运行目录。

## 工作区交互与重置

`/workspace` 是 Terminal、Code、Desktop、SSH 和自定义端口的唯一完整工作区页面。模块题目中内嵌工作区的 Terminal、Code 与 Desktop 按钮打开 `/workspace?service=<mode>`；自定义 Web 服务使用 `/workspace?port=<port>`。历史 `/workspace/<service>` 与 `/workspace/<port>` 只保留 308 兼容跳转，不再维护重复页面。

完整 Workspace 左侧栏按课程、教学单元和题目展示当前用户可见的发布内容，可以收起，也可以直接启动另一道未锁定题目；切题会替换当前运行容器，但保留 Home。左右侧栏的切换按钮始终锚定在各自外侧顶角，展开和收起时屏幕坐标不变，只切换图标和面板宽度。左侧展开态不再为按钮保留整列轨道，课程、单元和题目控件使用完整面板宽度。右侧 Tutor 与中央工作区同屏并可独立收起。模块题目页的内嵌工作区使用相同 Tutor 和操作栏组件；停止容器后，该题的大块内嵌工作区与 Tutor 会自动收起，回到题目手风琴的紧凑未启动形态。独立 `/workspace` 页面则保留停止状态和“重启”入口，不会把整个页面收起。

切换 Terminal、Code、Desktop 或自定义服务时，中央区域立即显示服务名称、加载动画和冷启动延迟提示，直到目标 iframe 完成加载；请求失败会保留可读错误状态。学生容器、三个内置服务与 SSH 都以 `/challenge` 为工作目录，VS Code URL 显式固定打开该目录，Desktop 的目录入口也固定到题目目录，避免默认界面展示无关文件树。Web 题不再把 43 字符 HMAC 暴露在日常地址中：首次加载由 `/w/<容器 ID>/auth/<HMAC>/<端口>/` 完成能力校验并写入仅属于该容器路径的 `Secure`、`HttpOnly`、`SameSite=Lax` Cookie，随后跳转到实际可访问的短地址 `/w/<容器 ID>/<端口>/`。这个短地址完整显示在操作栏中并保留复制按钮，学生可在同一浏览器中直接打开、复制或修改其后续路径；重启题目后容器 ID 改变，旧地址自然失效。远程 Workspace 节点暂时保留原签名路由作为兼容回退。

Desktop 的 noVNC 页面将物理键盘聚焦到其原生隐藏输入控件，使 Vimium 等扩展进入输入态；iframe 同时允许 noVNC 全屏，在支持的浏览器中全屏会请求 [Keyboard Lock](https://developer.chrome.com/articles/keyboard-lock)，以接收浏览器允许交给远程桌面的全部按键。Chrome 130 及以上版本首次使用 Keyboard Lock 时会显示浏览器权限请求，拒绝权限不会影响普通字母和文本输入。默认 workspace profile 为 `full`，包含 GCC/Clang、Vim/Neovim、GDB/GEF、Python/pwntools、Nmap/Wireshark、Burp Suite、IDA Free、Ghidra、Cutter/radare2 等编译、调试、Web、网络和逆向工具。显式设置 `DOJO_WORKSPACE=core` 仍可用于受限或最小化部署。

操作栏的“重启”不是重新连接 iframe：它会删除当前题目容器、结束其中的进程和临时修改，再以同一道题和相同权限模式创建新容器与 attempt epoch；只有持久的 `/home/hacker` 会保留。“停止”会删除当前题目容器并结束 attempt，同样保留 `/home/hacker`，停止后可直接点击“重启”再次创建。“重置”会在二次确认后删除整个持久 Home、销毁当前容器，并从题目初始状态创建全新容器与 attempt epoch；该操作不可撤销。重启、停止、重置和切换运行中题目均使用与玄甲深色/浅色主题一致的页面内确认框，不调用浏览器原生对话框。三个操作均使用可见文字标识，服务端记录对应生命周期证据。

## 发布门与生成包

验证覆盖：

- 标识、名称、描述、难度、学习目标与模块内唯一性；
- 运行镜像语法、源题可导入性与自定义脚手架完整性；
- 客观 60 / 过程 40 的 rubric 和 Tutor 防泄露策略；
- 起始文件的相对路径、保留文件名、大小与目录穿越；
- `FLAG_GATE_V1` 只接受私有检查器读取的实时状态字段和受限运算符；每个必需字段必须有同名只读 `liveBindings` 和非 `exists` 的具体目标值断言，且至少包含一个 `body_sha256` 或 `json_field` 强响应证据；
- `integrityFiles` 由平台按当前全部 starter files 强制同步，运行时再以发布时 SHA-256 校验，防止通过替换服务入口或实验材料伪造结果；
- 运行合约只能引用实际 starter file、受限解释器和非特权端口；
- 私有标准解法必须包含步骤和成功证据，供 Tutor 与 Grader 在服务端内部比对；对平台自动启动的服务只能观察和使用，不得建议再次手动启动；
- 镜像可变标签和特权模式风险提示；
- 对公开规范、运行/Flag Gate 合约、实现与私有标准解法共同计算内容摘要；旧式验证值只以 SHA-256 子摘要参与，package digest 不泄露私密值。

每次发布的运行物位于 `/var/dojos/.learning/<dojo>/<module>/<challenge-db-id>/v<version>/`，并作为标准 DOJO challenge 路径交给现有 workspace 编排器。L1/L2 会把被复用题目的运行目录复制成该版本自己的快照，并继续使用源题原生启动与 Flag 完成机制；它们不会获得模型生成的第二套 Flag Gate 或运行合约。旧题需要 Tutor/Grader 私有参考时，Pro 会在学生启动该固定版本后，根据实际快照、原生验证器和实时容器生成并缓存。L3 生成只读实验材料、平台拥有的 `.init` / `runtime-launcher.py` 和私有 Flag Gate 服务。学生完成题目目标后运行公共 `/challenge/check` 获取当前环境的动态 Flag，再把 Flag 提交到平台；不创建 `solution.json`，也不提交 JSON 报告。教师手工题若使用确定性答案，则由私有哈希门禁校验 `/challenge/check <答案>`，成功后同样只返回动态 Flag。受限解释器只执行声明式状态断言，不执行模型生成的 Checker 代码。包含期望条件、实时探测和动态 Flag 访问能力的 `check-server.py` 在发布包中为 `0700`，启动时再次强制归属 `root:root` 和 `0700`，学生不可读取。私有检查器会向运行合约声明的原始本地服务重新发起受限 GET 请求，核对实时响应、全部 starter file 的发布时哈希，以及 root 所持有的服务进程记录中的 PID、启动时间、UID 和入口文件。运行启动器只向降权后的 `hacker` 子进程传递固定最小环境，在 `/run/dojo-learning-service-pids.json` 以 `0600` 保存可信进程记录，不继承平台密钥。定性解释、推理质量和工具选择属于过程 40 分 Grader，不用可猜测的 `exists` 字段冒充客观完成条件。删除或更新源课程不会破坏已发布版本，私有验证条件也不会进入公开题面或 starter files。数据库中的挑战身份保持稳定，profile 按版本保存运行包路径、私有解法、实现、Flag Gate 和运行合约；attempt 在启动时固定 `challengeVersion`，Tutor/Grader 后续始终读取该版本而不是教师后来发布的版本。删除课程会同时删除该课程精确对应的全部版本目录。

历史 `GENERATED_REPORT_JSON_V1` 题包不会进入 L1/L2 复用候选，也不能通过新的发布门；需要重新生成并发布为动态 Flag 版本。已经开始的旧 attempt 仍固定在其不可变历史版本，避免运行中途改变判题协议。

## Attempt、证据与可信度

每次启动挑战都会创建或切换 `LearningAttempts` epoch。事件包含严格递增序号、前一事件哈希和本事件哈希：

```text
event_hash = SHA256(attempt_id + sequence + event_type + source +
                    trust_level + canonical_payload + previous_hash)
```

读取 attempt 时会重新验证整条链；插入事件使用数据库锁和唯一约束保护序号。信任等级为：

| 等级 | 含义 | 示例 |
| --- | --- | --- |
| S1 | 学生陈述 | 手工里程碑或低可信客户端信息 |
| S2 | 已认证 Workspace / Tutor | 命令结果、Tutor 交互 |
| S3 | DOJO 服务端状态 | runtime 生命周期、反思提交 |
| S4 | 确定性 Oracle | 动态 flag 成功或失败 |

Workspace API 只接受 allowlist 内的事件类型。命令和 payload 会递归脱敏密码、token、cookie、authorization、API key、私钥、动态 flag 和常见凭据模式，并限制键数、文本长度和嵌套深度。对外响应不返回题目私有验证值。

`dojo evidence` 是 workspace 内部命令；Bash profile 自动采集命令与退出码。内部 HTTP 代理只允许 Docker 私网访问，公网/LAN 请求会被拒绝，因而无需在 workspace 中绕过本地自签名 TLS。生产环境仍使用正常 HTTPS 入口。

## Guide、Tutor 与评分 Agent 上下文

Guide 使用 `deepseek-v4-flash`，以线程形式保存连续对话。没有题目引用时，每轮请求构建有界的整体学习档案：已加入课程及模块/题目进度、Submission 数、最近 attempt 和反思、最新评分反馈、六维能力以及推荐；“这道题”等无法唯一定位的提问不会根据最近活动自动猜题，而会要求学生先引用题目。学生显式引用最多六道可见题目后，服务端不信任客户端标签，而是用稳定的课程/单元/题目标识重新做可见性校验，并将引用持久化为该线程的题目范围。模型上下文只保留引用题目的课程目录、attempt、最新评测、反思、可信事件和 Tutor 对话；与引用无关的活动 workspace 和历史轮次会被移除。修复前生成、没有 `scopeValidation` 的历史助手消息也不会进入新的引用轮次，并在界面明确标成未校验历史回答。若活动 workspace 恰好属于引用集合，才补充其容器状态、进程、监听端口、文件路径与变化及最近过程事件。多题引用时模型必须比较共同薄弱点与差异，证据不足时必须明确说明。模型响应还必须回报完整的引用标识、点名全部引用题目，并通过未引用题目名称检查；范围不一致的输出会被服务端拦截并替换为范围安全回答。无效或已失去权限的引用直接返回 400，不会静默降级为另一题。模型只能返回当前范围档案中已有的站内链接。若问题进入具体解法，Guide 会引导学生转到 Workspace Tutor。Guide 页面将当前范围明确显示为“整体学习记录”或“本对话题目”，引用 chip 在发送后持续保留；页面同时取消 CTFd 通用 Footer 预留的 100px 底部边距，使消息区占满剩余高度、输入区贴合视口底部，移动端对话列表以覆盖层展开。

Tutor 不再暴露或执行 L1/L2/L3 引导等级。侧栏只用一个紧凑状态元素显示“正在检查 Tutor”“Tutor 已就绪”或“Tutor 未就绪”，状态直接来自当前活动 attempt 是否可用，不再用上一条回答的 `liveContext` 元数据推断并显示容易误解的“容器待就绪”。每次问答都采用同一个提示模式：先比较私有标准解法所需状态与学生实时状态，再准确指出已经完成的观察、当前误区和一个最小验证动作；不会给出可直接照抄的完整命令、载荷、步骤链或最终答案。它使用 `deepseek-v4-flash`，上下文按 attempt 的 `challengeVersion` 固定，包括该版本完整公开题面与发布时基线文件、实时 `/challenge` 文件、容器镜像/工作目录、脱敏环境、进程、监听端口、资源、Git 变化、当前 epoch 哈希证据链、Tutor 历史和同版本服务端私有标准解法。发布前遗留且没有 profile 元数据的题目明确按兼容版本 1 绑定；没有作者解法的旧题会由 `deepseek-v4-flash` 生成并缓存私有参考。

教师工作台的“生成已验证步骤”使用独立的 `deepseek-v4-flash` 解题 Agent，而不是让模型编写想象中的答案。平台为每个运行创建隐藏的临时学习者和隔离 Kata 容器，固定为 `hacker`（uid 1000）及 `/challenge` 工作目录；Agent 只能使用题面和学习者可见入口，策略拒绝直接读取 `/flag`、私有 checker、平台运行时、进程环境、提权及容器控制。只有输出中出现可反序列化、同时绑定临时账号和当前 challenge 的动态 Flag 才标记 VERIFIED。随后 Pro 只能把每条真实允许命令按原顺序映射为教师步骤；若映射不完整或不合法则回退到同一条真实轨迹，Flag 始终以 `[VERIFIED_FLAG_CAPTURED]` 脱敏。临时容器和用户会在运行结束后删除。

评分 Agent 使用 `deepseek-v4-flash` 和与 Tutor 相同的完整上下文，并额外读取学生反思和 Oracle 结果。它只能分配过程 40 分，分数上限和客观 60 分由服务端强制锁定；加分必须引用存在的事件 sequence 或经过脱敏的具体容器证据。总评、单项理由、容器证据摘要和能力说明全部经过同一防泄露检查。

正确 Flag 或“已完成”响应继续使用非阻塞横幅/题目卡片提示，并附带“查看评分”按钮。按钮优先进入该用户在本题最近一次 `SOLVED` attempt 的独立评分页；若尚无已完成记录，则回退到最近 attempt，便于检查正在形成的客观证据。评分页展示总分、客观结果 60 分、可信过程 40 分、证据可信度、每项评分理由和引用、六维能力、学生复盘及可信事件时间线，并提供返回题目和课程学习分析的入口。学生只能查看自己的 attempt，课程教师可查看本课程学生的评分页。

题面、文件、命令输出、历史消息和反思在所有 Agent 提示中都被声明为不可信数据。模型响应再次递归脱敏，并与私有 `protectedFacts`、动态验证值和声明式 Oracle 的非公开期望值做字面量比较；包含 flag、验证答案、认证信息、私有解法或完整最终载荷的 Tutor 回答会先触发一次不含私有参考的安全重写，仍不安全才回退；Guide/Grader 使用安全本地文本。provider、模型、上下文摘要、实时容器可用性、参考解法来源和安全拦截状态都会持久化，便于审计。

## 消息提示交互约定

学生及普通管理流程沿用 pwn.college 的非阻塞提示方式：Workspace 状态、重启/停止/重置结果和 Flag 提交结果使用操作栏横幅或题目卡片内的 Bootstrap alert；Tutor、Guide、学习分析、课程及设置结果在当前页面内显示。操作栏横幅设置 `pointer-events: none`，显示期间不得拦截后续点击。只有停止、删除、彻底重置、切换运行中题目等确实需要用户决策的操作才显示统一的玄甲页面内确认框；普通用户脚本不得调用浏览器原生 `window.confirm`、`window.prompt` 或 `window.alert`。Flag 输入在成功、错误、异常和 30 秒超时后都必须恢复，且同一输入不得并发重复提交。

`AISecEduUI.notify` 用于无需打断当前操作的短暂状态反馈，并按成功、警告和失败使用一致的语义颜色；不得把通知自动提升成模态窗口。`AISecEduUI.dialog` 仅用于教师题目管理中的明确结果复核，其他决策继续使用统一的确认接口。不得全局监听或隐藏 `.alert`。部署验证会检查原生阻塞弹窗和模态框边界，真实浏览器 smoke 会检查 Tutor 内联提示、Workspace 横幅以及提示显示期间的可交互性。

## 60/40 评测和六维能力

评测总分为 100：

- **60 分客观结果**：只有 S4 动态 flag Oracle 成功才授予；
- **40 分可信过程**：Pro 评分 Agent 在固定上限内评定建立基线 8、假设验证 12、证据与修复说明 8、调试调整 6、安全边界 4、独立性 2；模型不可修改 criterion ID 或上限，无有效证据时不能高于确定性基线。

Flag API 的关键路径只执行 Oracle 和本地确定性基线，不调用外部模型；Pro 过程评分只在学生显式提交反思、教师复评或申诉复评时运行。这样 Flag 正误会立即返回，不受模型推理时长或出站网络波动影响。

每个 criterion 返回得分、上限、依据事件和可解释原因。评测保存当时的完整证据回放、哈希链状态、规则版本和来源。重复评测产生不可覆盖的 revision；教师复评和申诉复评明确标记来源。同一 attempt 的修订会重算该次能力贡献，但不会把它伪装成多次学习证据。

系统把结果映射到六维能力：环境侦察、技术推理、工具编排、调试与调整、方案验证、安全与独立性。能力值按已有证据量增量更新，同时保存 mastery、confidence 和 evidence count。推荐器优先选择尚未完成且能补足薄弱维度、难度与当前掌握度相邻的挑战；推荐理由和能力快照会持久化，便于解释。

## DeepSeek 模型配置

平台通过 DeepSeek 官方 OpenAI-compatible Chat Completions API 接入模型。`DOJO_AI_ENABLED=auto` 时，有可用 key 就启用、没有 key 就安全回退；也可显式设置为 `true` 或 `false`。在 `/data/config.env` 配置：

```dotenv
DOJO_AI_ENABLED=auto
DOJO_AI_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=replace-with-secret
DOJO_AI_GUIDE_MODEL=deepseek-v4-flash
DOJO_AI_TUTOR_MODEL=deepseek-v4-flash
DOJO_AI_GRADER_MODEL=deepseek-v4-flash
DOJO_AI_SOLUTION_MODEL=deepseek-v4-flash
DOJO_AI_AUTHORING_PLAN_MODEL=deepseek-v4-flash
DOJO_AI_AUTHORING_BUILD_MODEL=deepseek-v4-flash
DOJO_AI_AUTHORING_VALIDATE_MODEL=deepseek-v4-flash
DOJO_AI_TIMEOUT_SECONDS=120
DOJO_AI_MAX_CONTEXT_CHARS=180000
DOJO_AI_MAX_FILE_CHARS=32000
```

`DOJO_AI_API_KEY` 仍作为 `DEEPSEEK_API_KEY` 的兼容别名，但新部署应使用后者。Guide、Tutor 和方案 Agent 关闭思考模式以降低交互延迟；构建、私有解法、修复、红队、最终验证和评分使用 Pro 思考模式，并按任务设置 `high` 或 `max`。所有请求都设置 `response_format={"type":"json_object"}`，不会保存或对外返回模型的思考内容。无效或截断 JSON 会带更严格的紧凑 JSON 指令重试；确认为输出长度不足时只提高该次重试上限。实现采用 DeepSeek 官方列出的模型标识、基址、思考模式和 JSON Output 参数：

- [DeepSeek API 快速开始](https://api-docs.deepseek.com/quick_start/pricing-details-usd/)
- [DeepSeek V4 模型列表](https://api-docs.deepseek.com/api/list-models)
- [思考模式](https://api-docs.deepseek.com/guides/thinking_mode)
- [JSON Output](https://api-docs.deepseek.com/guides/json_mode)

应用只调用 `${DOJO_AI_BASE_URL}/chat/completions`。修改后同步并重启共享同一配置的 CTFd 服务：

```bash
docker exec pwncollege-dojo dojo sync
docker exec pwncollege-dojo dojo compose restart ctfd stats-worker image-pull-worker
```

不要把 key 写入 Git、公开题目 package 或 starter files。方案、规格和公开产物 Agent 的请求会排除验证答案、动态秘密和认证信息；只有受信任的红队、最终验证、Tutor/Grader 私有上下文可以在服务端边界内读取验证合约与标准解法。模型输出不能覆盖稳定身份、动态 flag、rubric、Tutor 策略或特权边界。模型超时、错误或无效 JSON 会留下具体阶段的 `MODEL_FALLBACK` 状态；Tutor/Guide 回退到本地引导，评分回退到确定性过程基线，出题的未解决 finding 或最终门禁仍会阻止发布。

## 数据模型

学习域只新增表，不修改 CTFd 或 DOJO 现有表的列：

| 表 | 用途 |
| --- | --- |
| `learning_challenge_profiles` | 已发布挑战的目标、类别、难度、rubric、策略、package 与 digest |
| `learning_drafts` | 教师多轮草稿、候选、修订和发布状态 |
| `learning_attempts` | 用户、课程挑战、epoch、状态及分数摘要 |
| `learning_evidence_events` | 有序、脱敏、哈希链接的证据 |
| `learning_tutor_messages` | Tutor 问答、统一模式和 provider 元数据 |
| `learning_guide_threads` | Guide 对话线程、学习档案摘要和更新时间 |
| `learning_guide_messages` | Guide 连续问答、模型/上下文摘要与安全动作 |
| `learning_assessments` | 60/40 criteria、能力、时间线和 revision |
| `learning_appeals` | 学生申诉与教师处置 |
| `learning_skill_states` | 课程内六维 mastery、confidence 与证据量 |
| `learning_recommendations` | 排序结果、理由与生成时快照 |
| `learning_audit_events` | 出题、发布和申诉等敏感操作审计 |

外键通过 `CASCADE` 或 `SET NULL` 跟随原生用户、课程和挑战生命周期。插件启动沿用 DOJO 现有 `db.create_all()` 机制创建缺失表，因此从旧版升级是加法迁移；上线前仍必须备份 PostgreSQL。

## API

所有接口位于 `/pwncollege_api/v1/learning`，使用现有 CTFd session、CSRF 和 dojo 角色检查：

| 方法与路径 | 权限与用途 |
| --- | --- |
| `GET /overview` | 当前用户的已加入/可加入课程、教学单元、题库发布项、Submission/Solve 汇总、下一题和活动 attempt |
| `POST /pwncollege_api/v1/dojos/<course>/enrollment` | 当前用户加入一门可见课程；幂等创建 `DojoMembers` 关系 |
| `POST /pwncollege_api/v1/dojos/enrollment/code` | 学生使用 8 位课程码加入对应课程；输入不区分大小写并允许连字符，重复加入保持幂等 |
| `POST /pwncollege_api/v1/teaching/courses/<course>/join-code` | 授课教师读取或生成课程码，也可显式更换课程码使旧码立即失效 |
| `GET /dojos/<dojo>/dashboard` | 学生进度、能力、推荐和历史 |
| `GET /dojos/<dojo>/catalog` | 可见题库与学习档案 |
| `DELETE /dojos/<dojo>/catalog/<module>/<challenge>` | 课程教师删除本课程题目及其关联学习记录 |
| `POST /dojos/<dojo>/authoring` | 兼容接口：自动选策、创建并自主验证草稿 |
| `GET/POST /dojos/<dojo>/authoring/jobs` | 列出或启动可观察的后台出题闭环任务 |
| `GET /authoring/jobs/<job-id>` | 查看选策、验证、修复和复验的实时轮次进度 |
| `POST /drafts/<id>/authoring/jobs` | 对教师主动修订启动同一套后台自主闭环 |
| `POST /dojos/<dojo>/imports` | 课程管理员规范化外部 package 并自主验证 |
| `GET/POST /drafts/<id>` | 读取或多轮修订草稿 |
| `POST /drafts/<id>/validate` | 兼容接口：启动同步的验证—修复—复验闭环 |
| `POST /drafts/<id>/publish` | 发布为原生挑战 |
| `GET /attempts/current` | 当前 workspace attempt 与证据 |
| `GET/POST /attempts/<id>` | 回放、反思和提交评测 |
| `POST /attempts/<id>/assess` | 学生评测或教师复评 |
| `GET /learning/scores/latest/<challenge-id>` | 跳转到当前用户该题最近一次作答的评分页 |
| `GET /learning/attempts/<attempt-id>/score` | 查看本次作答的总分、评分明细、六维能力、复盘和可信证据 |
| `POST /tutor` | 当前 epoch 统一提示式 Tutor |
| `GET/POST /guide` | 读取 Guide 会话、可引用题目与学习摘要，或携带经服务端校验的多题引用继续问答 |
| `POST /guide/threads` | 新建 Guide 对话线程 |
| `DELETE /guide/threads/<id>` | 删除当前用户自己的 Guide 线程 |
| `POST /evidence` | 认证 workspace CLI 上报 allowlist 事件 |
| `POST /assessments/<id>/appeals` | 学生申诉 |
| `GET /dojos/<dojo>/appeals` | 课程管理员查看申诉 |
| `PATCH /appeals/<id>` | 课程管理员处置和可选复评 |
| `GET /dojos/<dojo>/analytics` | 课程管理员查看教学分析 |

容器完全重置使用现有 Docker API 边界中的 `POST /pwncollege_api/v1/docker/reset`。该接口要求登录、持有当前运行题目并取得用户级 Docker 锁，不接受客户端指定其他用户或题目。

## 升级、备份和回退

部署前：

```bash
docker exec pwncollege-dojo dojo backup
docker exec pwncollege-dojo dojo compose ps
```

同步后重启 CTFd；修改 Nginx 时重建 Nginx，修改 `workspace/core/` 时重建 Nix workspace profile：

```bash
docker exec pwncollege-dojo dojo sync
docker exec pwncollege-dojo dojo compose restart ctfd stats-worker image-pull-worker
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose up -d --no-build nginx
docker exec pwncollege-dojo dojo compose up workspace-builder
```

学习表是加法数据，代码回退不会自动删除它们。旧代码会忽略这些表；如确需物理删除，先保留备份，并在独立维护窗口显式处理，不要直接删除共享 PostgreSQL volume。生成题包位于持久化 `/data/dojos/.learning` 映射内，也应随数据备份。

## 验收

```bash
docker exec pwncollege-dojo dojo compose build nginx
docker exec pwncollege-dojo dojo compose exec -T ctfd env PYTHONPYCACHEPREFIX=/tmp/aisecedu-pycache python -m compileall -q /opt/CTFd/CTFd/plugins/dojo_plugin
docker exec pwncollege-dojo nginx -t
./ops/verify-local.sh
./ops/verify-guide-references.py
./ops/verify-container-context-real.py
./ops/verify-source-authoring-real.py
./ops/verify-learning-flow.py
./ops/verify-solution-agent-real.py
```

自动化测试位于 `test/test_learning.py`。`ops/verify-ai-routing.py` 在无外部调用条件下验证模型路由、请求参数、Guide 引用上下文、秘密边界、源题原生运行语义、审查状态机、确定性修复信号和无 key 降级；`ops/verify-guide-references.py` 在真实部署数据库中以当前可见题目验证引用目录、attempt、评测、过程事件和权限边界；`ops/verify-container-context-real.py` 创建一次性原生题与 Kata 工作区，验证平台工具不受题目 `PATH` 干扰、登录 profile 不污染机器可读输出，并能在不跟随符号链接的前提下有界读取 `/challenge` 挂载文件；`ops/verify-source-authoring-real.py` 使用部署密钥创建一次性课程，真实验证 L1/L2 的 Flash 方案、Pro 构建/预审/终审、无第二判题协议的源包快照、发布，以及 Flash Tutor 对基线、实时容器、学生证据和固定版本的联合使用与完整清理；`ops/verify-solution-agent-real.py` 创建一次性公开握手题，要求真实 `deepseek-v4-flash` 在隔离学习者容器内取得账号/题目绑定的动态 Flag，并验证脱敏、策略边界和逐 turn 教师步骤映射；`ops/evaluate-ai-agents.py` 使用真实 DeepSeek API 对 Guide 多轮对话、Tutor、Grader 和完整出题链做独立 Pro 质量评分。完整流程验证器还验证单点身份与角色越权边界、L1/L2 源包快照、L3 无源生成、稳定身份上的两版不可变发布、发布门、真实 workspace、完全重置容器与 Home、新 epoch、Nix CLI 自动证据、脱敏与哈希链、当前 epoch Tutor、动态 flag、60/40 评分、六维能力、申诉复评、教师分析和完整清理。
