# AISecEdu 开发入口

团队使用 `10.92.35.7` 上现有的完整开发平台，每人在个人源码副本开发，通过提交、审查和预约完成共享联调。新成员无需自行搭建整套 Docker、Kata、Nix 或 Windows 客户机。

| 需要做的事 | 阅读入口 |
| --- | --- |
| 第一次接入和完成首个任务 | [新成员开发手册](development/onboarding.md) |
| 确认代码、接口、测试和发布要求 | [统一开发规范](development/standards.md) |
| 开通成员、管理基线、安排验收 | [维护者操作手册](development/operations.md) |
| 查看已经完成的准备及接入项 | [准备与验收记录](development/preparation-20261028.md) |
| 理解系统边界 | [架构](architecture.md)、[全局智能体](global-agent-architecture.md) |
| 使用现有完整开发平台 | [开发环境与版本推广](generation-development-workflow.md) |
| 编写或维护题目与作业 | [分层出题规范](../dojo_plugin/authoring_standards/README.md) |

开发要求统一维护在 `development/standards.md`，接入命令以新成员手册为准。历史运维文档保留了旧地址和生产示例，不作为新人日常命令。

团队快速检查为 `make dev-check`。完整平台测试与部署由维护者安排。新增配置时，在 `dojo/dojo-init` 定义默认值，在实际 Compose 服务中传递，按需在 `dojo_plugin/config.py` 读取，并同步配置样例和相关检查。
