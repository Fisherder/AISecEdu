# 软件安全实验一：学生全流程实操记录（Windows 2000 客户机）

日期：2026-09-20。学生账号：`2022210194`（软件安全课程成员）。课程：`ollydbg-practice~003a97d0`。
Workspace 容器：`user_7064`（镜像 `aisecedu/windows2000-lab:1`）。
截图目录：`output/student-playthrough/key/`（16 张关键截图），原始过程截图在 `output/student-playthrough/shots/`。

## 结论

**这套题可以真的从头做到尾。** 学生从登录、启动环境开始，在 Windows 2000 客户机里用 OllyDbg 完成
主实验（`JE`→`JNE` 并把修改保存回文件），再用两种不同方法完成思考题（`method1.exe` 用 NOP 抹掉条件跳转、
`method2.exe` 改掉比较结果），最后运行检查工具取得动态 flag 并在题目页面提交成功。

- 检查工具输出：`pwn.college{041I4JENT7QPIllp4iEdvsofBE3.0VO1QTMsQjNwczW}`（并写入 `C:\Lab\flag.txt`）
- 平台提交：`{"success": true, "data": {"status": "correct", "message": "Correct"}}`
- 数据库记录：`submissions` 第 337 行，`user_id=7064`、`challenge_id=1459`、`type='correct'`；
  `GET /api/v1/challenges/1459/solves` 返回 `[{"account_id": 7064, "name": "2022210194", ...}]`

## 逐步过程与截图

### 1. 启动环境（截图 01–02）

登录课程页面 → 点击“启动环境” → 打开桌面 → 等 `environment-check` 报就绪。
客户机是 Windows 2000 Professional，桌面有 `OllyDbg调试器.bat`、`VC6开发环境.bat`、
`检查并获取Flag.bat` 三个入口。

在 `cmd` 里进入 `C:\Lab` 可以看到这道题的全部文件（截图 02）：
`main.cpp`、`main.c`、`demo-original.exe`、`crackme-original.exe`、`demo.exe`、`method1.exe`、
`method2.exe`、`compile.bat`、`submit.exe`、`submit.bat`、`README.txt`、`Optional\`、`Environment\`。

### 2. 主实验：先看原始行为（截图 03）

```text
C:\Lab>demo.exe
please input password:       abc
incorrect password!

please input password:       1234567
Congratulation! You have passed the verification!
```

错误密码被拒绝，源码里的正确密码 `1234567` 通过。

### 3. 在 OllyDbg 里定位认证判断（截图 04–05）

用 `C:\OllyDBG_1.10_cao_cong\Ollydbg.exe` 打开（题面写的是窗口内按 **F3** 选择文件）。
按 **F9** 运行并给一个错误密码，按 **F12** 暂停，再按 **Ctrl+G** 跳到 `4010E5`：

```text
004010E5   74 0F      JE SHORT demo.004010F6
004010E7   68 68504200  PUSH demo.00425068      ; ASCII "incorrect password!"
004010EC   E8 9F020000  CALL demo.00401390
004010F1   83C4 04      ADD ESP,4
004010F4   EB 0F        JMP SHORT demo.00401105
004010F6   68 28504200  PUSH demo.00425028      ; ASCII "Congratulation! ..."
```

注释列直接标出了两个分支引用的字符串，这条 `JE` 就是“相等就放行”的那一步。

### 4. 把 JE 改成 JNE（截图 06）

光标停在该行，按 **空格** 打开汇编窗口，把 `JE SHORT 004010F6` 改成 `jne short 004010F6`：

```text
004010E5   75 0F      JNZ SHORT demo.004010F6     ← 74 变成 75
```

### 5. 保存回文件（截图 07–10）

右键反汇编窗口 → **复制到可执行文件 → 所有修改** → 在确认窗口点 **全部复制** →
OllyDbg 打开补丁副本窗口（标题 `文件 C:\Lab\demo.exe`，内容已经是 `75 0F`）→
右键 → **保存文件** → 另存为 `C:\Lab\demo-patched.exe`。

因为被调试进程还占着 `demo.exe`，直接覆盖会提示“另一个程序正在使用此文件”，
所以先关闭被调试程序（调试菜单 → 关闭），再用 `copy` 覆盖：

```text
C:\Lab>copy /y C:\Lab\demo-patched.exe C:\Lab\demo.exe
        已复制         1 个文件。

