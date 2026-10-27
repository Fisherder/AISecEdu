# 润尼尔 / iLab 实验数据对接

接口依据为 2026-10-27 读取的[实验对接 API](https://api.owvlab.net/page/expdocking.html)，特别是“人工智能+”对接（2026）。入口网站为 https://api.vr-mooc.com/。

润尼尔是实验接入、用户与预约识别、报告及成绩回收平台。平台把用户送到玄甲实验入口，玄甲将本次实验的数据回传给润尼尔。沟通记录中由润尼尔整理后推送 iLab；本接入不直接调用 iLab，也不代表项目已经通过润尼尔或 iLab 上线验收。

## 配置与启用

由平台管理员使用既有登录会话与 CSRF 机制配置：

`PUT /pwncollege_api/v1/rainier/applications/<真实 appId>`

```json
{
  "host": "https://api.vr-mooc.com",
  "dojoId": 3839952,
  "challengeId": 1508,
  "enabled": false,
  "sendEnabled": false,
  "autoSubmit": false,
  "strictIlab": true,
  "expectedSeconds": 180,
  "timezone": "Asia/Shanghai",
  "reportKeys": {"summary": "text1", "score": "text2"},
  "modelDeployment": "公有云服务",
  "modelProvider": "DeepSeek"
}
```

课程和题目标识只是既有安全编码作业的配置示例，不会自动成为对接范围。必须根据真实项目确认；模型部署方式、服务商、合理用时和报告模板键也应按实际环境配置。`expectedSeconds` 是教学预期用时，不是对实际作答时间的修改。

所有项目默认未配置。`enabled` 控制是否接受该项目的启动链接；`sendEnabled` 单独控制正式发送；`autoSubmit` 控制新评测是否自动入回传队列。首次联调保持发送关闭，通过预览和双方测试后再开启。配置存于 CTFd Configs 的 `rainier_applications_v1`，不需要在源码填写账号密码。只有平台管理员可修改，所有修改记录审计。

对方登记的实验地址应是学生可访问的主站地址加 `/integrations/rainier/launch`。润尼尔追加 `token=appId_expId`、`sequenceCode` 和 `host`。实验入口只接受预先配置的 HTTPS host，不会跟随启动参数向任意服务发送请求。

## 身份与作答范围

1. 启动参数暂存 Redis 15 分钟，浏览器跳转到无参数地址；签名会话只保存随机引用，不保存序列码。沿用现有不记录查询参数的日志配置，并添加 no-store / no-referrer 响应头。
2. 学生使用自己的既有玄甲账号登录，点击验证预约。服务端以表单请求 `POST <host>/openapi/<appId>` 验证 `sequenceCode`，核对返回的 expId 和服务端用户身份。优先采用带 `id:` 命名空间的稳定用户 id；兼容未返回 id 的旧平台时，采用带 `number:` 命名空间的非空 numberId。测试账号的 numberId 可以为空，不能据此拒绝有效的服务端用户 id；格式异常的 id 则直接拒绝。不会把 URL 中的姓名或 code 当作认证依据，也不自动创建用户、加入私有课程或授予教师权限。
3. 每个远端账号与本地账号绑定唯一；预约不能转绑其他学生。绑定有效期为 24 小时。
4. 进入后须新启动本题。只将匹配课程、题目、用户及预约时间的新 attempt 关联进来，历史作答不批量迁入。重启产生的新 epoch 可以继续关联同一次预约。

## 数据映射

| 目标字段 | 玄甲来源 / 处理 |
| --- | --- |
| appId、expId | 经过服务端认证的预约，不能使用用户任填的标识 |
| reportData | 正式评测总分与本次实验摘要；模板键可配置 |
| expScoreDetails | 关联 attempt 的实际证据时间线与一项正式评测总分 |
| ai_data.ai_call_count | Tutor、当前单题 Guide、过程评分及安全编码复核中的实际模型请求数，包含请求失败和重试 |
| ai_models_used | 请求模型标识及响应返回的实际模型标识；接口未返回独立版本号时使用模型标识，部署方式/服务商来自已确认的项目配置 |
| ai_usage_scenarios | 根据实际执行能力记录的场景，不依据学生输入关键词推测 |
| ai_input_token_count、ai_output_token_count | 服务商 usage；某次调用没有可信计数时省略对应总数，不能将未知量填为零 |

评分保持玄甲原始规则，回传原始正式评测总分按四舍五入转为接口所需整数（例如 94.5→95），摘要明确保留原值。过程观察步骤标记 False，不另加分；正式总分步骤标记 True，不重新把 60/40 或编码 80/20 量规拼成另一套成绩。

步骤时间使用 UTC 原始记录转换为上海时区，保留实际先后顺序。观察区间不是命令执行时长，备注会明确说明。密集的同秒观察不制造虚假的秒级顺序；超过接口数量上限时将相邻实际观察合并为区间，并记录合并数量。严格模式要求 10–200 步、首末跨度至少 180 秒；不足时预览返回具体缺项，不补造事件、时长或分数。证据链不完整、AI 请求尚未取得终态时也不冻结提交。

回传不包含原始命令、源码、完整问答、提示词、私有解法、Flag、Cookie、序列码或模型密钥。教师出题、其他学生、其他预约及多题混合 Guide 不计入本预约统计。当前集成面向有 LearningAttempt / LearningAssessment 的实验题目；课程级聚合、独立课堂产物或 Inquiry 数据需要单独确认对接范围，不能冒用题目作答事实。

没有实际 AI 请求时省略 `ai_data`。官方文档规定：主动提交时模型/场景数组不能为空，即使调用次数为 0 也一样；不传时由平台保留已有值或生成缺省值。因此不能为通过校验编造模型或场景。重复使用同一预约但没有本地 AI 记录时，平台“保留已有记录”的语义也应在联调时核对。

## 提交与核对

- 学生在评分页点击“实验平台回传”，或访问 `/integrations/rainier/status`，查看步骤数量、成绩、AI 次数和正式发送状态。
- `GET /pwncollege_api/v1/rainier/assessments/<assessmentId>/preview` 仅预览本人的当前预约数据，不向外发送。
- `POST /pwncollege_api/v1/rainier/assessments/<assessmentId>/submit` 冻结最新正式评测的请求并持久入队；重复调用复用同一记录。
- `GET /pwncollege_api/v1/rainier/submissions` 查询自己的回传状态及请求 SHA-256。

复用已有 TeachingJobs / SQL Outbox / teaching-worker，新增任务种类 `rainier.submit`，不新增后台常驻服务。发送前重查项目开关、目的地、预约、最新评测和冻结请求摘要。旧评测不能覆盖新评测。平台必须同时返回 HTTP 200 和 JSON `code=200`（数值或字符串）才标记 SENT；业务码 19 标记 REJECTED。

文档没有提供远端幂等键。连接/响应超时等情况标记 UNCERTAIN；进程发送途中终止会保留 SENDING，不会盲目重传。同预约存在未确认旧发送时，新发送被阻止。管理员先在润尼尔查看对应预约结果，确认原任务已经结束后调用：

`POST /pwncollege_api/v1/rainier/submissions/<id>/reconcile`

```json
{"remoteState":"saved","reason":"已在平台核对该预约报告和分数"}
```

或明确确认远端没有保存后，使用 `not-saved` 和具体核对依据请求重新入队。二者均写审计记录。不能把“请求已入队”“HTTP 可达”“本地测试通过”当作正式保存成功。

## 部署与验证

新增五张 `rainier_*` 表，由现有插件 schema 初始化在部署时创建。不修改旧课程、评分、作答或证据表结构。AI 请求统计通过独立短事务持久化，只保存调用元数据，避免业务事务回滚后把已发生的请求漏计；该元数据表故意不对正在被业务事务锁定的 attempt 设置外键。

部署后平滑重载 CTFd；在没有活动任务时重启 `teaching-worker`、`teaching-interactive-worker`、`teaching-coding-worker`，让旧进程载入新处理器。其他 Python worker 下次维护重启时同步载入。没有项目配置时不接受任何预约、不发送任何实验数据。

独立测试不使用生产数据库和真实平台凭据：

```sh
python3 -m pytest --noconftest -q test/test_rainier_unit.py
```

覆盖账号/预约隔离、配置权限、步骤不足、真实时间与分数映射、AI 字段类型与缺失 usage、业务错误码、超时、重复提交和实际 HTTP 表单/JSON 传输。正式联调还需要真实 appId、平台生成的启动链接、确认的实验映射、报告模板键及可访问的主站入口。

官方步骤说明中存在文字矛盾：有的行把 expectTime 写成结束时间、有的行写开始时间大于结束时间；详细字段表却定义 endTime 为结束时间、expectTime 为合理用时秒数。本实现按详细字段表及联合示例执行 startTime < endTime、expectTime 为整数。零分观察、满分 100 和 False 非计分步骤的实际接收行为仍须由正式联调核验，不能以本地契约测试代替对方认可。
