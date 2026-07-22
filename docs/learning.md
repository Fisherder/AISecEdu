# AISecEdu 智能学习与证据评测

AISecEdu 把智能教学能力直接实现于现有课程、题目与工作区边界内，而不是在旁边部署另一套服务。本页描述设计边界、角色流程、数据、API、安全约束和运维方法。

## 一体化原则

系统中的用户、教师权限、课程、模块、题目、工作区、flag、学习证据与评分共享同一个事务和权限边界：

```text
AISecEdu dojo_theme（Jinja / Bootstrap）
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

没有单独的 FastAPI、自研 Next.js 学生站、Go terminal gateway、第二身份系统或第二数据库。主域是唯一规范 Web 入口，直接由 CTFd 与 AISecEdu `dojo_theme` 提供学生、课程、Workspace、认证和管理页面。`/dojos`、`/<course>`、`/<course>/<unit>` 与题目手风琴采用课程 → 单元 → 题目的信息架构；学习中心、课程分析、教师工作台和 Tutor 复用同一 `base.html`、导航、卡片、学习状态、表格、Tab 和侧栏。`future.<host>` 只做 308 兼容跳转。模型服务是可选的出站增强依赖，不拥有业务状态，也不参与 flag 判定。

## 功能映射

| 对外领域概念 | 唯一事实源 | 平台中的含义 |
| --- | --- | --- |
| 课程 | `Dojos` 与 `DojoUsers` | 一门可加入、可授课、可统计进度的课程；`DojoAdmins` 表示课程教师，`DojoMembers` 表示已加入学生 |
| 教学单元 | `DojoModules` | 课程内有序的教学内容容器 |
| 题库发布项 | `DojoChallenges` | 底层 CTFd `Challenge` 在课程单元中的发布关系；发布关系决定名称、必做性、顺序、可见性与版本档案 |
| 作答结果 | CTFd `Submissions` / `Solves` | 每次提交形成 `Submission`，首次正确完成形成 `Solve`；学习概览按课程聚合两者 |
| 学生与教师身份 | CTFd 用户与同一 session | 平台管理员或课程 `DojoAdmin` 进入教师工作台，其他已加入成员使用学生视图 |
| 题库与版本 | 稳定的 `DojoChallenges` 身份 + 不可变运行包版本 | 草稿修订与发布历史分别持久化 |
| L1/L2/L3 智能出题 | `LearningDrafts`、候选题与不可变运行包 | 复用现有题、改编现有题或生成独立题目包 |
| 实验环境 | 现有 Kata/Docker workspace | 每个作答环境隔离启动，不另建实验编排器 |
| Terminal/IDE/Desktop/SSH | 现有 Workspace 页面和服务 | 围绕当前题目提供统一实验入口 |
| Tutor 3.0 | `LearningTutorMessages` 与当前 attempt/epoch | 给出统一提示式、防答案泄露的过程引导 |
| 过程证据 | `LearningEvidenceEvents` | Workspace CLI、运行时事件、Tutor、反思和答案判定形成统一时间线 |
| 评分与复核 | `LearningAssessments` / `LearningAppeals` | 确定性 60/40 评测、修订版本、申诉与教师复评 |
| 自适应学习 | `LearningSkillStates` / `LearningRecommendations` | 六维能力状态、置信度和下一题推荐 |
| 教师分析 | 课程教师 API 与教师工作台 | 汇总参与者、attempt、得分、进度、能力与申诉 |

## 角色流程

### 学生

1. 从 `/dojos` 的分组卡片进入课程；`/<course>` 依次展示简介、学习状态、单元与学生排行榜。
2. 从单元卡片进入 `/<course>/<unit>`，按资源/题目手风琴阅读内容和启动工作区。
3. 在 `/learning` 查看跨课程学习概览，在 `/dojo/<course>/learning` 查看单门课程进度、六维能力、推荐题与历史 attempt。
4. 启动题目会创建新的 attempt epoch；切题、重启或停止会结束旧 epoch，避免证据串线。
5. 在 Terminal、Code、Desktop 或 SSH 中完成实验。交互式 Bash 会通过 `dojo evidence` 静默异步上报唯一命令及退出状态，不在终端显示后台作业记录。
6. 从 Workspace 右侧可收起 Tutor 直接提问；模块题目中展开的内嵌工作区也提供相同右侧栏。Tutor 使用统一的委婉提示模式，只读取当前 epoch 的公开题面和脱敏可信证据。
7. 提交答案凭证、填写反思并提交评测，查看时间线、评分理由、能力变化和推荐。
8. 对评分提出申诉；课程教师可保留原评分或生成带来源的复评修订。

### 教师

1. 以课程教师身份进入 `/dojo/<course>/studio`，无需第二套身份系统。兼容实现中该身份存储为 `DojoAdmins`。
2. 选择教学单元并输入教学目标、难度、类别和运行约束。
3. 选择出题层级：
   - **L1**：从可导入题库检索并复用最匹配的已有挑战；
   - **L2**：以已有挑战为运行基础，修改教学描述、目标与策略；
   - **L3**：创建独立挑战标识、运行文件、动态验证逻辑和评分档案，不隐式依赖候选题。
4. 通过对话继续修订。启用模型时使用模型生成受限字段；请求失败、关闭或输出无效时回退到确定性生成器。
5. 运行发布门。任何 `BLOCK` 都禁止发布；可变镜像标签和特权模式产生需人工复核的 `WARN`。
6. 发布到所选教学单元后，学生从课程题目页启动它。再次修订并发布会保留题库发布项 ID、递增版本并生成新的不可变运行包；教师工作台同时提供题库、班级分析和申诉处理。

教师也可将外部 JSON package 规范化为 L3 草稿，但 package 必须经过完全相同的安全验证和发布过程，不能直接写入运行目录。

## 工作区交互与重置

`/workspace` 是 Terminal、Code、Desktop、SSH 和自定义端口的唯一完整工作区页面。模块题目中内嵌工作区的 Terminal、Code 与 Desktop 按钮打开 `/workspace?service=<mode>`；自定义 Web 服务使用 `/workspace?port=<port>`。历史 `/workspace/<service>` 与 `/workspace/<port>` 只保留 308 兼容跳转，不再维护重复页面。

完整 Workspace 左侧栏按课程、教学单元和题目展示当前用户可见的发布内容，可以收起，也可以直接启动另一道未锁定题目；切题会替换当前运行容器，但保留 Home。右侧 Tutor 与中央工作区同屏并可独立收起。模块题目页的内嵌工作区使用相同 Tutor 和操作栏组件。

切换 Terminal、Code、Desktop 或自定义服务时，中央区域立即显示服务名称、加载动画和冷启动延迟提示，直到目标 iframe 完成加载；请求失败会保留可读错误状态。学生容器、三个内置服务与 SSH 都以 `/challenge` 为工作目录，VS Code URL 显式固定打开该目录，Desktop 的目录入口也固定到题目目录，避免默认界面展示无关文件树。

Desktop 的 noVNC 页面将物理键盘聚焦到其原生隐藏输入控件，使 Vimium 等扩展进入输入态；iframe 同时允许 noVNC 全屏，在支持的浏览器中全屏会请求 [Keyboard Lock](https://developer.chrome.com/articles/keyboard-lock)，以接收浏览器允许交给远程桌面的全部按键。Chrome 130 及以上版本首次使用 Keyboard Lock 时会显示浏览器权限请求，拒绝权限不会影响普通字母和文本输入。默认 workspace profile 为 `full`，包含 GCC/Clang、Vim/Neovim、GDB/GEF、Python/pwntools、Nmap/Wireshark、Burp Suite、IDA Free、Ghidra、Cutter/radare2 等编译、调试、Web、网络和逆向工具。显式设置 `DOJO_WORKSPACE=core` 仍可用于受限或最小化部署。

普通 Restart 只重建题目容器并保留 `/home/hacker`。显式的 Reset 会在二次确认后删除整个持久 Home、销毁当前容器，并以同一道题和相同权限模式创建全新容器与 attempt epoch；该操作不可撤销，用于恢复到题目原始状态。服务端同时写入重置审计证据。

## 发布门与生成包

验证覆盖：

- 标识、名称、描述、难度、学习目标与模块内唯一性；
- 运行镜像语法、源题可导入性与自定义脚手架完整性；
- 客观 60 / 过程 40 的 rubric 和 Tutor 防泄露策略；
- 起始文件的相对路径、保留文件名、大小与目录穿越；
- 镜像可变标签和特权模式风险提示；
- 对不含私密答案的公共规范计算 SHA-256 package digest。

每次发布的运行物位于 `/var/dojos/.learning/<dojo>/<module>/<challenge-db-id>/v<version>/`，并作为标准 DOJO challenge 路径交给现有 workspace 编排器。L1/L2 会把被复用题目的运行目录复制成该版本自己的快照，L3 则生成只读实验材料、动态验证程序和启动脚本；因此删除或更新源课程不会破坏已发布版本。数据库中的挑战身份保持稳定，profile 保存当前 digest 和历史版本元数据，attempt 在启动时固定 `challengeVersion`。删除课程会同时删除该课程精确对应的全部版本目录。

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

## Tutor 防泄露策略

Tutor 不再暴露或执行 L1/L2/L3 引导等级。每次问答都采用同一个提示模式：先回应学习者的问题，再委婉指出下一项值得思考的假设、可以进行的最小验证动作，或可能适用的工具；不会给出可直接照抄的完整命令、载荷、步骤链或最终答案。

模型仅获得当前 epoch 最近的 S2 以上脱敏事件、公开题面、目标和统一策略。响应再次经过敏感模式检查；包含 flag、最终答案、动态秘密、教师解法或认证信息时直接丢弃并使用本地安全答复。全部问答及 provider/fallback 状态进入证据时间线和审计数据。

## 60/40 评测和六维能力

评测总分为 100：

- **60 分客观结果**：只有 S4 动态 flag Oracle 成功才授予；
- **40 分可信过程**：建立基线 8、假设验证 12、证据与修复说明 8、调试调整 6、安全边界 4、独立性 2。

每个 criterion 返回得分、上限、依据事件和可解释原因。评测保存当时的完整证据回放、哈希链状态、规则版本和来源。重复评测产生不可覆盖的 revision；教师复评和申诉复评明确标记来源。同一 attempt 的修订会重算该次能力贡献，但不会把它伪装成多次学习证据。

系统把结果映射到六维能力：环境侦察、技术推理、工具编排、调试与调整、方案验证、安全与独立性。能力值按已有证据量增量更新，同时保存 mastery、confidence 和 evidence count。推荐器优先选择尚未完成且能补足薄弱维度、难度与当前掌握度相邻的挑战；推荐理由和能力快照会持久化，便于解释。

## 可选模型配置

默认 `DOJO_AI_ENABLED=false`，无需网络或 API key 即可使用全部核心流程。在 `/data/config.env` 配置 OpenAI-compatible 服务：

```dotenv
DOJO_AI_ENABLED=true
DOJO_AI_BASE_URL=https://api.openai.com/v1
DOJO_AI_API_KEY=replace-with-secret
DOJO_AI_MODEL=gpt-4o-mini
DOJO_AI_TIMEOUT_SECONDS=30
```

应用只调用 `${DOJO_AI_BASE_URL}/chat/completions` 并要求 JSON object。修改后同步并重启共享同一配置的 CTFd workers：

```bash
docker exec pwncollege-dojo dojo sync
docker exec pwncollege-dojo dojo compose restart ctfd stats-worker image-pull-worker
```

不要把 key 写入 Git、题目 package 或 starter files。模型超时和错误不会阻塞核心流程：出题回退到确定性规范，Tutor 回退到本地引导，评分始终保持确定性。

## 数据模型

学习域只新增表，不修改 CTFd 或 DOJO 现有表的列：

| 表 | 用途 |
| --- | --- |
| `learning_challenge_profiles` | 已发布挑战的目标、类别、难度、rubric、策略、package 与 digest |
| `learning_drafts` | 教师多轮草稿、候选、修订和发布状态 |
| `learning_attempts` | 用户、课程挑战、epoch、状态及分数摘要 |
| `learning_evidence_events` | 有序、脱敏、哈希链接的证据 |
| `learning_tutor_messages` | Tutor 问答、统一模式和 provider 元数据 |
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
| `GET /dojos/<dojo>/dashboard` | 学生进度、能力、推荐和历史 |
| `GET /dojos/<dojo>/catalog` | 可见题库与学习档案 |
| `POST /dojos/<dojo>/authoring` | 课程管理员创建草稿 |
| `POST /dojos/<dojo>/imports` | 课程管理员规范化外部 package |
| `GET/POST /drafts/<id>` | 读取或多轮修订草稿 |
| `POST /drafts/<id>/validate` | 执行发布门 |
| `POST /drafts/<id>/publish` | 发布为原生挑战 |
| `GET /attempts/current` | 当前 workspace attempt 与证据 |
| `GET/POST /attempts/<id>` | 回放、反思和提交评测 |
| `POST /attempts/<id>/assess` | 学生评测或教师复评 |
| `POST /tutor` | 当前 epoch 统一提示式 Tutor |
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
./ops/verify-learning-flow.py
```

自动化测试位于 `test/test_learning.py`。真实流程验证器除基础设施外，还验证单点身份与角色越权边界、L1/L2 源包快照、L3 无源生成、稳定身份上的两版不可变发布、发布门、真实 workspace、完全重置容器与 Home、新 epoch、Nix CLI 自动证据、脱敏与哈希链、当前 epoch Tutor、动态 flag、60/40 评分、六维能力、申诉复评、教师分析和完整清理。
