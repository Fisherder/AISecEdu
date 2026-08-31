# 旧实现、兼容入口与删除清单

版本：2026-08-28

本清单防止重构后长期保留两套导航、状态、请求层或写入路径。状态只有“已删除”“兼容观察”“保留基础设施”三种；兼容观察项必须有退出条件。

## 已删除

| 旧实现 | canonical 替代 | 证据 |
| --- | --- | --- |
| 题目级 `simulation` 工作区与独立模拟 API/CSS/JS | 统一题目 attempt/runtime/evidence；演示属于课程演示管理 | 旧 `service=simulation` 返回说明清楚的 410；源码与 API namespace 已移除。 |
| 独立 `learning_studio` 页面和脚本 | 教师课程工作区与 AI 共创 | 旧入口 canonical redirect；模板和脚本已删除。 |
| 课程页常驻的课件、题目、演示和深度学情全量请求 | 当前页签 bootstrap + 按需 collection | 网络与性能验收确认隐藏页签不提前请求。 |
| 页面级重复 fetch/JSON unwrap | `core/request-client.js` | 统一超时、Abort、去重、有限重试、错误 envelope 和写后失效。 |
| 多处自行解释发布/任务/工作区状态 | 共享 status/async/task/batch/workspace 组件 | unknown 状态安全回退并记录遥测。 |
| 普通状态下裸露的题目/演示重命名和删除按钮 | 显式管理模式 | 拖拽/键盘排序、跨章节移动、重命名和删除只在管理模式出现。 |
| 已删除题目仍保留“重新发布”入口 | authoritative delete + 列表刷新 | 删除成功后对象从集合消失，不再用伪 lifecycle 卡片保留。 |
| 顶栏主题快捷按钮及资料页社交分享按钮 | 账户设置中的外观偏好；无社交分享 | 静态与浏览器断言。 |

## 兼容观察

| 入口/适配器 | 当前行为 | 删除条件 | 预计阶段 |
| --- | --- | --- | --- |
| `/learning` | 308 到 canonical `/student`，保留 query | 旧调用聚合量连续一个发布周期为零 | 下一主版本 |
| `/sensai`、旧 AI 深链 | 保留安全 query 的 canonical redirect | 所有站内链接及通知已使用 `/guide`，旧调用归零 | 下一主版本 |
| `/forgot-password`、旧 reset 深链 | 308 到 `/reset_password` | 外部文档和邮件模板更新，调用归零 | 下一主版本 |
| 旧课程/题目深链 | ResourceResolver 返回 canonical、moved/archived/deleted/forbidden | 索引与通知全部迁移，410/moved 观测稳定 | 分对象评审 |
| CTFd 高级管理入口 | 从教育运营管理壳进入，底层数据仍单写 CTFd | 所有操作已有分页 presenter、capability、审计与验收 | 不早于下一主版本 |
| 学生 legacy 读取视图 | `STUDENT_UX_V2_MODE=disabled` 回滚路径 | 100% 稳定运行两个发布周期且完成一次回滚演练 | 后续独立清理版本 |

## 保留基础设施

- CTFd 的挑战、用户、提交与会话表仍是权威基础设施，不因产品壳重构而复制或删除。
- `ResourceResolver`、统一 envelope、capability bootstrap、审计事件和共享状态枚举是长期契约，不属于临时 adapter。
- 教学后台 job、batch/item 和学习证据表保存事实；UI 不维护第二套完成状态。

## 删除门禁

删除任何兼容项前必须同时满足：

1. 全站模板、脚本、通知和搜索结果不再生成旧链接。
2. redirect/deprecation 聚合事件连续一个完整发布周期为零。
3. 深链、浏览器历史和书签迁移测试通过，无 redirect loop。
4. 数据读取、权限与错误恢复已有 canonical 替代。
5. 删除变更可独立回滚，且不包含 schema drop。
6. 更新本清单、发布说明、支持文档和 `ops/verify-system-ux.py`。

