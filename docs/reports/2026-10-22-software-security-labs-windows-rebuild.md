# 软件安全实验 3–7：按原始 Windows/GameOver 环境重建（进行中）

日期：2026-10-22。课程：软件安全（`ollydbg-practice~003a97d0`，数据库 ID `3839952`）。

## 更正

上一版把实验 3–7 做成了 Linux 受控模拟，属于改编，不符合“根据资料、原本都是 Windows 环境”的要求。已将 5 道 Linux 模拟题从课程中**删除**（数据库草稿、题目、提交记录和测试账号一并清理）；模拟题包已移到 `output/software-security-simulations-20261022-removed/`，不再作为课程内容。旧报告已删除。

本轮按原始资料在**真实 Windows 2000 客户机**中重做实验 3–7，不使用 Linux 容器替代 Windows 实验。

## 已完成：实验三（真实 Windows 2000）

题目：`lab03-shellcode`，数据库 Challenge ID `1526`，模块 `reverse-debugging`。

- 运行环境：`aisecedu/windows2000-stack-lab:2`，QEMU 启动原生 Windows 2000 Professional，桌面可操作 OllyDbg、VC6、Python 2.7。
- 原始文件：`overflow_exe.exe`（sha256 `6b43cc14…42adc`）、`main.cpp`、`shellcode.cpp`、`shellcode.exe`、`StackOverrun.exe`、`StackOverrun.cpp`、`inspect.exe`、`password.txt`。
- 客户机目录：`C:\Lab\Lab3`。学生用 OllyDbg 分析 `verify_password`，修改 `password.txt`，用静态返回地址或 `JMP ESP` 执行 shellcode，弹出包含 `bupt` 的 MessageBox 后调用 `ExitProcess`。
- 客户机检查：`C:\Lab\Lab3\check.cmd` 启动 `check.py`，读取原始 EXE、`password.txt`，调用 `inspect.exe --probe` 取得本次 EBP，把文件交给服务端校验；通过后在客户机显示 Flag、写入 `C:\Lab\flag.txt` 并复制到剪贴板。
- 服务端校验：在 Windows 客户机内运行的原始 EXE 和输入被送到 `verifier.py`，用原始 PE 镜像和 unicorn 复现 44 字节缓冲区、保存的 EBP、返回地址覆盖及 shellcode 的 `MessageBoxA → ExitProcess` 调用；校验文本包含 `bupt`。
- 实际验收：在 Windows 2000 客户机内运行 `check.cmd`，`lab3-verified.json` 记录 `MessageBoxA` 文本 `buptbupt`、`ExitProcess`，服务端返回动态 Flag `pwn.college{UyXTF2WATdhdjG5B0F9hdH8m4e4.QX2ITNxwSMwEzW}`；截图见 `output/windows-labs-20261022/lab3-shot*.png`。
- 发布状态：`Challenges.state=hidden`、`DojoChallenges.required=false`、`publication_state=DRAFT`、可见性窗口 2100 年起；**学生不可见**，教师可在管理员会话中预览。未发布。


## 已完成：实验五（真实 Windows 2000）

题目：`lab05-seh-virtual`，数据库 Challenge ID `1527`，模块 `reverse-debugging`。

