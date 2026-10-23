# 学情与 AI 助手接入客户机实时进度（2026-09-21）

## 问题

Windows 2000 这类远程桌面题目没有终端命令事件：学生在客户机里用 OllyDbg 改文件，平台侧只能看到
"环境已启动"和最终的 flag 提交。结果是：

- 旁边的 AI 学习助手只会说"轨迹里没有终端命令、没有文件改动"，即使学生已经改好了 demo.exe；
- 学情分析里的过程证据、活动进度、卡点判断同样缺一段，教师看不到学生正在做到哪一步。

## 方案

客户机内部探针 + 平台侧学习证据 + 学情/AI 上下文三处打通。

### 1. 客户机内部探针

`output/win2000/image/progress-probe.py`：容器内的常驻进程，每 20 秒通过原生客户机代理
（COM2 / environment.sock）执行一次客户机内自检，并写出
`/var/lib/windows-lab/guest-progress.json`：

- `probeMask` 位掩码：demo.exe / method1.exe / method2.exe 是否与原始文件不再一致、C:\Lab\flag.txt 是否存在
- `workCopies`、`observations`、`notYetDone`、`summary`：同一事实的结构化与自然语言形式
- `ready`、`os`、`ollydbgPresent` 等环境事实

客户机内自检脚本用客户机自带的 Python 2.7 做逐字节比较。注意 **客户机的 `fc /b` 在这套环境里
会漏报差异**（实测两文件明显不同仍返回 0），这也是探针最终改用 Python 比较的原因。

探针每轮单独建立并关闭代理连接：QEMU 的串口 chardev 同一时刻只服务一个客户端，
无法与容器启动时的就绪校验长期共用一条连接。

### 2. 平台侧学习证据

`dojo_plugin/learning/guest_progress.py`：

- `read_guest_progress` 读取容器内的进度文件；
- `sync_guest_progress` 有 15 秒节流，比较新旧快照并在状态跃迁时写入证据事件：
  - `workspace.file.saved`（某个工作副本第一次被改动，source=WORKSPACE）
  - `milestone.observed`（客户机内检查已经写出 flag，trust_level=4）
  - `runtime.state.snapshot`（探针首次接入）

调用点：`/learning/attempts/current`、`/learning/tutor`、`/learning/dojos/<dojo>/dashboard`，
以及教师学情分析 `build_course_learning_analytics`（只对正在运行的环境同步，单次最多 25 个，避免拖慢教师页面）。

### 3. 学情与 AI 助手

- `container_snapshot()` 在 `liveContainer.guestProgress` 中给出客户机实时状态，AI Tutor 的提示词明确要求
  优先据此判断进度、不要因为缺少终端事件就说学生没动手；
- `_attempt_view()` 增加 `liveProgress`（学生端"今天/学习进展/AI 助手面板"都能拿到）；
- 教师学情分析 `build_course_learning_analytics` 增加顶层 `liveProgress`：
  正在做题的学生、当前挑战、已完成的动作、还差哪几步，并在每个学生的 `current_focus` 上附带同一份数据。

## 验证

用学生账号 2022211575 实机验证：

| 步骤 | 结果 |
| --- | --- |
| 未改动时 | `probeMask=0`，`summary=客户机里三个工作副本都还是原始文件` |
| 在客户机里把 demo.exe 的 0x10E5 改成 0x75 | 20 秒后 `probeMask=1`，`workCopies.demoPatched=true` |
| 学生端接口 | `liveProgress.demoPatched=true`，新增证据事件 `workspace.file.saved {"file":"demo.exe","probeMask":1}` |
| AI 学习助手 | 直接引用 `guestProgress.workCopies.demoPatched=true` 与 `flagFilePresent=false`，指出"主实验已动手、尚未验证落盘，思考题两份未开始" |
| 教师学情分析 | `liveProgress.activeGuests=1`，`students[0].summary=客户机里已经改动的文件：demo.exe 已改动` |
| 端到端验收 | `output/post-guest-progress-1.json` passed，204.9 秒，探针与验收脚本的代理连接互不干扰 |

## 影响文件

- `output/win2000/image/progress-probe.py`（新增，随镜像构建）
- `output/win2000/image/Dockerfile`、`output/win2000/image/start.py`（启动探针）
- `dojo_plugin/learning/guest_progress.py`（新增）
- `dojo_plugin/learning/context.py`、`dojo_plugin/learning/intelligence.py`、`dojo_plugin/learning/analytics.py`
- `dojo_plugin/api/v1/learning.py`

## 通用化：容器级实时活动采样（2026-09-21 追加）

原来的探针只覆盖 Windows 2000 客户机。现在把"看得见学生做了什么"做成与题目无关的通用能力：
采样对象是学生的工作区容器，任何入口都落在同一个容器里（终端 ttyd、SSH、VS Code code-server、
远程桌面），因此文件系统、进程表、监听端口、壳层历史是它们的公共落点。

`dojo_plugin/learning/container_progress.py` 用一次 `docker exec` 采样容器：

- 进程表：`ps -eo pid,user,etimes,args`，容器里没有 procps 时回退遍历 `/proc/*/cmdline`
- 监听端口：`ss -lntup`／`netstat -lntup`，都没有时回退读 `/proc/net/tcp`、`/proc/net/tcp6` 的 `0A` 状态
- 会话：`who` 与 `/run/dojo/var/ssh`
- 文件改动：`/challenge` 与 `/home/hacker` 下最近 90 分钟被改动的文件（路径、大小、mtime），
  过滤 `.cache`、`node_modules`、`.vscode-server`、`/tmp`、`/run` 等噪声路径
- 代码状态：`git -C /challenge status --short --untracked-files=all`
- 壳层历史：`.bash_history`／`.zsh_history` 的行数与最近若干条（经 redact 处理）

与上一次采样做差后写入学习证据：

| 变化 | 证据事件 | 说明 |
| --- | --- | --- |
| 文件新增或 mtime 变化 | `workspace.file.saved` | 记路径与大小，不记内容 |
| 壳层历史出现新行 | `terminal.command.completed` | `observedBy=container-sample`，可进入过程评分标准 |
| 首次采样 | `runtime.state.snapshot` | 记录会话数与监听端口数 |

节流与限额：每个尝试 15 秒最多采样一次，一次最多写 5 条证据，避免污染证据链与拖慢页面。

统一出口：`container_progress.sync_live_progress()` 同时采样容器（通用）并读取客户机探针（桌面类题目），
返回 `{container, guest}`；学生端 `_attempt_view`、AI Tutor 上下文 `liveContainer.liveProgress`、
教师学情分析 `liveProgress` 都消费同一份数据。

### 验证（用学生账号 2022211575 的容器实测）

| 模拟动作 | 平台观测结果 |
| --- | --- |
| 在容器里写 `/home/hacker/solve.py`、`work/notes.md` | `filesChanged=2`，两条 `workspace.file.saved` 证据（含路径与大小） |
| 追加壳层历史 `ls -la`、`python3 solve.py`、`gdb`、`objdump` | `terminal.command.completed` 逐条写入，`recentCommands` 完整 |
| 再次修改 `work/notes.md`（6 字节到 14 字节） | 又一次 `workspace.file.saved`，大小随动 |
| 启动 `sleep`、`gdb` 等长驻进程 | `runningTools`、监听端口数进入实时状态 |
| AI 学习助手 | 同时引用容器活动与客户机进度，并明确指出"容器里的 python3/gdb/nc 属于通用练习痕迹，不构成本题进度" |
| 教师学情分析 | `liveProgress.students[0].summary` 同时给出容器活动与客户机进度 |
