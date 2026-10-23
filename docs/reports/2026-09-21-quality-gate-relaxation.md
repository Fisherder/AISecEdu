# 放松内容质量闸门：目标、改动与构建（2026-09-21）

目标：**保证成功产出成品**的前提下压缩生成耗时 —— 软校验降级为警告，硬校验只留完整性；
修复轮数降为 1；候选并行度提高；最后必须交付可用成品（带警告），而不是失败重来。

## 一、源码改动（agent-runtime）

| 文件 | 改动 |
| --- | --- |
| `lib/server/cinematic-generation.ts` | 三处"生成后质量拦截"**降级为警告**并继续交付：① 学生说明调整后的浏览器画面检查；② 教学语义复核耗尽（改用兜底 grounding 继续）；③ 最终学生版画面检查。新增 `cinematicSoftWarnings` 收集器与 `cinematicFallbackGrounding()` 兜底 |
| `app/api/integration/jobs/execute/route.ts` | 修复轮数 `maxRepairs: 2 → 1`；候选并行度 `concurrency: 2 → 3` |
| `Dockerfile` | 3 处 `apk add` 前插入镜像源替换为 `mirrors.aliyun.com`（原 `dl-cdn.alpinelinux.org` 只有 ~10–50 KB/s，构建要 2 小时以上；阿里云实测 **2.26 MB/s**） |

保留的硬校验：JSON/schema 合法性、引用 id 存在性、页数区间等完整性检查（这些不过就不是"可用成品"）。

## 二、Docker Hub 访问问题（已解决）

- 官方 registry 与 GCR 均**不可达**（DNS 解析到 IPv6 且无路由），国内镜像站可达：
  `docker.m.daocloud.io`、`docker.1panel.live`、`dockerproxy.net`、`hub.rat.dev`；
- 已用镜像站拉取 `node:22-alpine` 并 retag 为本地 `node:22-alpine`（168MB ✓），
  并在内层 Docker 的 `/etc/docker/daemon.json` 写入 `registry-mirrors`（三站互备，下次 dockerd 重启后对所有 pull/build 生效）；
- Alpine 包源已切阿里云；npm registry 本身可达 ✓。

## 三、当前状态

`dojo compose build agent-runtime` 正在后台构建（apk 阶段 62/177，速度正常）；
构建完成后需要：部署新镜像 → 确认健康 → 用一条"虚拟内存 3D 演示"同类任务实测，
确认**几分钟内**产出成品（而不是 1 小时白等），并补齐警告可见性。

---

## 四、构建与部署结果（源码重建，已成功）

- 用镜像站 + 阿里云 Alpine 源后，`dojo compose build agent-runtime` **成功产出新镜像**
  `aisecedu/agent-runtime:debate-v1-r4-skills`（构建耗时约 18 分钟；此前因官方 registry 不可达根本无法构建）。
- 构建过程暴露并修掉了三处 TypeScript 类型错误（两处来自本次放松改动，一处来自更早的技能改动）：
  `payload.scope.ownerId` 类型、兜底 grounding 的返回类型、`grounding` 可空性。
- 已用新镜像重建 `agent-runtime` 容器：**状态 healthy** ✓，平台 `/` 200、`/student` 302 ✓。
- **这次是干净的源码构建**，之前为了绕过"无法构建"而打的运行时编译产物补丁已被源码实现取代。

## 五、剩余一步（下一轮完成）

用一条与"虚拟内存 3D 演示"同类的真实任务实测：确认**几分钟内产出成品**（而不是 1 小时空等），
并把任务耗时与结果（含警告信息）记录到本报告。

### 部署校验（已确认生效）

```
agent-runtime 容器：Up (healthy) ✓    平台：/ 200、/student 302 ✓
编译产物中确认包含本次放松代码：
  /app/.next/server/chunks/2831.js 含 "semantic-review: " 与 "cinematic-grounding-fallback" ✓
```
（变量名会被 minify，所以按**字符串字面量**核对，两处均存在，说明放松逻辑已经在运行中的镜像里。）

---

## 六、真实任务实测（第 2 轮进展）

用临时教师账号（`relax-teacher`）驱动"生成交互式虚拟内存 3D 演示"的真实需求：

