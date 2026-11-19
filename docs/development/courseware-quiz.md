# 课件出题模块

贡献者：hunry-1-code。功能来源为贡献者的“智慧课程建设”项目中的课件检索、证据校验、题型适配和退回补题流程；服务端实现接入玄甲现有材料、测验、审校和命令系统。

## 使用入口

教师在已有对话中选择目标课程，附上可读取的课程材料，提出测验要求，再执行 `assignment.generate` 提议。现有客户端提交的 `sourceJobId` 用来查找当前教师、当前对话中已成功完成的 `agent.chat` 任务；只有这个任务保存的材料引用会进入出题操作。任务未完成、属于其他用户或其他对话时拒绝执行。没有材料引用的原有请求继续走旧生成流程。

新增模块只接收平台已有材料索引，未增加上传、OCR 或页码选择器。材料须属于当前用户，且位于目标课程或用户自己的未归课材料中；归属另一课程的材料由现有查询拒绝。索引与分析必须完整，材料版本和 SHA-256 必须匹配。教师可在测验编辑页逐题展开原文依据，查看材料名、分块序号和版本。分块序号从 0 开始，不等于 PDF 页码。

首版支持 `MULTIPLE_CHOICE`（单选）、`TRUE_FALSE`（判断）、`SHORT_ANSWER`（简答）。内部适配原项目的 `single`、`judgment`、`short`；填空、辩论及配套实践题不在本模式内。若需严格限定题型，下面的直接生成 API 支持 `questionTypes`；现有对话工具仍使用自己的参数合同。

## 直接生成 API

`POST /pwncollege_api/v1/coursework/dojos/<dojo_id>/assignments/generate`

使用平台登录态、课程教师权限和既有 CSRF 请求客户端。`dojo_id` 使用平台真实课程标识；下面的材料标识仅为字段示例，必须替换成当前教师可访问的实际记录。

```json
{
  "prompt": "根据所选材料，生成考查规则匹配顺序的测验",
  "questionCount": 3,
  "moduleIndex": 0,
  "kind": "QUIZ",
  "questionTypes": ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"],
  "sourceRefs": [
    {"type": "material", "id": "<material-id>", "revisionId": "<revision-id>"}
  ]
}
```

`questionCount` 为 1–20；`sourceRefs` 为 1–8 个不同材料。引用仅允许 `type`、`id`、可选 `revisionId` 和 `sha256`，未知字段报错，避免将页码选择误当成已经执行。未指定版本时由平台解析当前版本，并在结果中固定版本及摘要。`questionTypes` 表示允许的题型，不表示每种题型的数量配额；省略时允许以上三种。`sourceRefs: []` 会报错，不会退回普通出题。只有 `questionTypes` 而没有材料引用也会报错。

成功返回 HTTP 201，使用既有结构：

```json
{
  "success": true,
  "data": {
    "assignment": {
      "id": "<assignment-id>",
      "status": "DRAFT",
      "settings": {
        "generation": {
          "mode": "COURSEWARE",
          "fallback": false,
          "requestedQuestionCount": 3,
          "generatedQuestionCount": 3,
          "qualityReview": {"status": "MODEL_REVIEWED", "humanReviewed": false},
          "groundingAudit": {"status": "VALIDATED"}
        }
      }
    }
  }
}
```

示例省略了常规测验字段、题目与完整审查报告。每题的 `editConfig.coursewareEvidence` 包含 `sourceId`、`materialId`、`revisionId`、`sha256`、材料名、`ordinal`、索引给出的 `sourceLocator`、`quote` 和片段摘要。元数据由服务端读取的材料重建，不接受模型自报的材料身份。摘要用于追踪和比较，不是签名证明。

错误保留平台 `error_contract`，并提供顶层 `code`、`message`。本模块的 422 响应只在 `details` 中返回已有的 `requestedCount`、`acceptedCount`、`rounds`；不会返回模型服务原始异常、原文或部分答案。

| HTTP / code | 含义与处理 |
| --- | --- |
| 422 `INVALID_SOURCES` | 材料引用为空、重复、类型或范围字段不支持；修改选择 |
| 422 `INVALID_TYPES` | 不支持的题型，或在课件模式混入实践题；拆分任务 |
| 422 `MATERIALS_NOT_READY` | 读取后的材料索引、版本或原文不完整；重新处理材料 |
| 422 `INSUFFICIENT_QUESTIONS` | 规定轮次内合格独立题不足；调整材料、题数或要求后重试 |
| 422 `MODEL_UNAVAILABLE` | 模型调用失败；修复服务配置或稍后重试 |
| 422 `GENERATION_TIMEOUT` | 总预算耗尽；缩小请求后重试 |
| 422 `REVIEW_FAILED` | 独立审校或审校后的最终证据检查未通过；调整请求 |
| 400 `INVALID_REQUEST` | 常规参数错误，或现有材料服务报告无权读取、版本不匹配、索引未就绪 |
| 404 `NOT_FOUND` | 直接 API 的课程教师作用域检查失败；沿用平台隐藏私有课程的规则 |

