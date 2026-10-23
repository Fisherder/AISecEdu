# 软件安全实验一：题面与实验环境定稿

日期：2026-09-20。题目：`ollydbg-practice~003a97d0` / `reverse-debugging` / `ollydbg-auth`。
课程名：**软件安全**（北京邮电大学《软件安全》2026-2027-1 学期，教师：张淼）。
运行镜像：`aisecedu/windows2000-lab:1`。

## 结论

1. 这是一道**独立的课程实践题**：学生在真实的 Windows 2000 客户机里用 OllyDbg 改掉一个密码验证程序的
   条件跳转，再用两种不同方法绕过另一个注册验证程序，最后在客户机里跑检查工具取得动态 flag 并提交。
   题面只讲这道题本身要做什么、怎么做、怎么算做完，不再对照任何外部材料。
2. 客户机 `C:\Lab` 里的实验文件就是这道题的全部素材：源码、原始 EXE、工作副本、编译脚本、检查工具、
   编译练习和一份补充演示材料。
3. 排查并修好了三处**会让实验做不下去**的问题：编译脚本调用了客户机里不存在的编译器；VC6 缺少
   `mspdb60.dll` 会弹出模态框冻住桌面；源码里的一处缓冲区越界写入曾被删掉。
4. 题面按学习者语言重写后重新验收：单学生端到端通过，**70 学生并发 70/70 全部完成**
   （`failures: []`、`cleanupErrors: []`）。

## 学生要做什么

