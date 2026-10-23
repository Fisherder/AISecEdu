# 桌面"连接中"卡死：日志分析 + 不再无限等待（2026-09-21）

## 收集到的证据

1. **nginx 访问日志**（工作区代理，服务路径 `.../6080/...`）：
   - 静态资源全部 200（`vnc.html`、`app/*.js`、`core/*.js`）；
   - WebSocket 升级请求 `/6080/websockify` 返回 **101**，`request_time=55.1s`
     （这是长连接正常计法，说明握手本身能成功）；
   - 同一条连接在 13:38:46 与 13:40:21 各出现一次 → 前端在**反复重连**。
2. **容器内 websockify 日志**：
   `connecting to unix socket: /var/lib/windows-lab/vnc.sock` —— 每次都是连到 QEMU 的 VNC unix socket。
3. **运行环境进程检查**：正常时 `qemu-system-x86_64` 与 websockify 各 1 个；
   出现故障时 QEMU 已退出，但 `vnc.sock` 文件仍在（**陈旧 socket**）。

## 结论：三类原因

| 原因 | 现象 | 日志特征 |
| --- | --- | --- |
| A. 陈旧 VNC socket（QEMU 已退出，socket 文件还在） | 页面能打开，但永远停在"连接中"（noVNC 自动重连，无提示） | websockify 反复打印 `connecting to unix socket`，QEMU 进程不存在 |
| B. 整个桌面服务已停（runtime supervisor 随 QEMU 退出而收尾） | iframe 直接加载失败/空白 | 代理对 `.../6080/vnc.html` 返回 5xx；容器内 websockify 不在 |
| C. 环境尚未就绪（客户机开机需 1–3 分钟） | 启动后立刻打开桌面就一直转圈 | QEMU 在跑但 VNC 尚未可用；稍后重连即成功 |

## 本轮改动

1. **不再无限"连接中"**：
   - 客户机页面内看门狗（`output/win2000/image/native-keyboard.js`）：25 秒未连上或状态栏报错，
     就在桌面中央显示 **「桌面连接失败」** 卡片，含原因、"重新连接"与"重启环境"按钮，
     并移除 noVNC 自带的转圈界面；
   - 顶层页面看门狗（`dojo_theme/static/js/dojo/desktop-keyboard.js`）：20 秒内 iframe 未加载完成
     或服务未就绪，直接在页面里显示同一张失败卡片（覆盖原因 B/C）。
   - 实测（故意杀掉 QEMU 制造故障）：卡片正确出现，文案为
     「桌面连接失败 / 远程桌面服务没有就绪。/ 常见原因：环境正在启动（客户机开机需 1-3 分钟）、
     环境已停止、或运行环境异常退出。/ 重新连接 重启环境」✓
2. **日志**：
   - 新增客户机侧上报端点 `POST /pwncollege_api/v1/workspace/desktop-log`，
     记录 `kind`（loaded / connected / timeout / disconnected-status / still-connecting /
     parent-load-failed）、耗时、详情与页面地址；
   - 客户机侧同时 `console.warn("[aisecedu-desktop]", ...)`，便于现场排查。

## 待办

- 上报端点在页面里是 `fetch(...)` 直发，实测 ctfd 日志里暂时没有记录（可能被 CSRF 拦截），
  下一步补上 `CSRF-Token` 头再验证；
- 原因 A（陈旧 socket）需要在 runtime 侧处理：QEMU 不在时启动器应删除并重建 `vnc.sock`，
  避免 websockify 连到一个死 socket 而浏览器无感重连。