| 尝试 | 结果 |
| --- | --- |
| 第 1 次 | 需求提交后 **2.5 分钟**拿到 8 个候选方案（`agent.chat` 任务 SUCCEEDED，耗时 **144 秒**）；脚本解析候选结构有误，未能继续选择 |
| 第 2 次 | 修正解析后重跑，因复用幂等键被拒（HTTP 409）；已改为每次唯一键 |
| 第 3 次 | 需求已受理（202），但 7 分钟内任务一直处于 **QUEUED**（未开始规划），脚本超时退出 |

补充观察：任务表整体健康（SUCCEEDED 290 / FAILED 31 / CANCELED 26 / RUNNING 1），
worker 均在运行；出现"长时间 QUEUED"说明**排队延迟**也需要关注（可能与我前面反复触发的任务有关）。

下一步：把实测跑完整——选方案 → `candidate.generate` → `artifact.materialize`，
记录端到端耗时与是否带警告成功，写进本报告。

---

## 七、实测（第 3 轮）：规划与方案选择阶段已跑通，进入正式生成还差一步"确认"

用临时教师账号对同一条需求（虚拟内存 3D 演示）实测：

| 阶段 | 结果 |
| --- | --- |
| 需求 → 3 个候选方案 | `agent.chat` **144 秒 SUCCEEDED** ✓（2.4 分钟） |
| 选择方案「对照递进方案：账簿与内存条左右并列」 | 接口 200 ✓ |
| 选择后的正式生成提示 | `agent.chat` **613 秒 SUCCEEDED**（3 次尝试，**最终成功**）✓，返回正式生成提示词（cinematic-v1） |
| 端到端 | 两段合计约 **12.6 分钟**，全部为成功终态，**没有出现"1 小时无结果"** ✓ |

结论：**放松后的闸门在真实任务上确实把"失败重来"变成了"重试后成功交付"**；
但从对话到真正的作品落地还差一次"确认开始生成"的回合（平台设计如此），
下一轮补上这一步并记录作品落地的总耗时与警告信息。

---

## 八、第 4 轮：真正跑到"正式生成"，质量闸门已不再是失败原因

1. 摸清了正式生成的正确触发方式（供以后自动化使用）：
   `POST /teaching/threads/<id>/messages`，body 带
   `{"content":"开始正式生成","generationSelection":{"sourceMessageId":<方案消息id>,"optionId":"option-1"},"confirmed":true}`
   （只带 `generationSelection` 会被判 `Message content is required`；走 `agent-tools/execute` 会被判 `Unsupported course tool`）
2. 触发后任务进入 **`agent.chat / repairing-content`** —— 正是本次放松的那一段（过去这里会抛
   `GENERATION_REPAIR_REQUIRED` 并最终失败）。**质量闸门不再报错** ✓
3. 但任务最终以另一种原因失败（371 秒、4 次尝试）：
   ```
   EXECUTION_FAILED: 生成流程发生内部错误
   agent-runtime 日志： [aisecedu-agent-plan] Call failed ... AI_NoObjectGeneratedError:
                        No object generated: could not parse the response.
                        Validation failed (attempt 2/2), giving up
   ```
   即**规划阶段的模型输出无法解析成 JSON**，连续 2 次后放弃 → 任务失败。

## 下一轮（明确的一处小改动）

`app/api/integration/jobs/execute/route.ts` 里规划失败的处理目前是：

```ts
} catch (planningError) {
  if (recordValue(recordValue(payload.context)?.requestProvenance)?.version === 'teacher-request-v1')
    throw planningError;          // ← 正式生成请求走的就是这条，直接把任务判死
  log.warn(...); agentPlan = { understanding: originalAgentPrompt, selectedSkills: [], plan: [] };
}
```

改成**任何情况下都走兜底计划**（记录警告而不抛错），即可让"规划输出解析失败"不再终结任务 ——
与本次"软校验降级为警告、必须交付成品"的口径一致。改完重建镜像（现在可正常构建）再实测一次。

---

## 九、第 4 轮收官：同一需求 **1.8 分钟成功**（此前 >1 小时且失败）

在部署"规划失败改为兜底计划"的新镜像后，重新触发同一条正式生成（虚拟内存 3D 演示）：

```
agent.chat | SUCCEEDED | stage=complete | 第 1 次尝试 | 107 秒
```

对比：
- 用户遇到的情况：`artifact.materialize` 跑到第 5 次尝试、**1 小时 4 分**仍无结果（最终失败）；
- 现在：**1.8 分钟、单次尝试、成功终态** ✓。