| 实验环节 | 学生动手做的事 | 做完的标准 |
| --- | --- | --- |
| 熟悉 OllyDbg | 打开 `C:\Lab\demo.exe`，认识反汇编、寄存器、内存、堆栈四个窗口，练断点、单步、继续运行 | 能用两个提示字符串找到认证判断那一行 |
| 读懂验证程序 | 对照 `C:\Lab\main.cpp` 看源码，再在 OllyDbg 里看同一段逻辑的反汇编 | 能说清比较结果、条件跳转和运行结果的关系 |
| 修改分支判断 | 把 `demo.exe` 的 `JE`（操作码 74）改成 `JNE`（75），再 **Copy to executable** 保存回文件 | 正确密码被拒绝、非空错误密码被放行 |
| 思考题 | 从 `crackme-original.exe` 复制两份副本，用**两种不同方法**绕过注册验证 | 两份副本都能用错误密码注册成功 |
| 生成工程（可选） | 双击 `C:\Lab\compile.bat`，用客户机里的 Visual C++ 6.0 编译 `main.c` | 得到 `C:\Lab\rebuilt-demo.exe` |
| 存在溢出代码（上课演示版本） | `C:\Lab\Optional\` 里的演示源码与原始 EXE，对照有界／无界缓冲区的行为 | 补充材料，不参与判定 |
| 取得并提交 flag | 运行 `C:\Lab\submit.exe`，提交它显示的完整 flag | 平台记录本题完成 |

检查工具在客户机内部读取三个工作副本、核对原始 EXE 完整性，并独立执行关键 x86 认证指令，
确认跳转反转和思考题的两种方法真的生效。报告、截图和程序结构图属于学习过程要求，平台不收取也不评分。

## 客户机实验文件

| 文件 | 说明 |
| --- | --- |
| `main.cpp` | 验证程序源码，内置密码 `1234567`，含 `strcmp` 判断与一处越界写入（sha256 `d666aecc…c02cdf`） |
| `main.c` | `main.cpp` 的 C 版本，只把 `<string>` 换成 `<string.h>`，可直接用 VC6 编译 |
| `demo-original.exe` | 原始验证程序，VC6 构建，字节未改动（sha256 `a6b9037d…35c09f7`） |
| `demo.exe` | 主实验工作副本 |
| `crackme-original.exe` | 原始注册验证程序，字节未改动（sha256 `aded6a0f…fbf99500`） |
| `method1.exe` / `method2.exe` | 思考题的两个工作副本 |
| `compile.bat` | 自包含调用 VC6，把 `main.c` 编译成 `rebuilt-demo.exe` |
| `submit.exe` / `submit.bat` | 检查工具，全部通过后给出本题 flag |
| `Optional\` | 上课演示版本“存在溢出代码”的源码、原始 EXE 与说明 |
| `README.txt` | 实验说明，放在 `C:\Lab` 里随时可看 |
| `Environment\w2k-agent.exe` | 客户机代理，平台就绪判定与自动投放补丁用，学生不需要碰 |

桌面（三个用户桌面与 `All Users` 桌面）放有 `OllyDbg调试器.bat`、`VC6开发环境.bat`、
`检查并获取Flag.bat` 三个入口。

## 修好的三处问题

| 问题 | 现象 | 处理 |
| --- | --- | --- |
| 编译脚本调用了不存在的编译器 | `compile.bat` 原来调用 Tiny C Compiler，而客户机里没有 `tcc`，学生按题面编译必然失败；客户机实际预装的是 Visual C++ 6.0 | 改成自包含的 VC6 调用（`/nologo /W3 /O2`），并在 `PATH` 里补上 `C:\VC6\Common\MSDev98\Bin` |
| VC6 缺 `mspdb60.dll` | 直接调用 `CL.EXE` 会弹出“无法找到 DLL `mspdb60.dll`”的模态对话框，把整个客户机桌面冻住；该 DLL 只在 `C:\VC6\Common\MSDev98\Bin`，不在 `VC98\Bin` | 把 `MSPDB60.DLL` 复制到 `C:\VC6\VC98\Bin`（`cl.exe` 同目录优先搜索），`VCVARS32.BAT` 里的 `D:\…` 路径也早已改写为 `C:\VC6\…` |
| 源码里的越界代码被删过 | `main.cpp`/`main.c` 曾缺少 `strcpy(buffer, password)`，学生看不到缓冲区越界的后果 | 恢复源码原样并重新注入，`main.c` 保留同一处越界写入 |

另外把客户机里的 `README.txt` 与 `Optional\说明.txt` 改写成 **GBK + CRLF**：Windows 2000 的记事本按
系统 ANSI 码页打开 `.txt`，UTF-8 会显示成乱码。

## 题面写法

题面（`dojo_challenges.description`，3396 字）按“先给具体内容”的顺序组织：

1. **你会学到什么**——会用 OllyDbg；看懂密码验证程序为什么能被绕过；看懂 32 位 PE 程序的加载与运行；
2. **先认识要破解的程序**——给出 `main.cpp` 的源码片段，说明“登录成功与否完全由 `strcmp` 的返回值
   决定，而这个返回值紧接着被翻译成一次条件跳转”；
3. **一、修改分支判断：把 JE 改成 JNE**——运行观察两种提示 → F3 打开、F9 运行 → 用两个提示字符串
   定位认证判断、看 ZF 标志 → 二进制编辑 74→75 → F9 验证结果反转 → Copy to executable 保存文件
   （强调只改内存不算完成）；
4. **二、思考题：用两种方法破解 crackme.exe**——复制两份副本，列出四种可选手法，要求只改认证判断、
   保留界面与原始提示；
5. **三、生成工程：自己编译一遍（可选）**——双击 `compile.bat` 或用桌面“VC6开发环境”；
6. **四、获取并提交 flag**——`submit.exe` 在客户机内核对三个工作副本并独立执行关键 x86 认证指令；
7. **文件说明表**与**操作提示**（OllyDbg 常用键、保存失败的排查、重开环境会恢复原始磁盘）。

课程层的导学资源（904 字，标题“实验导引与判定说明”）换成一张“实验环节 → 你会做什么 → 怎么算做完”
的表，加上提交判定与环境说明；单元简介 52 字：对照源码与反汇编读懂密码验证程序的控制流，把 JE 改成
JNE 完成结果反转，再用两种方法完成思考题。

写法遵循仓库内的教学文字规范（`services/agent-runtime/lib/teaching/learner-language.ts`，
`plain-teaching-v1`）：先给具体对象和动作、指向真实按钮与路径、术语首次出现时用常用词解释、
去掉空泛套话与制作残留、不为通俗改变事实（操作码、偏移、密码、命令行都保持原样）。

## 验收

```bash
# 单学生端到端（平台投放补丁 + 客户机内检查 + 提交 flag）
python3 ops/verify-ollydbg-concurrency.py --students 1 --max-resident 1 \
  --solve-mode agent --output output/post-rewrite-1.json

# 70 学生并发
python3 ops/verify-ollydbg-concurrency.py --students 70 --max-resident 16 \
  --solve-mode agent --output output/final-70-postcompile.json
