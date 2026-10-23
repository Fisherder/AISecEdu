# 系统提示（横幅/通知）样式与时长统一调整（2026-09-21）

## 需求

1. 更美观：半透明、配色更柔和；
2. 显示时间缩短，并按文字长短自适应；
3. 系统内所有同类提示统一。

## 改动

### 1. 工作区/题目页底部横幅（`dojo_theme/templates/components/actionbar.html`、`js/dojo/actionbar.js`）

- 外观：背景改为 **82% 不透明度**（`color-mix`，并保留纯色回退）、`backdrop-filter: blur(8px) saturate(1.1)`、
  圆角 0.85em、1.5px 边框 + 轻投影；高度与内边距收紧（不再占 4em 高）。
- 动画：重写 `@keyframes banner-animation`，保留"从中间展开"的手感，但加入淡入淡出与
  轻微位移动效，缓动 `cubic-bezier(0.22,0.61,0.36,1)`。
- **时长按文字长度计算**（替换原来固定 20 秒 / 5 秒）：
  `时长 = clamp(1.5s, 0.9s + 65ms × 字数, 5.2s)`，错误类提示上限放宽到 7 秒；
  每次调用写入 `animation-duration`，因此长短提示显示时间各不相同。
- 实测（浏览器计算样式）：`background: color(srgb … / 0.82)`、
  `backdrop-filter: blur(8px) saturate(1.1)`、`border-radius: 15.3px`、`animation-duration` 随调用设置 ✓

### 2. 学习空间/引导页/作业页的提示（`js/dojo/learning-common.js::showNotice`）

同样的长度自适应规则（`0.9s + 65ms × 字数`，普通上限 5.2s、危险类 7s），并加上
`clearTimeout` 防抖，避免连续提示互相覆盖。

### 3. 通用 alert 提示（`css/custom.css`）

统一为半透明底 + 圆角 0.75rem + 轻投影 + 背景模糊，并按 info/success/warning/danger
四类给出柔和配色（`rgba(...)` 0.16–0.18 透明度）。

## 生效方式

- 全部为前端资源改动：**刷新页面即生效**；
- 资源版本号同步升级（`base.html` 的 CSS 版本、`workspace.html` / `module.html` 的资源版本），
  避免浏览器继续使用缓存里的旧样式与旧时长。
