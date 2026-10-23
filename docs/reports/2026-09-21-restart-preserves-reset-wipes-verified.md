# 生命周期核对：重启保留、刷新只重连、重置清空（2026-09-21）

## 一、核对结果（全部真实运行验证）

| 行为 | 走哪条路径 | 实测结果 |
| --- | --- | --- |
| **刷新 / 重新打开工作区页面** | 页面加载只调 `/pwncollege_api/v1/workspace` 等服务地址接口 | 整个"打开 + 刷新"过程中对 `/pwncollege_api/v1/docker` 的请求数 **0**；容器 ID 不变（`2432520db968` → `2432520db968`），**只重连，不重启** ✓ |
| **「重启」按钮** | `challenge-restart` 复用 `actionStartCallback` → `POST /pwncollege_api/v1/docker` | 容器被重建（ID `2432520db968` → `b64b9a694bf0`），客户机里预先写入的 `C:\Lab\restart-check.txt` **读回成功** → **文件保留** ✓ |
| **「重置」按钮** | `challenge-reset` → `POST /pwncollege_api/v1/docker/reset` | 重置后同一标记文件 **读不到（exit 1）**，卷被删除并重建 → **回到初始状态** ✓ |

（"重启保留文件"能通过，依赖此前修好的运行时初始化器与持久卷；早前失败是因为初始化器缺失导致
客户机根本没起来，而不是磁盘被清。）

## 二、本轮唯一必要的代码改动（很小）

`dojo_plugin/api/v1/docker.py::start_challenge_session(reset=True)`：原来**先删卷、后删容器**，
此时容器仍占用该卷，删除静默失败 → 重置不清空。改为**先 `remove_container(owner)` 再删卷**，
重置立刻生效（实测通过）。

## 三、同步更新的文案（保持与实际行为一致）

1. 解题过程 PDF：把「环境会自动恢复（停止会恢复原始磁盘）」改成
   「**环境会保留改动**：停止/重启/关浏览器后再打开，改过的文件仍在；需要干净环境用「重置」」。
2. 工具条按钮提示：
   - 重启：「重新创建题目运行环境；客户机里的文件与改动会保留，只重启环境」
   - 停止：「停止当前题目运行环境；客户机里的文件与改动会保留，之后可点「重启」继续」
   - 重置：「清空客户机磁盘与 Home 文件，恢复到题目初始状态」
3. 资源版本号升到 `…lifecycle-wording-v7`（避免浏览器用缓存里的旧提示）。

---

## 补充（同日）：移除误报的"桌面连接失败"卡片

用户反馈：桌面明明已经连上（客户机桌面可见），却弹出「桌面连接失败 / 在 25 秒内没有连上远程桌面」。

原因：卡片里的"是否已连接"判断读的是 `window.UI`，而这个 noVNC 版本**不挂 `window.UI`**
（我们后来是用 ES module 桥 `window.__aiseceduUI` 拿到实例的），所以 `connected` 永远为 false，
25 秒一到就误报。

处理（按用户要求直接去掉提示）：

1. `output/win2000/image/native-keyboard.js`：删除失败卡片 UI 与触发它的两处逻辑，
   只保留 `console.warn` + `desktop-log` 诊断上报；
2. `dojo_theme/static/js/dojo/desktop-keyboard.js`：删除顶层页面里遗留的整段卡片代码
   （该段在 IIFE 之外，属于早期改动残留）；
3. 客户机脚本版本 `win2000-4`、顶层脚本版本 `…desktop-keyboard-v10`（防缓存）。

验证（真实浏览器 + 真实客户机）：桌面正常连接 50 秒后
「失败卡片：桌面内=false 顶层=false」✓，且随后键入 `1234567` + Enter 仍然
`Congratulation! You have passed the verification!` ✓（键盘链路无回归）。
