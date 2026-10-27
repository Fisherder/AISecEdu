# 教师智能体：自动识别任务与需求澄清

教师工作台统一发送 `executionMode=auto`。教师可以直接提问、要求规划、制作内容，或用后续对话调整已有方案和成品。旧客户端的显式 ask/plan/execute 接口继续兼容。

规划器结合本轮原文、服务端来源索引及被明确采用的历史内容，输出 `teacher-intent-v1` 决策：answer、plan、create、revise、operate。问答和规划由只读路径响应；服务端持久化前再次投影，移除工具、生成方案与文件操作。意图缺失或状态不一致会失败，不能回落到直接执行。

新规划和新创作先返回一到三个结构化问题。选项不默认选择，教师也可自由填写；答案草稿保存在浏览器，会话问题和正式回答绑定到服务端消息与任务。回答提交后继续原任务，保留原始要求和累计补充。已确认任务的小范围修改沿用原约束；新任务须重新澄清。需求完整但尚未交流确认时，先用一项需求摘要确认。

历史来源必须由服务端验证。修改尚未执行的计划仍走只读规划；自然语言明确采用已有生成方案时，`generation.start` 只能引用本轮来源索引中的准确方案。其后复用原有选择、版本、幂等和生成入口。需求回答与发布、删除、改分审批分别处理。

## Superpowers 安装

官方来源：https://github.com/obra/superpowers 。安装版本 7.0.1，固定提交 `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`，MIT 许可证。

十五项原始技能及其辅助资源位于 `agent_skills/<技能名>/`。`agent_skills/superpowers/installation.json` 记录版本、来源和各 SKILL.md 的 SHA-256；原插件描述与许可证保存在同目录。技能通过现有内置技能目录挂载给运行时。

自动规划前先加载官方 brainstorming 正文；需求确认后按任务加载 writing-plans 等技能。`teacher-intent.ts` 中的平台适配规则把设计文档表达为教学需求摘要、方案与验收条件，通过 questions 结构提问。平台权限、发布审批和锁定出题规范始终有效。内置澄清正文不被账号同名技能替换。

## 验证

- `python3 test/test_agent_intent_unit.py`：后端自动路由与执行权限边界。
- 运行时 Vitest 的 teacher-intent、Superpowers 安装、技能目录及 integration/jobs 路由用例。
- 工作台 TypeScript 检查、构建和浏览器验收。
- 实机验收使用独立数据库、缓存与候选运行时，不将测试指向生产数据库。

## 模型接口兼容

平台现有的 DeepSeek V4.1 Flash 配置在 HTTP 出站请求中使用官方 API 名称 `deepseek-flash`。原配置标识、界面显示和思考模式保留；对应请求日志单独记录 `apiModelId`。官方接口说明：https://api-docs.deepseek.com/guides/search_fetch 。