```

客户机内的编译链在冷启动的新客户机里单独确认过：

```text
C:\Lab>compile.bat
main.c
Compiled rebuilt-demo.exe with Visual C++ 6.0.
Run it yourself and compare its control flow with demo-original.exe.
```

70 学生并发结果：

| 阶段 | 成功/总数 | p50 | p95 |
| --- | --- | --- | --- |
| `workspace:start` | 70/70 | 2.4 s | 4.1 s |
| `workspace:ready` | 70/70 | 71.7 s | 71.8 s |
| `challenge:solve` | 70/70 | 128.4 s | 130.2 s |
| `challenge:submit` | 70/70 | 0.17 s | 0.24 s |
| 平台完成记录 | **70/70** | — | — |

峰值 16 台客户机同时驻留，客户机总 RSS **4.45 GiB**；全程最低 MemAvailable **37.55 GiB**；
总耗时 **1065.9 s（17.8 分钟）**，`failures: []`，`cleanupErrors: []`。

改版后再跑单学生端到端：`passed: true`，耗时 208.7 s。

题面渲染按学生视角复核：以学生账号登录后打开课程页与题目页，实验环节表、`1234567`、
“把 JE 改成 JNE”、`method1.exe`/`method2.exe`、`compile.bat`、Visual C++ 6.0、`Optional` 演示、
`submit.exe`、文件说明表、动态 flag 口径都正常呈现，页面上不再出现任何外部材料引用。

## 复现与运维

```bash
# 1. 离线更新客户机实验文件（qemu-nbd + mount -t vfat，分区偏移 32256）
docker cp output/win2000/win2000.qcow2 pwncollege-dojo:/tmp/seed-inject.qcow2
docker cp output/win2000/inject-lab.sh pwncollege-dojo:/tmp/inject-lab.sh
docker exec pwncollege-dojo sh /tmp/inject-lab.sh

# 2. 回写种子并重建镜像
docker cp pwncollege-dojo:/tmp/seed-inject.qcow2 output/win2000/win2000.qcow2
cp output/win2000/win2000.qcow2 output/win2000/image/win2000-seed.qcow2
docker exec pwncollege-dojo docker build -f /opt/pwn.college/output/win2000/image/Dockerfile.incremental \
  -t aisecedu/windows2000-lab:1 /opt/pwn.college/output/win2000/image
```

`output/win2000/inject-lab.sh` 是可重复执行的注入脚本，负责编码与换行转换：
`.c`/`.cpp` 逐字节原样写入（保持 sha256 不变），`.bat`/`.txt` 转成 GBK + CRLF，
并顺手把 `MSPDB60.DLL` 放到 `cl.exe` 同目录。

客户机磁盘每次启动都从种子盘做 overlay（`student.qcow2`），学生改坏文件重开环境即可恢复，
种子里始终是原始实验文件。

## 边界

- 判题 authority 是镜像内的私有 `verifier.py`（未读取其内容），学生自报的报告、截图不参与判定；
  这一条已经在题面里写明。
- `Optional\` 溢出演示与 VC6 编译练习都是补充材料，不参与判题。
- 客户机里的 Python 2.7 / Ruby / Perl 等历史工具与本题无关，保留未动。
- 客户机不接网络、只用于离线实验；Windows 2000 已停止支持。
- 本次验收用预置的已知有效补丁驱动完成链路，衡量的是平台与客户机在改版后的完成能力。

## 追加修正（2026-09-20 晚）

### 1. 提交入口统一到平台自带的那一个

客户机镜像原来往 noVNC 桌面页注入了一个右上角绿色按钮「获取检查结果」，点击后弹出“实验结果”窗口显示
flag。平台的实验环境页底部本来就有 **“输入 Flag”** 提交框（`dojo_theme/templates/components/actionbar.html`），
这个注入按钮是重复入口，已移除：

- `output/win2000/image/install-desktop.py`：不再往 `vnc.html` 注入 `app/lab-result.js`
- `output/win2000/image/Dockerfile`：不再 `COPY lab-result.js`
- 删除 `output/win2000/image/lab-result.js`
- 保留 `start.py` 对 `lab-result.json` 的清理与检查工具写入（平台侧仍用它承载 flag，验收脚本也读它）
- 重建 `aisecedu/windows2000-lab:base` 与 `aisecedu/windows2000-lab:1`

学生现在的提交路径只有一条：在客户机里运行 `submit.exe`（或桌面“检查并获取Flag”）拿到 flag，
填到实验环境页底部的 **“输入 Flag”** 框，或者回到题目页面粘贴提交。

### 2. 题面里的按钮名称改成实际界面

题面原来写的“点击远程桌面右上角的**获取 Flag**”与实际界面不一致。已按实际界面改正的位置：

- `dojo_challenges.description` 与 `dojo_challenges.data.description`（数据库）
- `data/dojos/003a97d0/dojo.yml`
- `output/win2000/lab-extra/challenge-description.md`
- 客户机内的 `C:\Lab\README.txt`（重新注入种子并重建镜像）
- 两份平台使用说明 PDF（`output/pdf/`）

另外题目页上的环境按钮叫**启动题目**，启动完成后出现的入口叫 **Desktop**，也已一并改正。
