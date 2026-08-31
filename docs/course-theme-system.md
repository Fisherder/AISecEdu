# 玄甲课程主题系统

## 目标

全站使用同一套课程产品视觉语言，同时允许用户按环境和阅读偏好切换配色。主题只能改变视觉表达，不能改变导航层级、功能可见性或数据语义。

## 参考与取舍

- [Canvas LMS Instructor Guide](https://community.instructure.com/en/kb/canvas-lms-instructor-guide)：采用稳定的“全局导航—课程导航—内容区—上下文操作”层级，并保留课程卡片和明确的当前位置。
- [Moodle Navigation API](https://moodledev.io/docs/5.0/apis/core/navigation)：一级导航只展示预选的重要节点，低频操作使用抽屉、菜单或渐进披露，避免让用户被功能淹没。
- [Google Classroom](https://edu.google.com/workspace-for-education/products/classroom/)：围绕课程、课堂任务、待办、评分和反馈组织界面，教师与学生看到同一课程对象的不同工作视图。
- [Open edX runtime theming](https://docs.openedx.org/projects/edx-platform/en/latest/concepts/extension_points.html#design-tokens-theming)：使用按用途命名的设计令牌，通过 CSS 自定义属性在运行时换肤，不在业务组件内绑定具体颜色。

玄甲不复制任一产品的品牌外观。信息层级取 Canvas，渐进披露取 Moodle，任务模型取 Classroom，主题架构取 Open edX，再结合 CTF 与全局智能体形成自己的课程系统。

## 内置主题

| 标识 | 名称 | 模式 | 适用场景 | 主色 |
| --- | --- | --- | --- | --- |
| `academy` | 学院蓝 | 浅色 | 默认、日常授课、投屏 | `#3157c8` |
| `forest` | 书院绿 | 浅色 | 长时间阅读、自然柔和 | `#3f7729` |
| `sunrise` | 暖沙橙 | 浅色 | 低刺激、纸张质感 | `#a64b14` |
| `midnight` | 深海夜 | 深色 | 夜间、实验室、低眩光 | `#7ba2ff` |

所有主题的正文与页面背景、主按钮文字与主色对比度不得低于 WCAG AA 的 4.5:1。

## 令牌层级

1. `--theme-*`：主题源令牌，定义主色、状态色、背景、表面、边框、文字和阴影。
2. `--ui-*`：旧版 CTFd 和通用组件兼容层。
3. `--product-*`：课程目录、课程中心、学情等产品组件。
4. `--cs-*`、`--agent-*`：课程工作流和 AI 工作台的局部别名。

业务组件只能读取语义令牌。新增组件不得直接写入品牌主色，也不得根据主题名称分叉业务逻辑。

## 交互契约

- 顶部导航始终显示带文字的“主题”按钮，不依赖难以理解的太阳/月亮图标。
- 选择器同时展示名称、用途说明和颜色样本，并使用 `menuitemradio` 暴露当前选择。
- 支持鼠标、触控、Tab、方向键、Home、End 与 Escape。
- 选择写入 `aisecedu-palette`；旧的 `aisecedu-theme=light|dark` 自动迁移。
- 浅色主题之间切换时仍记住最后一次选择；从深海夜切回浅色时恢复该选择。
- 主题变化通过 `aisecedu:themechange` 广播，事件同时包含 `theme`（明暗模式）和 `palette`（具体主题），供全局智能体的嵌入式预览同步。

## 验收范围

- 教师：课程中心、全局智能体、课件产物、CTF 与演示管理、学情。
- 学生：学习中心、课程目录、课程单元、任务、AI 助学、学情记录。
- 通用：登录注册、搜索、弹窗、表单、表格、账户菜单、工作区。
- 视口：至少覆盖 1920×1080 桌面和 390×844 移动端。
- 每套主题都要验证令牌唯一性、持久化、活动状态、正文/主按钮对比度和无横向溢出。
