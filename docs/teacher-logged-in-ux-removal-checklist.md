# 教师端体验重构删除清单

日期：2026-08-27

本清单记录《教师登录后体验改进方案》实施后不再渲染或不再提供的重复入口、旧工作区和失效分支。兼容路由只负责把旧深链映射到新的同一对象事实，不保留第二套产品界面。

| 已移除内容 | 当前唯一替代 | 代码与自动验收证据 |
| --- | --- | --- |
| 独立“题目管理 / 题库”首页及重复 Hero、页签和创建按钮 | 课程壳层 `tab=questions` 的统一题目工作区 | `dojo_plugin/pages/learning.py` 仅兼容重定向；`ops/verify-course-content-contracts.py`、`ops/verify-course-center-ui.py` 验证旧 URL 与任务结果进入同一对象和视图 |
| 课程题目正常态中的逐题重命名、删除图标 | 点击“管理题目”进入管理模式后再拖拽、跨章节移动、重命名或删除 | `dojo_theme/static/js/dojo/teacher-courses.js`；`test/test_learning.py` 覆盖单题删除、跨章节移动、已发布题删除和活动任务保护 |
| 题目卡上的“管理第 N 题 / 管理草稿”等重复入口 | 选中题目后在同一详情抽屉完成预览、修订、验证和发布 | `dojo_theme/templates/teacher_courses.html`、`dojo_theme/static/js/dojo/teacher-courses.js`；`ops/verify-course-center-ui.py` 验证唯一工作区与学生安全预览 |
| 独立 Learning Studio 页面、重复质量首页及其前端脚本 | 课程壳层中的课件、题目、演示、学情工作区 | 已删除 `dojo_theme/templates/learning_studio.html` 和 `dojo_theme/static/js/dojo/learning-studio.js`；`test/test_learning.py` 与 `ops/verify-local.sh` 验证文件及 DOM 不再存在 |
| 工作区内旧“模拟演示引擎”及其 API、模板、脚本、样式 | 课程“演示”工作区中的统一演示详情与学生预览 | 已删除 `dojo_plugin/api/v1/simulation.py`、`dojo_theme/templates/components/simulation_workspace.html`、`dojo_theme/static/js/dojo/simulation.js`、`dojo_theme/static/css/simulation.css`；`ops/verify-teacher-agent-ui.py` 验证旧入口不可达 |
| 演示页两个同义 AI 创建入口、独立运行记录空框 | 唯一“新建演示”，先选择演示类型，再进入对应创建流程 | `dojo_theme/templates/teacher_courses.html`、`dojo_theme/static/js/dojo/teacher-courses.js`；`ops/verify-course-center-ui.py` 验证演示工作区布局与管理模式 |
| 课程概览中的大块课程码区域及页首“打开 AI 助手”按钮 | 课程标题旁的小型“课程码”按钮；点击后显示完整码、复制与更换操作 | `dojo_theme/templates/teacher_courses.html`、`dojo_theme/static/js/dojo/teacher-courses.js`；`ops/verify-course-center-ui.py` 验证弹窗、完整码和复制成功状态 |
| 全局右上角主题选择器 | 系统统一视觉主题 | `dojo_theme/templates/components/navbar.html`；`test/test_auth.py`、`test/test_settings_ui.py`、`ops/verify-teacher-agent-ui.py` 验证桌面与移动端不存在主题控件 |
| 个人资料页的 LinkedIn 与 X 分享按钮 | 资料编辑与成就查看 | `dojo_theme/templates/hacker.html`；`test/test_settings_ui.py` 验证分享入口不再渲染 |
| 课件预览外层重复工具栏 | 预览器内部唯一导航、缩放、目录和讲稿控制 | `dojo_theme/static/css/teaching-agent.css`、`services/agent-runtime/components/integrated-lesson-preview.tsx`；`ops/verify-teacher-agent-ui.py --artifact-preview-layout-only` 验证舞台利用率和唯一工具栏 |
| 教师默认界面中的原始提示词、内部阶段名、作者 ID 和模型调试信息 | 面向教师的目标、状态、数量、失败原因和下一步；受限审计数据仍保留在服务端 | `dojo_plugin/api/v1/teaching.py`、`dojo_theme/static/js/dojo/teaching-agent.js`；`ops/verify-teacher-agent-ui.py` 与输出契约测试验证默认序列化边界 |

## 保留的兼容边界

- `/teacher/courses/<dojo>/questions` 保留为旧链接兼容入口，但只重定向到 `/teacher/courses?dojo=<dojo>&tab=questions`，不会渲染旧 DOM。
- 旧学习工作室链接只恢复到课程壳层对应页签，不再加载已删除的模板、脚本或样式。
- 服务端仍保留必要的审计、版本和生成来源事实；这些数据不进入默认教师界面，更不会进入学生序列化结果。

## 删除完成门槛

- 删除项不能再被模板、静态资源或路由直接渲染。
- 兼容入口必须定位到同一 `draftId`、产物或课程事实，不能复制对象。
- 学生接口与学生预览不得包含标准解、Flag、教师备注、原始提示词或内部任务信息。
- 桌面、390px、320px 与 200% 文本缩放验收均须保持唯一主操作且无水平溢出。
