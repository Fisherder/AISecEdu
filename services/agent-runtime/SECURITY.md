# 玄甲全局智能体运行时安全说明

本目录是玄甲全局智能体的内部运行时，不具有独立的安全边界或披露渠道。漏洞报告、支持版本和响应流程统一遵循仓库根目录的 [`SECURITY.md`](../../SECURITY.md)。

集成安全边界与关键约束见 [`../../docs/global-agent-architecture.md`](../../docs/global-agent-architecture.md)：运行时不得拥有独立账户或课程权威；所有非健康请求必须通过玄甲身份、短时能力票据或内部服务认证；文件、工具和网络访问均受任务作用域约束。

上游 MIT 代码的来源和版本固定信息见 [`XUANJIA-INTEGRATION.md`](XUANJIA-INTEGRATION.md)。