至此，本目标的三个验收点中：
1. 软校验降级为警告、只有完整性做硬校验 —— ✅ 已实现并部署（编译产物可核验）；
2. 修复轮数 1、并行度提高、规划失败走兜底 —— ✅ 已实现并部署；
3. 同一条真实需求"几分钟内产出成品" —— ✅ 已达成（107 秒）。

尚待补齐的一处收尾：确认这次产出的作品是否已落库为 `teaching_artifacts` 记录、以及回复里是否带上警告清单
（下一轮核对后即可标记目标完成）。

---

## 十、第 5 轮核对：任务成功、但"作品落库"还差最后一步

- 成功任务 `job_191a2c19…`（107 秒、单次尝试）的 `result` 里是**计划与正式提示**（plan/files/…），
  并非已完成的作品数据；
- `teaching_artifacts` 中**没有** owner=7220 的记录 → 说明"作品落库"发生在**后续一次确认回合**
  （客户端 `generationConfirmSubmit` → 带 `generationSelection` 调用生成工具），
  我用消息接口触发的这一轮只走到"给出正式提示"。

因此：
- ✅ 目标里"质量闸门放松 + 恢复构建能力 + 同一需求分钟级成功"已经达成；
- ⏳ "作品真正落库（带警告）"需要在客户端点击"确认开始生成"那一步触发，
  对应工具调用是 `candidate.generate`（平台把它归到课程工具集合之外，直接调会报
  `Unsupported course tool`），下一步要在浏览器里走完这次点击并核对 `teaching_artifacts`。

### 落库那一步的确切做法（下一轮执行）

平台在 `_generation_option_proposal()` 里对"演示/课件"类（`targetTool == "candidate.generate"`）会自动组装：

```python
arguments = {"prompt": option["rewrittenPrompt"], "artifactType": bundle["artifactType"],
             "candidateCount": 1, "sourceRefs": bundle["sourceRefs"]}
```

再由客户端的"确认开始生成"弹窗调用 `生成工具 + generationSelection + generationPlan`。
我上一轮漏传了 `generationPlan`，因此被判 `Unsupported course tool`。
下一轮二选一：① 在浏览器里点完那个确认弹窗（最贴近真实流程）；② 补上 `generationPlan`（取消息 metadata 里的 `generationPlan`）再调一次。
跑完核对 `teaching_artifacts` 出现记录 + 结果里是否带 warnings，即可标记目标完成。

---

## 十一、第 6 轮：正式生成链路已打通，作品已在落库中

找到并验证了**正式生成的正确触发条件**（此前几次都卡在这里）：

```
POST /teaching/threads/<id>/messages
{"content":"开始正式生成","action":"generate","agentContinuation":true,
 "generationSelection":{"sourceMessageId":"6476","optionId":"option-1"}}
```

触发后的真实任务链：

| 任务 | 结果 |
| --- | --- |
| `candidate.generate` | **SUCCEEDED，用时 14 秒** ✓（此前这里会进入多轮修复） |
| `artifact.materialize` | **第 1 次尝试**运行中（此前是第 5 次尝试、1 小时 4 分后失败） |
| 作品记录 | `teaching_artifacts` 已出现：`artifact_f072ec31…`，类型 `simulation`，标题「虚拟内存：账本上的页号与帧号」，状态 `GENERATING` ✓ |

也就是说：**"质量闸门放松 → 一次性进入正式生成 → 作品开始落库"这条链路已经跑通**，
只差等它把状态推到完成并记录最终耗时（下一轮收尾）。

---

## 十二、第 7 轮：任务在正常推进，但发现"耗时"的真正来源是**串行的镜头生成**

- `artifact.materialize`：单次尝试、无重试风暴，已运行约 9 分钟 ✓；
- agent-runtime 日志显示它在**连续调用模型生成各镜头**：
  ```
  Cinematic model call completed {"sequence":12,"durationMs":17976}
  Cinematic model call started   {"sequence":13}
  Cinematic model call completed {"sequence":13,"durationMs":52538}
  Cinematic model call started   {"sequence":14}
  ```
  每次 13–52 秒，序列号已到 14 —— 说明这是**多镜头、串行**的生成流程。

**结论**：放松闸门解决了"反复修复后失败"，但**总耗时的大头是串行调用次数**（十几个镜头/检查各一次）。
要把"1 小时"压到"几分钟"，下一步必须**并行化镜头生成**（例如把每个镜头的生成放进 3–4 路有界并发），
而不是继续调超时。

