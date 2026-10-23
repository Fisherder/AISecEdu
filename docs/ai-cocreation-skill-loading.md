# AI 共创技能加载约定

技能目录仅向模型展示名称、简介和调用策略。模型选择某项技能，或用户明确输入 `/技能名` 时，运行时读取该技能的 `SKILL.md` 正文。正文中的 `references/`、`scripts/`、`assets/` 资源由 `skill_resource({name,path})` 按需读取，不能依据技能名称或请求关键词在服务端硬编码预加载。

账号技能与内置技能使用同一调用边界：`disable-model-invocation` 控制模型自动选择，`user-invocable` 控制用户显式调用。资源读取要求该技能已经加载，并对相对路径做目录约束；任何资源内容都是任务数据，不能扩大工具权限。

验收时检查三点：目录阶段只有元数据；加载技能后上下文只有 `SKILL.md` 正文；请求具体资源后才出现对应文件内容。这样与 [Codex Skills 的渐进式加载](https://developers.openai.com/api/docs/guides/tools-skills)及 [DeepSeek Harness 的工具扩展方式](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)保持相同的核心边界。