匿名访问继续由平台登录装饰器处理。教师对话入口沿用其现有 403/409 错误及异步任务失败合同，不套用直接 API 的 422 状态。所有失败都不会通过普通出题兜底生成课件测验。

## 生成与审查

1. 按实际课程稳定 ID 解析 `quiz` 分层出题规范；规范解析失败时停止。
2. 在平台返回的原文摘录内检索，优先覆盖每份所选材料。最多向模型提供 24 个片段，每段 2,000 字符，记录截断状态。这个范围不等于整份材料都已送入模型。
3. 最多三轮生成，退回具体不合格原因，后续轮次只补缺额。检查类型、答案、四个不同选项、简答参考答案与量规、题干去重和原文引用；不靠拼凑兜底题补齐。
4. 每题引用须为实际发送片段中的连续原文。匹配只做 NFKC 和空白归一，保留运算符与标点；引用存在只说明文本匹配，不保证学科答案正确。
5. 复用既有独立模型审校，最多三轮。审校也收到同一批原文和出题规范，修订后所有题目再次通过类型、数量、去重与证据检查。

生成与审校共同使用 180 秒预算，每次调用设置剩余时限且只尝试一次，最多六次模型调用。材料读取不计入这个模型阶段预算。模型与密钥沿用平台 `DOJO_AI_AUTHORING_PLAN_MODEL`、`model_json` 和服务端配置；模块不新增浏览器密钥配置、不携带原项目个人密钥、不调用原项目联网工具。

## 保存、可见性与编辑

通过检查的题目保存为原生测验草稿；答案沿用平台归一化与评分。证据使用题目 `config`，生成报告使用测验 `settings.generation`，无需数据库迁移。教师可见完整编辑配置；学生响应不包含 `editConfig`、证据或整个 `generation`，参考答案继续遵守测验的答案公布策略。

编辑题干、答案、解析、证据、题名、分值或整卷标题/说明会将旧报告标为 `STALE`，且保留原材料引用。未改变内容的保存不使报告过期。已存在的课件生成记录不能通过编辑 `settings.generation` 替换。发布沿用原入口；首版会提示教师重新核对，尚未增加编辑后的自动审校接口或强制阻止过期报告发布的规则。`VALIDATED` 不代表教师已经审核，也不是发布许可。

教师对话任务沿用命令幂等键、请求摘要、租约、取消与 `command.prepared`：完整准备结果持久化后，命令恢复复用该结果，再按既有事务创建测验。来源任务 ID 已包含在既有请求摘要中。没有引入另一套 Worker、终态或任务表。

首版没有逐题保存中间结果；在 `command.prepared` 写入前失败或 Worker 中断，需要重新生成。取消在现有命令检查点生效，不承诺中途即时中断正在进行的模型调用。直接生成 API 仍是同步创建接口，没有新增幂等键，网络断开后应先核对已有草稿再重发。

## 验证与联调

无需数据库、模型或服务容器的检查：

```sh
make dev-check
python3 test/test_courseware_quiz_unit.py
node --check dojo_theme/static/js/dojo/teacher-assignment.js
git diff --check
```

核心与接入测试共 28 项。接入测试通过 AST 加载实际函数，使用合成材料、脚本化模型及模拟数据库边界；验证教师身份传递、来源任务归属条件、数量失败不落库、旧流程回归、学生字段隔离和编辑审查过期。这些测试不替代真实数据库与角色隔离验收。

浏览器组件测试需要可用的 Playwright 与 Chromium：

```sh
node --test test/browser/courseware-quiz-editor.cjs
```

可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指向本机 Chrome。测试运行实际模板主体、脚本和样式，模拟 API，禁止网络请求，检查 1280px/390px 的证据展示、HTML 转义、编辑保存和审查过期提示。它不是已部署平台的端到端测试。

实际联调由维护者按[统一开发规范](standards.md)安排：登记任务与预约，提供独立测试课程、材料和教师/学生身份，解析真实课程的 `quiz` 规范后，验证真实模型质量、角色与课程隔离、数据库保存、重试/取消/Worker 恢复、编辑发布、学生作答和评分。平台 TypeScript 服务未修改；其构建及相关 Vitest 作为完整联调检查另行执行，个人仓库当前没有该服务的依赖安装。

## 审查与恢复

`api/v1/teaching.py` 仅扩展一处条件，让测验生成复用现有的来源任务读取；`tool_executor.py` 传递这些材料引用与已认证用户。需要负责教师工具入口的维护者复核这两处和异步命令边界。直接生成 API 增加可选材料模式及 422 错误，需接口负责人复核；`jobs.py`、命令实现、共享数据库模型和评分代码未修改。

部署时插件、相关 Worker 与主题必须使用同一审核版本。回退使用本任务提交的反向补丁或维护者固定的前一版本，无数据库回滚要求。旧代码会忽略新增证据字段，但不会显示新的证据界面和过期提醒；因此回退后仍需由教师人工核对存量草稿。PR 目标分支在提交 PR 前由维护者确认，不应默认将整份协作基线合入 `main`。