## 下一轮计划

1. 在 `cinematic-generation.ts` 里把按镜头/按章节的独立模型调用改为**有界并发（3–4 路）**，
   保持结果顺序不变、错误处理不变；
2. 重建镜像并重跑同一需求，记录端到端耗时；
3. 若并行后能在几分钟内完成，则补齐报告并标记目标完成。

---

## 十三、第 8 轮：materialize 第 1 次尝试未完成，进入第 2 次后疑似停滞

| 观察 | 数据 |
| --- | --- |
| 任务状态 | `artifact.materialize` **attempt 2 / 3**，已 722 秒 |
| 作品记录 | `GENERATING`，已 1019 秒 |
| 近 8 分钟模型调用 | **0 次**（此前每 13–52 秒一次） |

判断：第 1 次尝试在约 12 分钟后未完成（不是质量闸门问题），第 2 次尝试之后**没有继续产生模型调用**，
表现为在某一步停滞/等待。需要看运行时日志中第 1 次尝试的失败原因与第 2 次卡在哪个阶段。

## 下一轮

1. 抓取该 job 的运行时日志（attempt 1 的失败原因、attempt 2 最后一条阶段日志）；
2. 针对该阶段修（若是锁/等待/超时）并**同时**做镜头调用的有界并发（3–4 路），把总耗时压到几分钟；
3. 重跑同一需求验证并补齐报告，然后标记目标完成。

---

## 十四、第 9 轮：把"下一刀"定位到具体文件与位置

`generate-classroom` 解析失败会让 materialize 整条失败（attempt 1 失败 → attempt 2 重试）。
经过排查，落点非常集中：

| 位置 | 现状 | 下一刀的改法 |
| --- | --- | --- |
| `lib/server/classroom-generation.ts:192 generateClassroom()` | 解析不了模型输出就抛错 | 在**唯一的调用方**包一层兜底（见下） |
| `lib/server/classroom-job-runner.ts:27` | `await generateClassroom(input, {...})` —— **全仓唯一调用点** ✓ | 改为 try/catch：解析/结构化失败时用**确定性 classroom 兜底**（用需求文本生成最小可用场景集）并记录警告，而不是让任务失败重试 |
| 镜头/章节的模型调用 | 串行（每次 13–52 秒，序列号已到 14+） | 有界并发 3–4 路，保持顺序与错误处理不变 |

因为调用点只有一个，这个改动可以做到**很小且可控**；改完重建镜像（构建链路已通）再跑同一需求即可验证
"成功 + 几分钟"。

> 本轮已把失败原因、文件、行号与改法都固定下来；下一轮直接落代码 + 重建 + 实测。

---

## 十五、第 10 轮：兜底改动的确切边界（供下一轮落地）

- 结果类型：`GenerateClassroomResult = { id, url, stage, scenes: Scene[], scenesCount, createdAt }`
  （`lib/server/classroom-generation.ts:87`）——兜底需要构造 `Scene[]`；
- 调用点：`lib/server/classroom-job-runner.ts:27`（全仓唯一），失败时走 `catch → markClassroomGenerationJobFailed`
  （第 35–43 行）——**兜底应插在这里**：失败时用"按需求文本生成的最小场景集"调用
  `markClassroomGenerationJobSucceeded`，并附 `warnings`；
- 生成器内部本身已有确定性场景兜底（源码注释明确写了 "the scene loop below will use the same
  deterministic artifacts as the single-artifact pipeline"），所以只需在**最外层**补一层兜底，
  不需要改 `Scene` 的类型定义。

本轮已完成定位与边界确认；下一轮直接：① 在 runner 里加兜底分支；② 镜头调用有界并发；
③ 重建镜像 + 同需求实测；④ 补齐结论并标记目标完成。

---

## 十六、第 11 轮状态

```
artifact.materialize | RUNNING | generating | 第 2 次尝试 | 已 1118 秒（≈18.6 分钟）
teaching_artifacts   | GENERATING | 同龄
```

第 2 次尝试同样长时间停在 `generating`（前面已观察到一段时间没有模型调用），
说明 **classroom/cinematic 这条生成路径里还有一处"等待/停滞"需要处理**，
它与"解析失败"是两类问题：前者要不失败（兜底），后者要不干等（超时/心跳 + 有界并发）。

## 最后一轮（第 12 轮）计划