- 运行环境：同一原生 Windows 2000 客户机，客户机目录 `C:\Lab\Lab5`。
- 原始文件：`SEH.exe`、`SEH.cpp`、`vf.exe`、`vf.cpp`、`ArrayIndexError.exe`（sha256 `760e0641…35a91`）、`ArrayIndexError.cpp`、`solution.txt`、`check.cmd`。
- 实验内容：SEH 异常链与虚函数/虚表按原始资料在 OllyDbg 中分析；完成凭证是 ArrayIndexError 思考题——不修改源码，构造 `index value`，让 `main` 返回时执行 `bar` 并输出 `Augh! I've been hacked!`。
- 客户机检查：`check.cmd` 运行 `check.py`；`check5.exe`（MinGW 编译的 32 位 Windows 调试器）在客户机内以调试方式启动原始 `ArrayIndexError.exe`，在 `bar=0x00401000` 设置硬件执行断点，读取 `solution.txt`，只有真实命中 `bar` 才写 `PASS`。
- 服务端校验：`verifier.py` 核对原始 EXE 的 sha256、客户机结果和 `PASS`，通过后返回动态 Flag。
- 实际验收：`solution.txt` 为 `-753713 4198400`，客户机调试器命中 `bar`，`lab5-last.json` 为 `{"args":["-753713","4198400"],"stdout":"PASS","passed":true}`，`lab5-verified.json` 记录通过，动态 Flag 为 `pwn.college{M8XuUzSJwfPhJkw3nR5JIHkYe5C.QX3ITNxwSMwEzW}`。
- 发布状态：`Challenges.state=hidden`、`DojoChallenges.required=false`、`publication_state=DRAFT`、可见性窗口 2100 年起；**学生不可见**。未发布。


## 已建成、验证中的：实验六（真实 Windows 2000）

题目：`lab06-format-string`，数据库 Challenge ID `1528`，模块 `reverse-debugging`。

- 运行环境：原生 Windows 2000，客户机目录 `C:\Lab\Lab6`。
- 原始文件：`foo.exe`（sha256 `182af33c…e908fa`）、`foo.cpp`、`FormatString_overflow.cpp`、`StackView.cpp`、`MemoryView.cpp`、`payload.txt`、`check.cmd`。
- 实验内容：按原始资料分析 `%x` 栈查看、`%s` 指定地址读取、`sprintf` 可伸展缓冲区与返回地址覆盖；完成凭证是 `foo.exe` 思考题——用格式化字符串把 `fErrFunc` 改为隐藏的 `foo`，输出 `I've been hacked!!!`。
- 客户机检查：`check.cmd` 运行 `check.py`，把 `payload.txt` 作为 `argv[1]` 运行原始 `foo.exe`，捕获真实输出并交给服务端校验；服务端核对原始 EXE 的 sha256 和输出标记。
- 已确认：在 Windows 2000 客户机中运行 `foo.exe`，输出 `Address of foo is 00401014`、`Address of fErrFunc is 0012FF18`，并完成 `%08x` 栈泄漏和《Writing Secure Code》第 5 章的 `%x`/`%hn` 结构试验。
- 检查器：`check6.exe` 在客户机内以调试方式启动原始 `foo.exe`，在 `foo=0x00401014` 设置硬件执行断点；`check.py` 负责发送结果。当前正在校准书籍式 `%hn` 载荷的地址对齐和字段宽度；在真实命中 `foo` 之前本题保持 `hidden / DRAFT`。

## 进行中：实验四、七

以下按原始环境继续重建，全部保持未发布：

| 实验 | 原始环境/资料 | 计划 |
| --- | --- | --- |
| 4 Fuzz | Windows 2000；`ftpfuzz.exe`、`fuzz.py`、Quick'n Easy FTP / Home FTP Server、OllyDbg | 在客户机内运行原始 FTP 目标与 fuzz 工具，检查真实崩溃站点和畸形输入 |
| 7 SQL 注入 | 原始 GameOver Linux + WebGoat 5.2/Tomcat + WebScarab（资料原环境） | 还原 WebGoat 5.2 服务与注入关卡；不在 Windows 2000 中伪造 SQL 注入 |

实验 4–7 的题目在完成真实环境验收前不会出现在学生课程中；不会再用 Linux 受控模型代替。

## 证据与文件

```text
output/windows-labs-20261022/lab03/          实验三的 Windows 挑战包（.init、description.md、windows/）
output/windows-labs-20261022/lab03/windows/  start.py、verifier.py、原始 assets/originals
output/windows-labs-20261022/lab3-shot*.png  Windows 2000 客户机与检查结果截图
output/windows-labs-20261022/REPORT.md       本记录
```

实验三挑战包位于 `/data/dojos/003a97d0/reverse-debugging/lab03-shellcode/`；数据库 Challenge ID 1526，当前未发布。
