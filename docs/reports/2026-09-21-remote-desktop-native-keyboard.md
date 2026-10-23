# 远程桌面键盘：原生输入 + 隔离浏览器插件抢键（2026-09-21）

## 问题

学生装了键盘快捷键类浏览器插件（Vimium / Surfingkeys / Shortkeys 这类）后，插件把单键当成自己的
快捷键，远程桌面只能收到一部分按键（截图里只打出 `sds`）。

之前临时做法是在桌面工具条加一个"外接输入框"，把文本通过平台送进客户机。这个做法虽然可靠，
但体验是"另开一个框打字"，不符合原生输入的要求，本轮已移除。

## 方案：把焦点固定交给 noVNC 自己的键盘输入元素

noVNC 自带的 `#noVNC_keyboardinput`（1x1、移到屏幕外的 textarea）本来就挂着 noVNC 的 Keyboard
（`app/ui.js` 的 `touchKeyboard`）。做法是把焦点持续保持在这个可编辑元素上：

1. **插件不再抢键**：主流快捷键插件默认在 input/textarea/contenteditable 内不接管单键，
   所以按键会老老实实落到这个输入框里；
2. **noVNC 直接发送按键**：输入框上的 Keyboard 把按键发给客户机（`UI.keyEvent → rfb.sendKey`），
   而画布上的键盘监听不会同时触发，所以**每个按键只发送一次**，没有重复输入；
3. **额外封堵**：在输入框上用捕获阶段监听 keydown/keypress/keyup 调 `stopPropagation()`，
   按键不再冒泡到 document/window，挂在 document 上的扩展监听根本收不到（同一节点上 noVNC 的
   监听不受影响）。

实现：`output/win2000/image/native-keyboard.js`，由 `install-desktop.py` 注入 `vnc.html`，
随镜像一起构建。要点：

- 打开桌面后自动把焦点放到该输入框（1s/3s/8s 各补一次，兼容 noVNC 初始化慢）；
- 每 500ms 检查一次：只要焦点在 canvas/body（即用户没有在操作 noVNC 自己的控件）就重新聚焦；
- 点击桌面区域（mouseup/touchstart）后重新聚焦，保证"点一下就能继续敲"；
- 用户去操作 noVNC 的控件或面板输入框时完全不打扰（不抢焦点）；
- 支持粘贴：把剪贴板文本逐个键送进客户机。

## 验证（真实客户机截图）

| 步骤 | 结果 |
| --- | --- |
| 打开 `/workspace?service=desktop`，直接键入 `1234567` + Enter | 客户机控制台显示 `please input password: 1234567` → `Congratulation! You have passed the verification!`，每个字符只出现一次 |
| 点击桌面中间，再键入 `abc` + Enter | 控制台 `C:\Lab>abc`（shell 报"不是内部或外部命令"），同样没有重复 |
| noVNC 控件交互 | 鼠标点击、控制面板按钮不受影响（只在按键上做拦截） |

## 同步更新

- 题面（`output/win2000/lab-extra/challenge-description.md`）与客户机内 `C:\Lab\README.txt`：
  改成"打开桌面后键盘直接接续到客户机，插件抢键问题已在桌面页隔离"
- `data/dojos/003a97d0/dojo.yml` 与数据库题面
- 解题过程 PDF 常见问题同步改写
- 桌面工具条里的"外接输入框"控件与其脚本已移除
  （平台侧的 `workspace/type-text` 接口保留但不再对外暴露，仅作为运维兜底）