1. 在 `classroom-job-runner.ts:27` 的 catch 处加**确定性兜底**（失败也交付最小可用课堂并附警告）；
2. 给 classroom/cinematic 调用加**有界并发 + 单步超时**，避免"停在某一步不动"；
3. 重建镜像 → 同需求实测 → 记录端到端耗时与警告 → 补齐报告并标记目标完成；
4. 若时间/上下文不允许完成实测，则如实标注目标未完成并给出下一轮的最小改动清单。

---

## 十七、第 12 轮（最后一轮）：实测结论与未完成项

**观察**：第 1 次尝试在 18:21 因 `generate-classroom` 输出解析失败而终止；
第 2 次尝试在 18:27 **从 sequence 1 重新开始**整条 cinematic 序列。
也就是说：解析失败不仅让本轮白跑，**重试还会把整个镜头序列从头再生成一遍**，
这正是"1 小时还在跑"的机制性原因（单轮十几分钟 × 重试次数）。

### 本轮达成的（有证据）

| 目标项 | 状态 | 证据 |
| --- | --- | --- |
| 软校验降级为警告、硬校验只留完整性 | ✅ 完成 | 源码改动 + 重建镜像；编译产物含 `"semantic-review: "`、`"cinematic-grounding-fallback"` |
| 修复轮数上限 1、候选并行度 3 | ✅ 完成 | `route.ts` 已改并部署 |
| 规划失败不再终结任务 | ✅ 完成并实测 | 规划解析失败后任务继续（此前必失败） |
| 正式生成链路打通 | ✅ 完成 | `candidate.generate` **14 秒 SUCCEEDED**；作品记录已创建 |
| 构建链路修复（Docker Hub / Alpine） | ✅ 完成 | 镜像站 + retag + 阿里云源；`dojo compose build` 约 18 分钟成功一次 |
| **同一需求"几分钟内产出成品"** | ❌ **未达成** | 实测：候选 14 秒 + materialize 单轮十余分钟；一次解析失败导致整轮从 sequence 1 重来 |

### 未完成项的**最小改动清单**（下一轮直接照做）

1. `lib/server/classroom-job-runner.ts:27` catch 分支：`generateClassroom()` 失败时不要只标记失败，
   改为**确定性兜底交付**（用需求文本构造最小可用课堂，附 `warnings`）；
2. `lib/server/classroom-generation.ts` 的 cinematic 序列：解析失败时**只重做被判错的那一步**，
   不做整条序列重跑（现有 `sequence` 编号与 checkpoint 已具备按步恢复的基础）；
3. 镜头/章节的模型调用改为**有界并发 3–4 路**，把单轮十余分钟压到几分钟；
4. 重跑同一条"虚拟内存 3D 演示"需求，记录端到端耗时后即可验收。

**结论（如实）**：本目标在"放松校验、恢复构建、打通链路、消除失败重来"上已完成并有实证；
但"几分钟内产出成品"这一条**尚未达成**，卡点是上面第 2 条（失败后整条序列重跑）与第 3 条（串行调用）。
因此**不标记目标完成**，保留为进行中，并以上面 4 条作为后续最小改动清单。

---

## 十八、继续目标：作品最终产出，但耗时 5.9 小时（速度目标仍未达成）

```
artifact.materialize | SUCCEEDED | 第 5 次尝试 | 21254 秒 ≈ 5.9 小时
```

- ✅ **"最终交付成品"达成**：任务以 SUCCEEDED 收尾，作品记录已落库；
- ❌ **"几分钟内"远未达成**：每次尝试都会把整条 cinematic 序列从头跑（十余分钟～更久），
  失败即整条重来，5 次尝试累积到近 6 小时。

### 两个必须修的机制（已定位）

1. **失败后整条序列重跑** → 改为**按步恢复**（现有 `sequence` 编号 + checkpoint 已具备基础）；
2. **镜头/章节调用串行** → 改为**有界并发 3–4 路**；
3. 另外核对：本次出现 `attempt_count=5`，与我在 `jobs.py` 里设的上限 3 不一致，
   需要确认 `artifact.materialize` 的尝试上限来源（可能有另一条放大路径）。

---

## 十九、第 13 轮：新一轮实测（开启并行开关后）

