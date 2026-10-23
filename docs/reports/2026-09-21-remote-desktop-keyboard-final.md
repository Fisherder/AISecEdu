# 远程桌面键盘：彻底解决（2026-09-21，最终版）

目标：在装有 Vimium/Surfingkeys 这类浏览器快捷键扩展的真实环境里，学生点桌面后键入的数字、字母、
Enter 必须**完整**送进客户机，扩展不得抢键。验收标准：`demo.exe` 收到 `1234567` 后显示
`Congratulation! You have passed the verification!`。

## 一路查出的四个真实原因（每个都有实测证据）

1. **注入脚本根本没加载**：镜像里 `/usr/share/novnc/app/native-keyboard.js` 权限是 `0600`（仅 root），
   而页面由 websockify（uid 60000）提供 → `GET /app/native-keyboard.js` **404**，
   浏览器报 `Refused to execute script ...`。此前所有客户机侧改动都是死代码。
   → 修复：Dockerfile 里 `chmod 0644`；`start.py` 每次启动给脚本 URL 换随机 `?v=` 令牌防缓存。
2. **顶层页面抢焦点**：顶层曾经放了一个隐藏输入框，会把焦点从桌面 iframe 抢走，而按键转发又被取消 →
   键凭空消失。探针实测：`1`、`2` 落在顶层 sink，`3` 才进桌面。
   → 修复：**删除顶层隐藏输入框**，顶层只做"把焦点推给 iframe + 桌面不可用时给出失败提示"。
3. **按键被重新派发到 canvas 后被扩展吞掉**：把按键再 `dispatchEvent` 到 noVNC 画布时，事件目标变成
   非可编辑元素，扩展立刻拦截（注入式模拟扩展实测一次吞掉 121 个事件）。
   → 修复：**不再派发任何 DOM 事件**。
4. **拿不到 noVNC 实例**：这个 noVNC 版本不挂 `window.UI`，因此无法调用其发送接口。
   → 修复：在 `vnc.html` 注入一个 ES module 桥
   `<script type="module">import UI from "./app/ui.js"; window.__aiseceduUI = UI;</script>`
   （同一 URL 的模块实例是缓存的，拿到的是**同一个** UI 实例）。

## 最终架构

```
真实按键
  └─ 落在客户机页面的可编辑接收器 #noVNC_keyboardinput（扩展默认跳过输入框 → 不抢键）
       ├─ beforeinput/input  → 文本逐字符
       └─ keydown/keyup      → Enter / 退格 / Tab / 方向键 / F 键
            └─ 直接调用 noVNC 的发送接口：UI.rfb.sendKey(keysym, code, down)
                 （不派发 DOM 事件 → 扩展看不到、也拦不住）
                      └─ 客户机收到完整按键
```
keysym 映射：可打印 ASCII 用字符码；Enter `0xFF0D`、退格 `0xFF08`、Tab `0xFF09`、Esc `0xFF1B`、
方向键 `0xFF51-54`、F1-F12 `0xFFBE+`、修饰键 `0xFFE1/0xFFE3/0xFFE9/0xFFEB`。

## 验收（注入式模拟扩展，逐个场景实测）

测试方法：Playwright 在**每个 frame**注入一个 Vimium 风格的捕获阶段监听器（吞单键并计数），
点击桌面 → 键入 `1234567` + Enter → 再键入 `abc` + Enter → 读客户机截图。

| 场景 | 扩展吞键计数 | 客户机结果 |
| --- | --- | --- |
| 无扩展 | 0 / 0 | `1234567` 通过校验并打印 `Congratulation!`；`abc` 到达 shell ✓ |
| **可编辑元素放行（Vimium 默认行为，全 frame 注入）** | **0 / 0** | `1234567` → **`Congratulation! You have passed the verification!`**；`abc` 到达 ✓ |
| 最坏情况：连输入框内也吞键 | 桌面 10 | 文本仍然完整到达（`1234567` 通过校验，`abc` 到达）✓ |

截图：`output/student-playthrough/shots/kb-accept-editable-aware.png`、
`kb-accept-none.png`、`kb-accept-swallow-all.png`。

## 现场注意

- 顶层与客户机侧脚本都已部署；**已在运行的环境需要点「重启」**才会带上新镜像；
  顶层脚本随主题发布，刷新页面即生效。
- 极端情况下（扩展被配置成"连输入框内也拦截、且阻止插入"），页面侧无法再拦截，
  此时可用工具条的「粘贴」把本机剪贴板送进客户机；建议把平台地址加入扩展白名单。

## 更新（2026-09-22）：焦点归属

上面的架构解决了"按键进不去客户机"，但客户机侧的 `native-keyboard.js` 会每 500ms 无条件
把焦点拉回 noVNC 的隐藏输入框，导致顶层工作区页面的输入框（Flag、AI 学习助手）"只能打一个
字母就失去焦点"，字符还进了客户机；顶层 `desktop-keyboard.js` 当时也因调用已删除的
`desktopIframe()` 而整体失效。现已改为**按焦点归属交接键盘**（点桌面才接管、顶层控件拿焦点
就交出），详见 `docs/reports/2026-09-22-desktop-focus-steal-tutor-input.md`，
回归验证器 `ops/verify-desktop-keyboard-focus.py`。