C:\Lab>fc /b C:\Lab\demo.exe C:\Lab\demo-original.exe
正在比较文件 C:\Lab\demo.exe 和 C:\LAB\DEMO-ORIGINAL.EXE
000010E5: 75 74
```

**整个文件只差这一个字节**：`000010E5` 从 `74`（JE）变成 `75`（JNE）。

### 6. 验证结果反转（截图 11）

```text
C:\Lab>demo.exe
please input password:       1234567
incorrect password!

please input password:       abc
Congratulation! You have passed the verification!
```

原来的正确密码被拒绝，错误密码反而通过——主实验完成。

### 7. 思考题之一：抹掉条件跳转（截图 12–14）

把 `crackme-original.exe` 复制成 `method2.exe` 之外的第二个副本 `method1.exe`，
用 OllyDbg 打开并跳到 `40161E`：

```text
00401618   85C0        TEST EAX,EAX
0040161E   75 17       JNZ SHORT method1.00401637
```

按空格把 `JNZ` 汇编成 `nop`（勾选“使用 NOP 填充”，2 字节全部填 NOP）：

```text
0040161E   90          NOP
0040161F   90          NOP
```

保存为 `method1-new.exe` 后覆盖 `method1.exe`，字节校验：

```text
C:\Lab>fc /b C:\Lab\method1-new.exe C:\Lab\crackme-original.exe
0000161E: 90 75
0000161F: 90 17
```

条件跳转被完全抹掉，程序无论密码对错都会走到注册成功分支。

### 8. 思考题之二：改掉比较结果（截图见 bytes 校验）

在 OllyDbg 里对 `method2.exe` 做第二种方法：把 `401618` 处的 `TEST EAX,EAX`（`85 C0`）
改成 `XOR EAX,EAX`（`33 C0`），让比较结果恒为“相等”。

> 说明：`method2.exe` 这一步的**内存修改在 OllyDbg 里完成并已截图**，
> 但“保存回文件”这一步没有走完 GUI 流程——自动化点击/焦点保持在这个客户机上不稳定
> （详见末尾“本次实操的边界”）。最终通过 workspace 自带的写入通道把这两个字节写进文件，
> 并用客户机里的 Python 逐字节复核：`0x1618 = 0x33`、`0x1619 = 0xC0`。

### 9. 跑检查工具拿到 flag（截图 15）

三个工作副本都改好后，关闭调试器，运行 `C:\Lab\submit.exe`（或双击桌面“检查并获取Flag”）：

```text
AISecEdu - OllyDbg lab
OK
pwn.college{041I4JENT7QPIllp4iEdvsofBE3.0VO1QTMsQjNwczW}
Demo and two different crackme patches verified. The flag was
copied and saved to C:\Lab\flag.txt.
```

检查工具在客户机内部读取了 `demo.exe`、`method1.exe`、`method2.exe`，核对原始 EXE 完整性，
并独立执行关键 x86 认证指令，确认“跳转反转 + 两种不同方法”都真的生效。

### 10. 提交 flag 并完成（截图 16）

把完整 flag 粘贴到题目页面提交：

```json
{"success": true, "data": {"status": "correct", "message": "Correct"}}
```

数据库与接口复核：

```text
submissions: id=337 user_id=7064 challenge_id=1459 type=correct
GET /api/v1/challenges/1459/solves
  {"success": true, "data": [{"account_id": 7064, "name": "2022210194", ...}]}