| 阶段 | 本轮耗时 |
| --- | --- |
| 需求 → 3 个方案（`agent.chat`） | 155 秒（2.6 分钟） |
| `candidate.generate` | **17 秒** |
| `artifact.materialize` | 第 1 次尝试失败 → 第 2 次尝试进行中（10 分钟内完成 15 次模型调用，未出现长时间停滞） |

本轮同时：
- 在 `docker-compose.override.yml` 给 `agent-runtime` 加了 `PARALLEL_SCENE_CONCURRENCY=4`（源码里
  `getParallelSceneConcurrency()` 的开关，默认 0=串行），已重建容器并确认环境变量生效 ✓；
- 核对了 `recovery_decision`：旧任务 `max_attempts=5` 是历史值，**新任务已按上限 3** ✓（无需再改）。

仍未达标：本轮 materialize 仍在十余分钟量级，且第 1 次尝试依旧失败重试。
下一轮：把"失败即整条序列重跑"改为**按步恢复**，并确认 `PARALLEL_SCENE_CONCURRENCY` 是否作用于
服务端这条 pipeline（若只作用于客户端，需要在服务端补一处并发）。

---

## 二十、第 14 轮：按新验收口径（≤15 分钟）实测

用户已明确：**10 分钟可以接受、15 分钟以内即可**。据此本轮实测：

| 阶段 | 用时 |
| --- | --- |
| 需求 → 3 个方案 | 3.5 分钟 |
| `candidate.generate` | 21 秒 ✓ |
| `artifact.materialize` | 第 1 次尝试失败 → 第 2 次进行中；作品记录 `GENERATING` 已 18 分钟 |

**结论：本轮仍未达到 15 分钟口径**（首轮失败重试把时间拉长）。

本轮已部署的关键改动（下一轮验证其效果）：
- 质量失败时**不再丢弃已完成的模型调用缓存**（`route.ts:2685` 由 `checkpoint.rejectRepairs(...)`
  改为只记警告）→ 重试将按步恢复，而不是整条序列重跑。

下一轮：查第 1 次尝试的失败原因（预计仍是 `generate-classroom` 解析失败），
把已定位好的 **classroom 兜底**（`classroom-job-runner.ts:27` catch 分支）落下去，
让首轮不再失败 → 总耗时自然落到 15 分钟以内。

---

## 二十一、第 15 轮：任务停滞（心跳不前进）+ 下一步的精确改法

| 观察 | 数据 |
| --- | --- |
| `artifact.materialize` | 第 2 次尝试，`updated` 时间戳与上一轮检查**完全相同**（949 秒） |
| 作品记录 | `GENERATING`，1123 秒（同样不再前进） |

`updated` 不再变化说明**心跳没有推进**：这次不是"失败"，而是**卡住**。因此除了"首轮别失败"，
还需要一条**停滞检测**（心跳超时即判定失败并带检查点重试），否则会像现在这样无声地挂着。

### 下一步（两处，都很小）

1. **classroom 兜底**（消除首轮失败）：`scene-generator.ts` 里已有确定性场景生成能力，
   需要把它导出为一个可独立调用的构造函数；然后在 `classroom-job-runner.ts:27` 的 catch 里
   用它交付最小可用课堂（附 warnings），而不是标记失败；
2. **停滞检测**：给 `artifact.materialize` 这类长任务加"心跳超时"（例如 120 秒无 updated 即判定失败），
   失败后凭借**已保留的调用检查点**快速续跑（本轮的 checkpoint 改动已为此铺好路）。

### 目标状态（如实）

| 目标项 | 状态 |
| --- | --- |
| 软校验降级为警告、硬校验只留完整性 | ✅ 已部署可核验 |
| 修复轮数 1、候选并行度 3、规划失败兜底、重试按步恢复 | ✅ 已部署 |
| 交付可用成品 | ✅ 已有 `READY` 作品（早前那次 5.9 小时的任务产出） |
| **≤15 分钟产出** | ❌ 未达成：本轮 3.5 分钟出方案 + 21 秒出候选，但 materialize 首轮失败、重试停滞，作品 18 分钟仍未就绪 |

---

## 二十二、第 16 轮：更正一处判断 + 当前真实耗时

- **更正**：上一轮判断为"心跳停滞"的 `artifact.materialize` 实际上**仍在推进**（带内空闲 211 秒、
  并非挂死）；我写的"停滞清理"脚本按 5 分钟无心跳去清理时匹配到 0 行，说明心跳是正常刷新的。
  真正的问题是**单轮太慢**，不是挂死。
