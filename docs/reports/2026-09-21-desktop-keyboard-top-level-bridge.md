# 远程桌面键盘：顶层页面接收器 + postMessage 转发（2026-09-21）

## 为什么前一版没解决

上一版把焦点固定在 noVNC 自己的隐藏输入框 `#noVNC_keyboardinput` 上，但那个输入框在
**iframe 内部**：只要 iframe 没有拿到浏览器焦点（点桌面后焦点常停在顶层页面的 iframe 元素上），
按键就落在**顶层工作区页面**，而学生的浏览器扩展正是挂在这一层抢单键（数字键尤其常见），
于是表现为"数字打不进去、还触发插件"。

## 现在的做法

**顶层页面（我们完全可控）负责收键，iframe 只负责收转发。**

1. `dojo_theme/static/js/dojo/desktop-keyboard.js`（新增，随工作区页面加载）：
   - 在顶层页面放一个 1x1、不可见、不可点的 `textarea`（`#aisecedu-key-sink`）当**按键接收器**；
     浏览器扩展默认在输入框内不接管单键，所以按键不会被它们吞掉；
   - 桌面服务激活时（`?service=desktop` 或 iframe 指向工作区服务）自动保持它获得焦点：
     点击桌面区域、窗口重新获得焦点、每 400ms 检查一次（焦点掉到 iframe/body 就拉回来）；
     用户去操作真正的输入框（Flag、学习助手等）时完全不打扰；
   - 在接收器上捕获 keydown/keyup/keypress，`preventDefault()` + `stopPropagation()`
     （按键不再冒泡到 document，扩展监听收不到），再 `postMessage` 给 iframe；
   - 粘贴/输入法文本按字符同样转发。
2. 客户机侧 `output/win2000/image/native-keyboard.js`：新增 `message` 接收器，把收到的按键
   还原成 `KeyboardEvent` 派发到 `#noVNC_keyboardinput`，由 noVNC 直接发给客户机；
   同时保留"iframe 内自动聚焦"这条老路径，两条路互补。

## 实测（真实客户机截图）

| 场景 | 结果 |
| --- | --- |
| 点击桌面后，顶层页面焦点 | `aisecedu-key-sink`（接收器） ✓ |
| 焦点在顶层页面时键入 `1234567` + Enter | 客户机 `demo.exe` 显示 `please input password: 1234567` → `Congratulation! You have passed the verification!`，随后 shell 收到 `1234567`，**每个字符只出现一次** ✓ |
| 之前的失败场景（数字、扩展抢键） | 数字已能完整输入；按键不再交给顶层 document 的扩展监听 ✓ |

## 备注

- 顶层接收器随主题文件发布，不需要重建镜像；客户机侧的接收器在镜像 `aisecedu/windows2000-lab:1` 中，
  已在运行的环境需要点「重启」才会带上。
- 若个别扩展被配置成"在输入框内也接管按键"，页面侧无法再拦截；这种情况下仍可用工具条的
  「粘贴」按钮（把本机剪贴板送进客户机）作为兜底。
