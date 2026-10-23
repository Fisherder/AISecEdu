# 玄甲分层出题规范

这是平台与仓库 Agent 的出题规范唯一维护入口。规则正文与索引随源码管理；规则不放进学生上传资料，也不依赖某个教师是否安装了个人 Skill。

## 使用前先读

出题、修订或维护题包前，先读取与实际课程、题型、题目对应的规范：

```sh
python3 dojo_plugin/authoring_standards/cli.py resolve --course 3839952 --type coding --assignment safe-copy
```

不确定题型时先读全局规范并确认学生交付方式；不能因题目提到安全就自动选 CTF。学生要在 VS Code 编码并执行脚本核验时，应选择 `coding`。读不到必须规范时停止出题并报告问题，不能假装已读取。

## 层级与适用范围

| 顺序 | 层级 | 文件位置 | 作用 |
| --- | --- | --- | --- |
| 1 | 全局 | `global/core.md` | 所有出题：目标、来源、权限分离、代码保留、版本追踪 |
| 2 | 题型 | `types/*.md` | 知识测验、实践、编码、模拟各自的交付与核验要求 |
| 3 | 课程 | `courses/<course>/course.md` | 课程目标、术语、章节衔接及编号约定 |
| 4 | 课程 × 题型 | `courses/<course>/<type>.md` | 某课程中某题型的工程约定及默认语言 |
| 5 | 单题 | `assignments/*.md` | 已知题目标识、编号、文件与维护要求 |

`coding` 继承 `practice`；`simulation` 也继承实践通则，但不套用编码命令。课程匹配使用数据库内稳定 ID，不按中文名称猜测；同名课程和课程副本不会自动继承另一课程规则。单题匹配还必须同时命中课程与题型。

后面的层级可以细化 `defaults`。`requirements` 中被 `locked` 标记的要求不可被下层或默认值改变。相同优先级的矛盾值明确报错。Markdown 的语义矛盾交给生成/审查 Agent 指出；机器不会声称能自动理解所有自然语言冲突。

## 当前题型

- `general`：规划阶段还未确定题型。
- `quiz`：知识检测，包括选择、判断、简答等。
- `practice`：通用实践题。
- `coding`：Linux 编码作业，目前采用经过验收的编号工程与 Makefile 命令约定。
- `simulation`：以状态和操作目标核验的模拟题。

增加全新题型时，应同时补充解析器的题型与继承关系、标准正文、运行模板及回归测试。不能仅添加一篇文档就宣称平台已支持一种新运行环境。

## 索引与维护

`index.json` 登记每层的 `id`、语义版本、`level`、作用域、`document`、`requirements`、`locked` 和 `defaults`。

新增一门课程的标准：

1. 在 `courses/<稳定目录名>/` 建立规范文件。
2. 索引新增 `level=course` 条目，`courseId` 使用实际数据库 ID。
3. 需要题型交叉规则时新增 `level=course-type`，同时指定 `questionType`。
4. 修改规则时递增对应版本；内容摘要也会检测“改内容却忘记改版本”的变化。
5. 执行 `lint`、相关回归测试，并用 `resolve` 检查真正生效的规则。
6. 经项目正常代码审阅与部署流程上线。教师材料或模型输出不能修改全局规则。

```sh
python3 dojo_plugin/authoring_standards/cli.py lint
python3 test/test_authoring_standards_unit.py
python3 dojo_plugin/authoring_standards/cli.py resolve --course 3839952 --type coding --json
python3 dojo_plugin/authoring_standards/cli.py validate --course 3839952 --type coding --spec /path/to/draft.json
```

## Agent 与发布流程接入