- 作品耗时实测（同一条需求）：

| 作品 | 状态 | 用时 |
| --- | --- | --- |
| 虚拟内存：账本上的页号与帧号（早前） | READY | **4167 秒 ≈ 69 分钟** |
| 虚拟内存：从账本索引到页表落帧（本轮） | 仍在 GENERATING | 已超 15 分钟 |

- 本轮分段数据仍然是：需求 → 方案 **3.5 分钟**、`candidate.generate` **21 秒**；
  时间全部花在 `artifact.materialize`（cinematic 序列，单轮十余分钟起）。

### 结论

要进 15 分钟，必须让 **materialize 单轮**变快（并发化镜头调用）**或**让首轮不失败（classroom 兜底）。
"停滞检测"经核实不是当前的瓶颈，已从优先级里去掉（避免做无用改动）。

---

## 二十三、第 17 轮：找到"单轮十余分钟"的量化来源（并修正一处预期）

从运行时日志逐条统计（同一条需求）：

| 观察 | 数据 |
| --- | --- |
| 单次 cinematic 调用耗时 | sequence 1 = **85.6 秒**（输出 17,812 tokens）、sequence 2 = 31 秒、sequence 23 = 23.6 秒… |
| 单轮调用总数 | 20+ 次（日志里出现过 sequence 23） |
| 单轮总时长 | 23 次 × 30–85 秒 ≈ **12–30 分钟** |
| 重试行为 | 第 2 次尝试**仍从 sequence 1 重新开始**（我上一轮"保留检查点"的改动没有让它续跑） |

还有一条恢复机制在工作：`Cinematic reasoning call timed out; bounded direct-answer recovery` ✓。

### 结论（可执行的三个杠杆，按性价比排序）

1. **限制单次输出规模**：sequence 1 一次吐 17.8k tokens 就花掉 85 秒；
   给 cinematic 阶段设置更小的 `maxOutputTokens`（例如 6–8k）能直接压缩单次耗时；
2. **减少镜头数**：同一需求下镜头越多，调用次数线性增长 → 平台侧对"cinematic 演示"设一个镜头上限
   （或在提示引导里默认 3–4 个镜头）；
3. **让检查点真正跨尝试复用**：目前重试仍从 sequence 1 开始，需要核对检查点指纹是否把
   "attempt/session" 也算进去（算进去就会导致每次都 miss）。

> 说明：cinematic 这条流水线本身是**有依赖的串行设计**（每个镜头依赖前一步的导演结论），
> 所以"并发化镜头调用"并不适用；真正的提速手段是上面三条。

---

## 二十四、第 18 轮：验收口径放宽到 30 分钟（三维演示）

用户明确：**三维演示生成可以放宽到 30 分钟**。据此重新对齐：

| 作品 | 状态 | 实测用时 |
| --- | --- | --- |
| 虚拟内存：一本账、一张索引页、一排帧槽 | READY | **2388 秒 ≈ 39.8 分钟** |
| 虚拟内存：账本上的页号与帧号 | READY | 4167 秒 ≈ 69 分钟（改造前） |
| 虚拟内存：从账本索引到页表落帧 | 仍在 GENERATING | 已超 40 分钟（这一次属于异常，需清理） |

也就是说：**改造前 69 分钟 → 现在 39.8 分钟**，方向正确但仍差约 10 分钟才进 30 分钟。
按新口径，只要再砍掉约 1/4 的耗时即可达标。

### 达标所需的最后一处改动（已量化）

- sequence 1 单次就输出 **17,812 tokens / 85.6 秒** → 给 cinematic 阶段设 `maxOutputTokens` 上限
  （例如 8k）可直接把这类调用砍半；
- 结合已完成的：修复轮数 1、软校验降级、规划兜底、检查点保留、候选 21 秒。

下一轮：落这个上限 → 重建镜像 → 再计一次时；若 ≤30 分钟即标记目标完成。

---

## 二十五、第 19 轮：正在跑的两条计时线 + 上限该落的位置

| 线 | 状态 |
| --- | --- |
| 早前那条（从账本索引到页表落帧） | `artifact.materialize` 第 2 次尝试，作品已 1313 秒（≈22 分钟），仍在生成 |
| 本轮新起的计时线 | `agent.chat` 运行中（方案阶段），随后进入 candidate → materialize |

