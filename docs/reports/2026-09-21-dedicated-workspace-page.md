# 图形环境改为在独立工作区页面打开（2026-09-21）

## 背景

题目页原来会把工作区 iframe 直接嵌进来：启动题目后，页面自动把远程桌面（noVNC）或 VS Code 拉进
题目页的 `#workspace-iframe`，桌面与题面、AI 助手面板挤在同一页。学生反馈图形环境必须在独立的工作区
页面打开，否则键盘、鼠标输入和窗口焦点容易和题目页其他内容互相抢占。

## 改动

判定标准是服务的**类型**，不是某一道题：`desktop`、`code`、`vscode`、`code-server` 归为
「需要独立页面」的图形环境，终端（ttyd）类仍然可以嵌在题目页里用。

- `dojo_theme/templates/module.html`
  - 新增 `[data-workspace-dedicated-hint]` 提示卡片：说明图形环境在独立页面打开，并给出
    「打开实验环境」以及每个服务一个直达按钮（`/workspace?service=<name>`，新标签页打开）。
  - 附带样式与资源版本号。
- `dojo_theme/static/js/dojo/actionbar.js`
  - 新增 `requiresDedicatedWorkspacePage()`（按服务名判断）与提示卡片的显隐控制。
  - `loadWorkspace()` 的 popout 分支（题目页）：如果命中图形环境，不再加载 iframe，改为显示提示卡片，
    并清空 iframe 的 src。
  - `selectService()`：仅在 popout 模式（题目页）且命中图形环境时改写为在新标签页打开工作区页面；
    **独立工作区页面（popout=false）不受影响**，仍然在原地嵌入桌面/VS Code。

## 验证（真实浏览器 + 真实容器）

| 场景 | 结果 |
| --- | --- |
| 题目页（软件安全实验一，Desktop: 6080） | 显示「图形环境在独立的工作区页面打开」提示卡片，`#workspace-iframe` 的 src 为空，桌面不再嵌入题目页 |
| 题目页点「Desktop」服务按钮 | 新标签页打开 `/workspace?service=desktop` |
| 独立工作区页面 `/workspace?service=desktop` | 远程桌面正常嵌入并显示 Windows 2000 桌面，底部工具条（重启/停止/重置/sudo、粘贴/复制、输入 Flag）可用 |
| 终端类环境（代码路径） | `desktop/code/vscode/code-server` 之外的服务仍走原来的内嵌逻辑 |

## 题目页清理（同日追加）

提示卡片上线后，题目页里的 `.iframe-wrapper`、工作区加载面板与相关 CSS 已经没有用处，一并删除：

- `dojo_theme/templates/module.html`：移除 `.iframe-wrapper`（含内嵌 iframe）与 `components/workspace_loading.html`
  的引入，删除只服务于 iframe 的 `.challenge-iframe` 样式；页面现在只剩提示卡片、SSH 说明和底部工具条。
- `dojo_theme/static/js/dojo/challenges.js`：不再在启动流程里动态创建 iframe（原来有两处
  `item.find(".iframe-wrapper").html("<iframe ...>")`），并修正启动后"显示工作区面板 / 隐藏启动按钮"
  的逻辑，使其不再依赖 iframe 是否存在。
- `dojo_theme/static/js/dojo/actionbar.js`：`loadWorkspace()` 在没有 iframe 时也能工作——先取到工具条，
  再按服务类型决定显示提示卡片还是加载 iframe；`showDedicatedHint()` 不再操作已删除的节点。

实测：题目页 `#workspace-iframe`、`.iframe-wrapper`、`[data-workspace-loading]` 三个选择器匹配数都是 0，
提示卡片正常显示；点击 Desktop 仍在新标签页打开 `/workspace?service=desktop`；独立工作区页面照旧在内嵌
iframe 中渲染桌面。

注：题目页顶部那个「启动题目」按钮块（`.challenge-init`）由服务端按"当前是否为本页题目"渲染为隐藏，
只有折叠列表（dojo 页）里的停止回调会把它重新显示出来——这是本次改动之前就存在的行为，不在本次范围内；
题目页上重新启动环境仍然走底部工具条的「重启」。

## 影响文件

- `dojo_theme/templates/module.html`
- `dojo_theme/static/js/dojo/actionbar.js`
- `dojo_theme/templates/workspace.html`（资源版本号）
- `dojo_theme/static/js/dojo/challenges.js`
- `output/pdf/build_platform_manuals.py`（学生使用说明补充该行为与独立工作区页面截图）
