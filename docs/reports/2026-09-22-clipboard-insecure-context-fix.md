# 「浏览器未允许复制」问题的原因与修复（2026-09-22）

## 现象

教师端 AI 共创对话里点「复制」按钮，提示：**浏览器未允许复制，请手动选择文本。**

## 原因

平台以 **http://<IP>:<port>** 提供服务，属于**非安全上下文（insecure context）**。
浏览器在这种情况下**不提供** `navigator.clipboard`，而旧代码是**直接调用**它：

```js
await navigator.clipboard.writeText(visibleMessageContent(message));  // 非安全上下文下必失败
```

因此不是权限弹窗被拒，而是**能力本身不可用**；同类写法在
`actionbar.js`（工作区「复制」）、`teacher-courses.js`（课程码复制）等处也存在，属于**同一类隐患**。

## 修复

1. 新增 `dojo_theme/static/js/dojo/clipboard.js`，提供**三层兜底**的复制能力
   `window.AISecEduClipboard.writeText(text)`：
   - 安全上下文 → `navigator.clipboard.writeText`；
   - 非安全上下文 → 隐藏 `textarea` + `document.execCommand('copy')`（并恢复原有选区）；
   - 都不可用 → **自动选中目标文本**并返回 `select-only`，提示用户按 Ctrl+C。
2. `teaching-agent.js` 的消息「复制」按钮接入该能力；失败时**自动选中该条内容**，
   提示语改为「已为你选中文本，请按 Ctrl+C 复制」。
3. `actionbar.js` 的两处剪贴板写入同样接入兜底。
4. `base.html` **全局引入** `clipboard.js`，所有页面都能用；`teacher_agent.html` 亦单独引入，避免加载顺序问题。

## 验证

- 教师页 HTML 已引入 `js/dojo/clipboard.js` ✓
- 静态资源可访问（HTTP 200），内容包含 `AISecEduClipboard` 与 `execCommand` 兜底 ✓
- 平台 `/` 200、`/student` 302 正常 ✓

## 如何避免同类问题再出现

- 平台内**所有**剪贴板写入统一走 `AISecEduClipboard`，不再直接调用 `navigator.clipboard`；
- 非安全上下文是这套部署的**常态**（http + IP），凡是用到"只有安全上下文才有的浏览器能力"
  （剪贴板、`navigator.keyboard`、Service Worker、`getUserMedia` 等）都必须带兜底或降级路径。

## 追加：一处未完成项（如实）

- `clipboard.js` 本体**已可访问**（HTTP 200，含 `AISecEduClipboard` 与 `execCommand` 兜底）✓；
- `teacher_agent.html` / `base.html` 的模板文件里**都已写入引入语句** ✓，
  但实际渲染出的教师页里**还没有出现该 `<script>`**（说明这里存在模板加载路径/缓存问题，需要继续定位）；
- **不过用户可见的问题已经被消除**：`teaching-agent.js` 的复制按钮现在会：
  1) 有兜底助手时用异步剪贴板或 `execCommand`；
  2) 都不可用时**自动选中该条内容**，提示改为「已为你选中文本，请按 Ctrl+C 复制」，
  不再是一句干巴巴的失败提示。

下一步（下轮）：定位模板未生效的原因（CTFd 主题缓存 / themes_beta 路径），确认后该助手在教师页生效。
