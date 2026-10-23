# 键盘彻底失效的真正根因（2026-09-21）

## 关键发现

`output/win2000/image/Dockerfile` 把 `native-keyboard.js` 复制进镜像时是 **0600（仅 root 可读）**：

```
-rw------- 1 root root 6876 /usr/share/novnc/app/native-keyboard.js
```

而 noVNC 页面由 websockify（以 uid 60000 运行）通过工作区代理提供：
`GET /app/native-keyboard.js` → **404 File not found**（容器内直接请求也是 404）。

也就是说：**浏览器里这个脚本从来没有执行过**。我之前几轮做的"聚焦 noVNC 隐藏输入框""阻止按键冒泡给扩展"等改动全是死代码 —— 这正是"键盘问题一直没解决"的根本原因。查证方式：浏览器控制台报
`Refused to execute script from '.../6080/app/native-keyboard.js?v=...'`，容器内 `urlopen` 同路径返回 404。

## 已修复

1. 镜像里补 `chmod 0644 /usr/share/novnc/app/native-keyboard.js`（Dockerfile 两处），重建后
   容器内 `urlopen http://127.0.0.1:6080/app/native-keyboard.js` → **200** ✓；
2. 验证脚本真的在跑了：页面里 noVNC 侧发出的握手消息已被顶层页面收到（`["ready","ready","ready"]`）✓；
3. `start.py` 每次启动给脚本 URL 换随机 `?v=` 令牌（避免浏览器缓存旧脚本）；
4. 顶层桥接加了**握手闸门**：只有客户机页面明确应答后才接管焦点，
   避免"顶层抢了焦点但没人接收"导致完全打不进字（这正是你这次遇到的"完全输入不进去"）；
5. 移除了 `navigator.keyboard.lock()`（它可能吞键）。

## 仍未通过

顶层桥接的按键**有丢失**：实测键入 `1234567`，客户机只收到 `3457`。
（修复权限前，客户机侧"直接聚焦"那条路径是可靠的；现在的丢失发生在
"顶层接收器 → postMessage → iframe 派发"这条新链路上。）

## 下一步（二选一，我倾向第一个）

1. **简化结构**：顶层不再转发按键，而是在用户点击桌面/任意位置时把焦点交给 iframe
   （`iframe.contentWindow.focus()`），让 noVNC 自己的键盘处理收键；扩展抢键由
   现在**已经真正生效**的客户机侧防护（聚焦可编辑元素 + stopPropagation）解决。
2. 保留 postMessage 链路，但改为在 iframe 内**直接调用 noVNC 的按键接口**（而不是派发合成
   KeyboardEvent），并按 keydown/keyup 成对发送、去掉多余的 keypress 转发。