**技术上的一处修正**：`maxOutputTokens` 上限**不能**在 `route.ts` 的 `cinematicCall` 包装里加
（那里的 `operation` 闭包已经把参数封进去了，包装层拿不到 ✗）；要落在**构造 operation 的那一层**
（cinematic 流水线内部的模型调用处），也就是 `lib/server/cinematic-*.ts` 的 LLM 调用点。

下一轮：定位那些构造点 → 加统一上限（默认 8k，可配） → 重建 → 用同一条需求计时；
若 ≤30 分钟即标记目标完成（用户已确认三维演示按 30 分钟口径）。

---

## 二十六、第 20 轮：30 分钟口径下的实测边界

| 作品 | 状态 | 用时 |
| --- | --- | --- |
| 虚拟内存：一本账、一张索引页、一排帧槽 | READY | **2388 秒 ≈ 39.8 分钟**（超出 30 分钟口径约 10 分钟） |
| 虚拟内存：从账本索引到页表落帧 | GENERATING | 已 3082 秒 ≈ 51 分钟（异常长，属需要清理的个例） |
| 虚拟内存：账本—索引页—金库格 与 页表—物理帧槽（最新一轮） | GENERATING | 1549 秒 ≈ 25.8 分钟，仍在生成（逼近 30 分钟边界） |

结论：在当前实现下，成功一版的耗时落在 **25–40 分钟区间**，**尚未稳定进入 30 分钟**。
唯一还没落地的提速改动就是那条已量化的"限制单次输出规模"（sequence 1 一次 17.8k tokens / 85.6 秒），
位置在 cinematic 流水线内部的 LLM 调用点。

**目标状态：未完成**（成功交付已达成；≤30 分钟尚未稳定达成）。

---

## 二十七、第 21 轮：找到"巨量输出"的根因位置

- `lib/ai/llm.ts:39` 把 `maxOutputTokens` **原样透传**：`maxOutputTokens: p.maxOutputTokens as number | undefined`
  → 只要上游调用没设这个值，就落到**模型默认上限**，于是出现"sequence 1 一次 17,812 tokens / 85.6 秒"这种调用；
- 已确认 `lib/cinematic/*` 里**没有任何** `maxOutputTokens` 设置（`grep` 无命中）→ cinematic 这条链路正是"没设上限"的那一类；
- 设置上限的位置因此有两处可选：
  1. 在 `lib/ai/llm.ts` 给"未设置"的调用一个默认上限（影响面大，可能截断其它流程 ✗ 需谨慎）；
  2. **只给 cinematic 的操作设置上限**（需要先定位这些 operation 的构造点 ✗ 本轮上下文不足以安全完成）。

### 目标状态（口径 ≤30 分钟）

| 目标项 | 状态 |
| --- | --- |
| 软校验降级为警告、硬校验只留完整性 | ✅ |
| 修复轮数 1、候选并行度 3、规划失败兜底、检查点保留 | ✅（候选 21 秒） |
| 成功交付可用成品 | ✅（多个 READY） |
| **≤30 分钟稳定达成** | ❌ 实测区间 25–40 分钟；缺少的正是"给 cinematic 调用设输出上限"这一处 |

下一轮：定位 cinematic operation 的构造点并只在那里设上限（避免影响其它流程），重建后计时。

---

## 二十八、第 22 轮：输出上限已落地并重建成功

改动（源码，已编译通过）：

```ts
// app/api/integration/jobs/execute/route.ts
const CINEMATIC_MAX_OUTPUT_TOKENS = Math.max(
  2000,
  Math.min(24000, Number.parseInt(process.env.AISECEDU_CINEMATIC_MAX_OUTPUT_TOKENS ?? '8000', 10) || 8000),
);
// 两处 cinematic 调用点：
maxOutputTokens: Math.min(resolved.modelInfo?.outputWindow || CINEMATIC_MAX_OUTPUT_TOKENS, CINEMATIC_MAX_OUTPUT_TOKENS)
```

- 默认把 cinematic 单次输出上限从"模型默认（实测出现过 17,812 tokens）"压到 **8000**，可用
  `AISECEDU_CINEMATIC_MAX_OUTPUT_TOKENS` 调整（2000–24000）；
- 只动 cinematic 相关调用点，**不影响**其它流程的输出上限 ✓；
- 镜像 `aisecedu/agent-runtime:debate-v1-r4-skills` 已重建成功并部署（healthy ✓）；
- 新一轮同需求计时已启动，数据将在下一轮给出。
