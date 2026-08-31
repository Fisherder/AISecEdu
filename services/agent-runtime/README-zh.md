# 玄甲全局智能体内部运行时

本目录承载玄甲教师全局智能体的内部能力：教学文件生成与编辑、课件渲染、互动课堂、模型编排和受控工具执行。教师只通过 `/teacher` 与同一个全局智能体交互；这里不是第二个产品，也没有独立登录、课程中心或对外部署入口。

- 身份、权限、课程、对话、任务、文件、审批、发布和学习证据均由玄甲持有。
- 集成请求必须携带短时玄甲会话能力票据或内部服务凭据。
- 非集成模式仅保留健康检查，其余页面和 API 返回 404。
- `/agent-runtime` 根路径及历史兼容路径只会回到 `/teacher`。
- 教师要求文件时，产物写入玄甲权威存储，并在全局智能体对话中返回可下载文件卡片。

现行架构见 [`../../docs/global-agent-architecture.md`](../../docs/global-agent-architecture.md)，部署与回滚见 [`../../docs/global-agent-operations.md`](../../docs/global-agent-operations.md)。

## 上游来源

渲染器和互动课堂能力源自 MIT 许可的 OpenMAIC。为保持依赖兼容和许可证归属，`@openmaic/*` 等供应链包名与版权文件会保留；它们不构成玄甲中的产品身份。原始上游说明归档在 [`UPSTREAM-README.md`](UPSTREAM-README.md)，精确来源记录见 [`XUANJIA-INTEGRATION.md`](XUANJIA-INTEGRATION.md)。