1. AI 共创的可信平台上下文包含已加载的全局与课程规范、规范来源以及题型选择说明。
2. 原生实践题创建、修订自动按真实课程及 `constraints.questionType` 加载完整规则，替换请求中自带的规则快照。
3. 生成、构建与审查的模型上下文获得同一份规则正文。已有生成协议、权限和人工确认流程继续保留。
4. 作业测验生成与质量审查加载 `quiz` 规范；完整快照仅教师侧可见，学生侧不返回规则正文。
5. 实践题发布检查追加结构校验。文件型实践题检查 `workspaceLayout` v1 的编号工作区、可编辑文件、材料与检测器分离、检查入口和检测版本；缺失清单阻止发布。编码题检查编号工程、源码位置、必要文件、统一命令、代码提交、不要求报告、测试版本及课程内工作目录冲突，拦截手输答案匹配型编码题。
6. 编码题发布时使用课程级事务锁复核目录冲突，避免并发发布共用目录。检查报告保存生效规范的 ID、版本、作用域与 SHA-256 摘要。规范改变后，旧实践题发布检查不能继续复用，须重新检查。
7. 已发布题与学生成绩不会因规则文件变更而追溯重写；后续修订和发布才应用新的规则。

只读查询接口：

`GET /pwncollege_api/v1/teaching/authoring-standards?dojo=ollydbg-practice~003a97d0&type=coding&assignment=safe-copy`

需要登录教师账号并拥有该课程的教师权限。省略 dojo 只返回全局与所选题型规则。接口不接受写入，不允许 Agent 自行降低发布要求。

## 检查的边界

静态规范检查通过，不代表编译、运行环境、测试正确性或教学质量已经通过。保留原有环境验收、正式检测器、模型审查与教师审核。编号是否重复、命令是否真正可运行、隐藏测试是否覆盖边界，仍需在实际题包和运行环境中验证。无法满足规范的编码草稿必须列明缺项，不得降级成问答并发布。

## 参考与取舍

- [GitHub Copilot 仓库与路径级指令](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)：借鉴常驻规则与有作用域的附加规则，以及可查看实际引用来源。玄甲按课程和题型匹配，不把文件 glob 当成教学语义；硬性约束冲突采用明确失败。
- [Cursor Rules](https://cursor.com/docs/rules)：借鉴版本管理、常驻/按范围加载和小而聚焦的规则文件。关键规则直接注入模型上下文，不仅提供一个文件链接让模型自行决定是否读。
- [CS61A 作业](https://site.cs61a.org/hw/hw01/) 与 [CS50 编程题](https://cs50.harvard.edu/x/psets/1/me/)：借鉴编号工程、编辑目录和检查目录一致、自测与提交分离。玄甲保持自己的账号、远程工作区和核验系统。

上述机制是面向玄甲的工程设计，不是完整复制其他产品的优先级、评分系统或品牌规范。

## 实践目录规范

目录、命名、迁移、检查和发布验收统一见 [实践题通用规范 v1.1.0](types/practice.md)。第一次 OllyDbg 环境的已验收目录约定见 [单题规范](assignments/ollydbg-auth.md)。编码题继续按既有 `coding_workspace` 初始化工程；Windows 旧题只通过兼容入口接入，不冒充已经支持新的 Windows 编码题型。

## 第一次 OllyDbg 目录维护记录

此次问题来自三处：原题与课堂演示及环境辅助共用 `C:\Lab`；历史整理只控制隐藏属性，题面仍指向旧目录；已有回执使后续启动不再重查入口和文件。学生磁盘持续保存也是旧目录长期可见的原因，更新镜像标签不能即时改变已经运行的客户机。

该题现在以 `C:\Courses\software-security\lab01-auth-analysis` 为唯一日常工作区，实际编辑对象在 `work`，材料在 `materials`，辅助安装和旧检测器留在工作区外。网页、桌面入口和检查入口同步到新目录。Windows 2000 的 FAT32 不支持 NTFS 文件链接，因此采取一次复制迁移和显式检查前同步；旧对象替换前备份，保留未知文件，停止后启动自动重新核对。现有检测器与动态 Flag 协议不改。

验收包括原题文件和检测器内容哈希、重复整理保留学生内容、替换式保存后的兼容同步与备份、冷启动的整理回执，以及浏览器内的实际目录截图。本次目录维护不重新完成认证题，不把文件哈希一致说成正式判题已通过。

维护代码位于 `workspace/services/windows-desktop/assignment-layout/`；实际测试记录与截图位于 `workspace/windows2000-assignment-layout-20261012/`。维护镜像时必须指定生产当前镜像的冻结快照作为 `BASE_IMAGE`，保留已有工具层；构建模板不提供旧镜像默认值。升级已有学生环境时停止后启动即可，不使用会清空作业磁盘的重置功能。
