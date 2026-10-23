# AI 学习助手输入框只进一个字母就失去焦点：远程桌面 iframe 抢焦点（2026-09-22）

## 现象

学生在题目工作区（右侧「AI 学习助手」面板）点击输入框准备提问，**基本只能输入一个字母，
输入框立刻失去焦点**，后面的字符直接落到左边的远程桌面客户机里，功能几乎不可用。
截图现场：Windows 2000 实验桌面 + 右侧 AI 学习助手。

## 定位过程

1. 顶层工作区页面（`/workspace`）在这一屏里同时有：
   - `#workspace-iframe`：远程桌面（noVNC）；
   - `.learning-tutor-panel`：AI 学习助手面板（输入框在**顶层页面**）。
2. 写了可复现的浏览器验证器 `ops/verify-desktop-keyboard-focus.py`：用真实发布的两个脚本
   （`dojo_theme/static/js/dojo/desktop-keyboard.js` 与 `output/win2000/image/native-keyboard.js`）
   搭出"父页面输入框 + 桌面 iframe"的最小现场，用 Chromium（CDP）实测焦点。
   **修复前**结果：

   | 场景 | 修复前 |
   | --- | --- |
   | 点输入框后焦点 | `workspace-iframe`（被桌面抢走） |
   | 输入 `hello` | 输入框为空，**`hello` 全被送进了客户机** |
   | 父页面控制台 | `ReferenceError: desktopIframe is not defined` |

3. 在**真实部署**上复核（`user_101` 正在运行的 `aisecedu/windows2000-lab:1`，Windows 2000 客户机
   真实连接）：以管理员身份取到签名后的真实 noVNC 地址，注入同样的"输入框 + 桌面 iframe"现场，
   同样复现：点输入框后焦点变成 `workspace-iframe`，输入框始终为空。
   （真实部署里桌面 iframe 在 `http://10.92.35.7:4443`，与顶层页面**不同源**，所以修复不能依赖
   读取父页面 DOM。）

## 根因（两个缺陷叠加）

1. **客户机侧脚本无条件抢键盘**（`output/win2000/image/native-keyboard.js`）：
   `shouldKeepFocus()` 只检查 iframe **自己文档内**的 `document.activeElement`，然后每 500ms
   调一次 `input.focus()`（`window focus` 与启动时的几次聚焦同理）。
   焦点在顶层页面的输入框里时，iframe 内部看到的仍是 canvas/body，于是它认为"该我拿键盘"，
   而 iframe 里的 `input.focus()` 会把**整条焦点链**拉进 iframe —— 顶层输入框随即 blur。
   学生的手感就是"打一个字母就跳走"，字符则进了客户机。
2. **顶层桥接脚本已经坏掉**（`dojo_theme/static/js/dojo/desktop-keyboard.js`）：
   文件里调用了早已删除的 `desktopIframe()`（只剩 `currentDesktop()` 定义），
   脚本一加载就抛 `ReferenceError`，于是"点桌面才把键盘交给 iframe、其余时候让开"的逻辑根本没生效，
   没有任何东西能拦住上面的抢焦点。

Linux 桌面服务的桥（`workspace/services/desktop/keyboard-capture.js`）有**同一类**缺陷：
输入框 `blur` 后 `setTimeout(…, 0)` 又会 `focusRemoteKeyboard()`，同样把焦点从顶层输入框抢回去
（验证器里 `linux-focus-retained`、`linux-typing-complete` 修复前同样失败）。

## 修复

### 1. 客户机侧（`output/win2000/image/native-keyboard.js`）

只有确认"键盘确实属于这个 iframe"才允许聚焦：

- `desktopOwnsKeyboard()`：`document.hasFocus()` 为真（焦点链就在 iframe 内），
  或者顶层页面刚刚明确请求过（2 秒窗口）；
- `topPageOwnsKeyboard()`：同源部署时直接看顶层 `document.activeElement`，
  只要顶层有控件（输入框、按钮、弹窗元素）拿着焦点就让开；
- 新增 `claimDesktopKeyboard()` / `releaseDesktopKeyboard()`，由消息驱动：
  `focus-keyboard`（用户点了桌面）接管，`release-keyboard`（用户去操作顶层控件）交出并 `blur()`；
- `window focus`、启动时的几次聚焦、500ms 看门狗全部走同一套判断，不再无条件抢。

### 2. 顶层桥接（`dojo_theme/static/js/dojo/desktop-keyboard.js`，重写）