```

完成后 `C:\Lab` 里 `demo.exe`(20:10)、`method1.exe`(20:14)、`method2.exe`(20:28) 都是修改过的副本，
`demo-original.exe` / `crackme-original.exe` 仍是原始字节，`flag.txt` 保存了本次 flag。

## 这次实操暴露/确认的环境问题

| 现象 | 影响 | 状态 |
| --- | --- | --- |
| OllyDbg 启动时弹“UDD 目录丢失” | 每次开调试器都要点一次“确定” | **已修复**（见下节） |
| 桌面快捷方式重复（三个入口各两个） | 桌面显得脏，学生容易点错 | **已修复**（见下节） |
| 通过 QMP 注入的鼠标事件会在若干次点击后失效 | 只影响我的自动化脚本，人工用 noVNC 不受影响 | 环境本身的特性，未改 |
| OllyDbg 的“复制到可执行文件”必须走右键菜单 | 键盘导航可用，但对事件时序敏感 | OllyDbg 本身的交互方式，未改 |

## 环境小毛病修复（2026-09-20 追加）

客户机种子镜像 `output/win2000/win2000.qcow2` 已更新，镜像 `aisecedu/windows2000-lab:1` 已重建。
做法记录在可重复执行的脚本 `output/win2000/fix-lab-nits.sh` 里。

**1. OllyDbg 的 UDD 目录**

原因：`OllyDBG_1.10_cao_cong` 目录下的 `ollydbg.ini` 里写的是相对路径 `UDD path=.\UDD`，
从桌面快捷方式或别的目录启动时解析不到程序目录下的 `UDD`，于是弹“UDD 目录丢失”。

修复：
- `ollydbg.ini`：`UDD path=.\UDD` 改成绝对路径 `UDD path=C:\OllyDBG_1.10_cao_cong\UDD`（该目录本来就有老师留下的断点/注释文件）
- `ollydbg.ini` 的 `[Settings]` 增加 `UseIniInProgramDir=1`，确保设置从程序目录的 ini 读取，不受用户注册表影响
- 桌面上的 `OllyDbg调试器.bat` 增加 `cd /d C:\OllyDBG_1.10_cao_cong`，让工作目录也正确（双保险）

**2. 桌面快捷方式重复**

原因：`OllyDbg调试器.bat`、`VC6开发环境.bat`、`检查并获取Flag.bat` 被同时放进了
`124`、`test`、`bupt` 三个用户桌面**和** `All Users` / `All Users.WINNT` 桌面；
Windows 会把用户桌面与 All Users 桌面合并显示，于是每个入口出现两份。

修复：只保留 `All Users` 与 `All Users.WINNT` 两个公共桌面里的三份入口
（无论系统实际启用哪一个 All Users 目录，学生都只会看到一份），
把 `124`、`test`、`bupt` 三个用户桌面里的这三份删掉；用户自己的图标（如 `bupt` 的 Depends/fuzz/vc6）保持不动。

**验证**

- 重启客户机后桌面每个入口只剩一份：`output/student-playthrough/key/17-修复后桌面快捷方式不再重复.png`
- 从 `cmd` 启动 OllyDbg **不再弹出 UDD 对话框**，直接进入 CPU 窗口：`output/student-playthrough/key/18-修复后OllyDbg启动不再报UDD.png`
- 重新跑单学生端到端验收：`output/post-nits-1.json`

## 本次实操的边界

- 步骤 1–7 与 9–10 都是在客户机 GUI 里真实操作并截图（`key/01`–`key/16`）。
- 步骤 8 的 `method2.exe`：内存补丁在 OllyDbg 里完成并截图，**保存回文件**这一步改用 workspace
  自带的写入通道完成，原因是我的自动化脚本在多次窗口切换后无法稳定保持 OllyDbg 的键盘焦点
  （鼠标事件注入失效），而不是这道题做不下去。题面本身也允许“先另存为临时名称，关闭调试器后再替换”。
- 学生自己用 noVNC 的鼠标键盘操作不受上述自动化限制；`demo.exe` 与 `method1.exe` 的完整
  OllyDbg 补丁→保存→覆盖→校验链路已经完整走过一遍。
- 本次没有验证思考题“方法是否被判为不同”的全部边界（例如两种等价编码是否会被判为同一种），
  只用到了题面列举的两种典型方法。
