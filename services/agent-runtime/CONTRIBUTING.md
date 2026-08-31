# 为玄甲全局智能体运行时贡献

这里不是独立产品仓库。所有修改都应服务于 `/teacher` 中的单一全局智能体，并遵循仓库根目录的 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

提交运行时修改时至少验证：

1. 身份、课程、文件、任务和发布状态仍以玄甲为唯一权威来源；
2. 没有新增独立登录、产品首页、课程中心或旁路 API；
3. 生成文件能以玄甲下载卡片交付，工具调用受会话和权限约束；
4. `pnpm test`、ESLint、TypeScript 和生产构建通过；
5. 对外路径、数据隔离和浏览器端到端验收通过。

更新 vendored 引擎时必须保留 MIT 许可证、上游版权和兼容所需的 `@openmaic/*` 包名。来源固定策略见 [`XUANJIA-INTEGRATION.md`](XUANJIA-INTEGRATION.md)。