- 删掉对 `desktopIframe()` 的调用，统一用 `desktopFrame()` 识别桌面 iframe（`?service=desktop`、
  `desktop-windows`、`vnc.html`）；
- 只在三种情况把键盘交给桌面：**用户点在桌面区域内**（这一下点击本身就是明确意图）、
  iframe 载入 / 客户机 `ready` 握手、以及看门狗发现**顶层页面没有任何控件拿焦点**；
- 顶层页面任何控件拿到焦点（`focusin`）→ 立即 `postMessage(release-keyboard)`；
- 不再放置任何隐藏输入框、不拦截按键（沿用 2026-09-21 的最终架构）；
- 同时发旧形状消息（`aisecedu:focus-remote-keyboard` / `aisecedu:release-remote-keyboard`），
  兼容尚未重建的 Linux 桌面桥。

### 3. Linux 桌面桥与顶层调用点

- `workspace/services/desktop/keyboard-capture.js`：同样的 `document.hasFocus()` +
  `topPageOwnsKeyboard()` 守卫，`blur` / `window focus` 不再抢回焦点，并识别新的
  `release-keyboard` 消息；
- `dojo_theme/static/js/dojo/workspace.js`、`actionbar.js`：全屏切换、工作区载入完成时
  原本会强行 `iframe.focus()`，现在顶层页面有控件拿焦点就跳过（避免"环境刚连上就把学生正在写的
  问题顶掉"）；
- `dojo_theme/templates/workspace.html`：`desktop-keyboard.js` 版本号 v10 → **v11**
  （`workspace.js`、`actionbar.js` 同步换版本号），刷新页面即生效。

## 验证

`ops/verify-desktop-keyboard-focus.py`（真实脚本 + 真实 Chromium，9 个场景）：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| Windows 桌面：点输入框后焦点 | ✗ 被 `workspace-iframe` 抢走 | ✓ 仍在输入框 |
| Windows 桌面：输入 `hello` | ✗ 输入框为空，`hello` 进了客户机 | ✓ 输入框完整得到 `hello`，客户机 0 字符 |
| Windows 桌面：点桌面后输入 `abc` | （连带失败） | ✓ 客户机依次收到 `a`、`b`、`c` |
| Windows 桌面：从桌面回到输入框 | ✗ 焦点再次被抢 | ✓ 焦点保留，输入完整 |
| 页面 JS 错误 | ✗ `ReferenceError: desktopIframe is not defined` | ✓ 无 |
| Linux 桌面：焦点 / 输入 / 点桌面接管键盘 / 无错误 | ✗ 前两项失败 | ✓ 全部通过 |

**真实部署实测**（管理员签名地址 + 正在运行的 Win2000 桌面，iframe 跨源）：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| 点 AI 学习助手输入框 | 焦点变成 `workspace-iframe` | 焦点仍在输入框 ✓ |
| 输入 `abc` | 输入框为空 | 输入框 `abc` ✓ |
| 点桌面 | — | 父页面焦点进入 iframe，客户机 `#noVNC_keyboardinput` 获得焦点 ✓ |
| 回到输入框再输入 `xyz` | 输入框为空 | `abcxyz` ✓（客户机没有收到 `xyz`） |

## 部署

- 顶层脚本随主题发布：**刷新页面**即生效（版本号已换，浏览器不会再用旧缓存）。
- 客户机侧脚本在镜像里：已用 `docker exec pwncollege-dojo docker build -t
  aisecedu/windows2000-lab:1 /opt/pwn.college/output/win2000/image` 重建；
  **已在运行的环境需要点「重启」**才会带上新镜像。
- 为让当前运行中的环境立刻生效，已把修复后的 `native-keyboard.js` 热更新进
  `user_101` 容器（`/usr/share/novnc/app/native-keyboard.js`，权限 0644），并换掉 `vnc.html`
  里的 `?v=` 令牌；刷新桌面页面即可。

## 影响文件

- `output/win2000/image/native-keyboard.js`（焦点归属判断 + 消息协议）
- `output/win2000/image/install-desktop.py`（`?v=win2000-5`）
- `dojo_theme/static/js/dojo/desktop-keyboard.js`（重写顶层桥接）
- `dojo_theme/static/js/dojo/workspace.js`、`dojo_theme/static/js/dojo/actionbar.js`（不再对输入框抢焦点）
- `dojo_theme/templates/workspace.html`（版本号）
- `workspace/services/desktop/keyboard-capture.js`（Linux 桌面同类修复）
- `ops/verify-desktop-keyboard-focus.py`（新增回归验证器）
- 重建 `aisecedu/windows2000-lab:1`
