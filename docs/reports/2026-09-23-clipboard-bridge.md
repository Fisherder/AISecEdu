# 工作区复制粘贴打通：客户机剪贴板双向直通 + Flag 一键复制（2026-09-23）

## 现象

- 工具条的「粘贴」要在弹窗里手工输入文本，输了也进不了客户机；「复制」永远提示"请先在远程桌面中复制文本"。
- 客户机里 `submit.exe`（检查并获取 Flag）跑完弹出的 Flag，学生拿不出来，只能手抄随机串。

## 实测定位（真实浏览器 + 真实 Windows 2000 客户机）

用 Chromium（CDP）以学生身份打开 `/workspace?service=desktop`，实测旧实现：

| 检查 | 结果 |
| --- | --- |
| 点「粘贴」 | 弹出"粘贴要发送到远程桌面的文本"输入框（http+IP 属非安全上下文，`navigator.clipboard` 不存在） |
| 输入文本后发送 | 父页面 → iframe `rfb.clipboardPasteFrom()` → VNC `ClientCutText`；**客户机剪贴板仍是旧内容**（用客户机内脚本取剪贴板哈希比对，不匹配） |
| 点「复制」 | 取的是 iframe 里的 `lastRemoteClipboard`（来自 VNC `ServerCutText`），永远为空 |

根因：**QEMU 的 VNC server 没有客户机剪贴板代理**。实测该 QEMU（10.1.5）的 233 个 QMP 命令里没有任何
`clipboard` 相关命令，也没有 `guest-*`（qemu-guest-agent）命令；Windows 2000 客户机装不了 vdagent，
所以 noVNC 的复制/粘贴两个方向都到不了客户机。

## 方案：走平台已有的客户机通道 + 一块共享裸盘

| 方向 | 实现 |
| --- | --- |
| 本机 → 客户机 | 容器内 `clipboard.py set` 通过 COM2 代理把文本写进客户机文件（`WRITE`），再 `RUN` 客户机里的 Python（ctypes `OpenClipboard/SetClipboardData`）写入 **Windows 剪贴板** |
| 客户机 → 本机 | 客户机 Python 读剪贴板（`CF_UNICODETEXT`/`CF_TEXT`），写到 **共享裸盘** `\\.\PhysicalDrive1`（QEMU 新增第二块 IDE 盘 `clipboard.img`，512 字节对齐 + `AISECLIP` 头 + 长度 + md5 校验），容器直接读同一个文件 |
| Flag | 客户机检查通过后，容器里的 `verifier.py` 已经写出 `/usr/share/novnc/lab-result.json`（含本人 Flag）；平台接口读它 → 工具条出现「复制 Flag」 |

前端（`actionbar.js`）：

- 「粘贴」：安全上下文用 `navigator.clipboard.readText()`；**非安全上下文改为捕获学生真实按下的 Ctrl+V**
  （`paste` 事件的 `clipboardData` 在任何上下文都可用），弹窗提示"按 Ctrl+V"，不再要求手工输入；文本
  `POST /pwncollege_api/v1/workspace/clipboard` → 写入客户机剪贴板，横幅提示"在客户机窗口里按 Ctrl+V 即可粘贴"。
- 「复制」：`GET /pwncollege_api/v1/workspace/clipboard` 取回客户机剪贴板文本（为空时回退到本题 Flag），
  用 `AISecEduClipboard.writeText`（`execCommand` 兜底，适配 http 部署）写进本机剪贴板；失败则弹出已填好
  文本的对话框供手动复制。
- 「复制 Flag」：客户机里通过检查后按钮自动出现（激活桌面时探测 + 每 60 s 轮询一次），点一下即复制本人 Flag。

## 实测结果（真实浏览器）

| 场景 | 结果 |
| --- | --- |
| 点「粘贴」 | 弹出"按 Ctrl+V（Mac：⌘V）"提示 ✓ |
| 本机 → 客户机（真实 Ctrl+V） | 客户机剪贴板 = `LOCAL-CLIP-777` ✓（横幅："已写入客户机剪贴板…"） |
| 客户机 → 本机 | 客户机 `FROM-GUEST-42` → 横幅"客户机剪贴板已复制到本机剪贴板"，再粘回客户机校验一致 ✓ |
| 真实 check 流程产出的 Flag | `pwn.college{0SuIsyXiAPI71yZHHFS2U4nwTLN.0VO1QTMskzMyczW}`（真实打补丁 + `submit.exe` + 容器判定器）|
| 「复制 Flag」 | 按钮出现、横幅"本题 Flag 已复制到本机剪贴板" ✓ |
| 页面错误 | 无 ✓ |

（Flag 内容为测试账号 `tutorlatency` 的动态 Flag，仅用于验证。）

## 已知限制与运维

- **客户机代理是单客户端通道**：实测若一个客户端在连接中被强杀（SIGKILL / `pkill`），QEMU 会把这条半开连接
  一直挂着，之后任何客户端都连不上（表现为"guest agent is unavailable"，进度采样同时失效）。
  QMP 无法驱逐它（`chardev-remove` 返回 `Chardev 'agent' is busy`）。**恢复办法：点工作区「重启」**。
  为此给所有客户端加了"关闭前读空通道"的处理（`clipboard.py`、`progress-probe.py`），正常退出不会留下半开连接；
  运维时不要在客户机运行时强杀容器内的探测进程。
- **非 Windows 运行环境**：Linux 桌面的 X11 截图/剪贴板尚未实现，接口返回 `RUNTIME_UNSUPPORTED`，
  按钮给出明确提示，不影响其它功能。
- 「复制」依赖浏览器 `execCommand('copy')`/`navigator.clipboard`：真实（有界面）浏览器在用户点击后可用；
  无头 Chromium 在非用户手势下会拒绝，这是测试环境的限制。

## 部署

- ctfd 已重启（新增 `/pwncollege_api/v1/workspace/clipboard` GET/POST）。
- `aisecedu/windows2000-lab:1` 已重建（新增 `clipboard.py`、QEMU 第二块盘、`progress-probe.py` 读空通道）。
- **已在运行的环境需要点「重启」**：QEMU 参数变了（新增共享盘），客户机磁盘状态会保留（补丁、Flag 都在）。

## 影响文件

- `output/win2000/image/clipboard.py`（新增：客户机剪贴板读写）、`start.py`（共享盘 + QEMU 参数）、
  `progress-probe.py`（关闭前排空）、`Dockerfile`
- `dojo_plugin/agent_runtime/guest_clipboard.py`（新增：平台侧调用与 Flag 读取）、
  `dojo_plugin/api/v1/workspace.py`（`/clipboard`，支持 `flag_only`）
- `dojo_theme/static/js/dojo/actionbar.js`（粘贴捕获 Ctrl+V、复制、复制 Flag、Flag 按钮轮询）、
  `dojo_theme/templates/components/actionbar.html`（「复制 Flag」按钮）、`workspace.html`（版本号）
- `ops/verify-desktop-keyboard-focus.py`（CDP 客户端：空闲重连 + 读取线程健壮性，供各验证脚本复用）
- 重建 `aisecedu/windows2000-lab:1`
