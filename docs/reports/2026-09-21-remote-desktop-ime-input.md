# 远程桌面敲字母没反应：中文输入法吞输入（2026-09-21）

## 现象

学生在客户机里输入密码时，敲字母没有任何反应，只有回车有反应；控制台停在 `please input password:` 不动。

## 原因

客户机的默认输入语言是 **中文（简体，中国）0x0804**，并且默认挂着**微软拼音输入法**。
中文输入法处于打开状态时，字母会被输入法截去做组词：
控制台收不到字符，回车只是结束/取消一次输入法组词，所以看起来"只有回车有反应"。

复现与定位（在客户机内部实测）：

1. 读前台窗口的键盘布局：`GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow()))` → `0x0804`；
2. 用 `keybd_event` 发送 Ctrl+Space 打开输入法（左下角出现"微软拼音"状态条），再通过 noVNC 输入 `abc`
   → 控制台**没有任何字符出现**（截图 `kb-06-ime-on.png`）；
3. 再按一次 Ctrl+Space 关闭输入法，输入 `abc` 回车 → 字符正常进入控制台（`kb-07-ime-off.png`）。

注意一个测量陷阱：直接用代理起一个新进程去读 `GetKeyboardLayout(0)` 得到的是该进程**继承**的默认布局
（始终是 0x0804），并不代表当前会话窗口的输入语言；判断"学生实际会不会被吞字"必须读**前台窗口**的线程布局。

## 修复

让客户机默认使用**英文（美式键盘）**：登录时自动把输入语言切成 `00000409`，并把用户默认输入语言写进注册表
（中文键盘仍保留在列表里，需要时可以自己切回）。

- `output/win2000/lab-extra/set-input-layout.py`（客户机内 Python 2.7）：
  `LoadKeyboardLayoutW("00000409", KLF_ACTIVATE)` + `PostMessageW(HWND_BROADCAST, WM_INPUTLANGCHANGEREQUEST)`
  切换当前会话；同时写 `HKCU\Keyboard Layout\Preload` = `1:00000409`、`2:00000804`。
- `output/win2000/lab-extra/set-input-layout.bat`：登录时静默调用上面的脚本。
- `output/win2000/inject-lab.sh`：把脚本写入 `C:\Lab\Environment\`，并把 .bat 放进**所有**配置文件的
  「开始」菜单\程序\启动 目录（`All Users`、`All Users.WINNT`、`124`、`bupt`、`test`、`Default User`、
  `Default User.WINNT`）。

只放 `All Users` 是不够的：这台 2000 是就地升级过的系统，镜像里同时存在 `All Users` 与 `All Users.WINNT`，
实际生效的是后者，第一次只放 `All Users` 时登录脚本没有执行（重启后前台布局仍是 0x0804）。

## 验证（全新启动，未做任何手工操作）

| 检查 | 结果 |
| --- | --- |
| 前台窗口键盘布局 | `0x0409`（英文） ✓ |
| 任务栏语言指示器 | 显示 `EN` ✓ |
| 在控制台输入 `1234567` + 回车 | 显示 `please input password: 1234567` → `Congratulation! ...` ✓ |
| Ctrl+Space 打开输入法后输入 `abc` | 控制台不出现字符（复现根因，文档给出恢复办法） |
| 再按 Ctrl+Space 关闭后输入 `abc` | 字符正常进入控制台 ✓ |

## 同步更新的文档

- 题面：`output/win2000/lab-extra/challenge-description.md`（操作提示新增"输入法（重要）"一条）
- 客户机内 `C:\Lab\README.txt`（已重新注入种子并重建镜像）
- `data/dojos/003a97d0/dojo.yml` 与数据库 `dojo_challenges.description`
- `output/pdf/软件安全实验一-解题过程.pdf`（常见问题新增该条，功能键提示里补充了 EN/Ctrl+Space）

## 影响文件

- `output/win2000/lab-extra/set-input-layout.py`、`set-input-layout.bat`（新增）
- `output/win2000/inject-lab.sh`
- 重建 `aisecedu/windows2000-lab:1`
