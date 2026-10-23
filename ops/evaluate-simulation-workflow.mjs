import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const runtimeUrl = process.env.SIMULATION_EVALUATION_URL;
const serviceToken = process.env.AISECEDU_SERVICE_SECRET;
const runId = process.env.SIMULATION_EVALUATION_RUN_ID;
const maxAttempts = Math.max(
  1,
  Math.min(4, Number(process.env.SIMULATION_EVALUATION_ATTEMPTS || 1)),
);
const concurrency = Math.max(
  1,
  Math.min(4, Number(process.env.SIMULATION_EVALUATION_CONCURRENCY || 1)),
);
if (!runtimeUrl || !serviceToken || !runId)
  throw Error(
    "Set SIMULATION_EVALUATION_URL, AISECEDU_SERVICE_SECRET and a unique SIMULATION_EVALUATION_RUN_ID for an isolated runtime",
  );
if (!/^[a-z0-9_-]{1,64}$/i.test(runId))
  throw Error("Invalid evaluation run ID");

const scenarios = {
  gold_buffer: {
    mode: "process-v1",
    title: "栈缓冲区逐字节观察",
    prompt:
      "生成非三维精美互动演示：输入或选择ASCII载荷，先装载栈帧，再逐字节执行复制。必须把缓冲区、保存的EBP、返回地址画成连续字节单元，当前写入格脉冲高亮；覆盖返回地址后展示EIP的十六进制值和崩溃状态。学习者能暂停连续写入、单步、撤销、重置，并根据可见内存回答核对题。",
  },
  binary: {
    mode: "process-v1",
    title: "二分查找边界",
    prompt:
      "生成非三维精美互动演示：可输入目标值，先装载有序数组，再逐轮执行二分查找，显示左右边界、中点、当前比较和被排除区间，支持连续执行、暂停、撤销、重置和基于可见结果的核对题。",
  },
  packet: {
    mode: "process-v1",
    title: "数据包封装过程",
    prompt:
      "生成非三维精美互动演示：选择应用数据长度和传输层协议，先构造应用数据，再依次执行传输层、网络层和链路层封装。显示每层头部、总长度、协议字段和连续字节结构，支持单步、撤销、重置和观察核对。",
  },
  access: {
    mode: "process-v1",
    title: "访问控制判定",
    prompt:
      "生成非三维精美互动演示：选择主体角色、资源敏感级别和请求动作，先装载策略，再执行规则匹配和最终授权判定。同步展示命中规则、判定轨迹、允许或拒绝结果和原因，支持撤销、重置和核对题。",
  },
  hash: {
    mode: "process-v1",
    title: "哈希雪崩效应",
    prompt:
      "生成非三维精美互动演示：输入两段仅相差一个字符的短文本，先编码成字节，再分轮执行教学用确定性混合过程。显示输入字节、每轮状态、差异位数量和柱状变化，支持逐步、连续、撤销、重置和观察核对。明确它是教学模型。",
  },
  firewall: {
    mode: "process-v1",
    title: "防火墙规则匹配",
    prompt:
      "生成非三维精美互动演示：设置来源区域、目标端口和连接状态，先装载数据包，再按优先级逐条匹配防火墙规则。显示当前规则、已跳过规则、最终动作和审计轨迹，支持单步、连续、撤销、重置和核对题。",
  },
  incident: {
    mode: "process-v1",
    title: "事件响应处置链",
    prompt:
      "生成非三维精美互动演示：选择告警等级和资产重要性，先确认告警，再依次执行隔离、取证和恢复决策。显示资产状态、证据完整性、处置时间线和剩余风险，支持撤销、重置和基于可见证据的核对。",
  },
  gold_stuxnet: {
    mode: "cinematic-v1",
    title: "离心机级联物理破坏",
    prompt:
      "生成精美可交互三维ICS/SCADA安全教学演示：三台剖面离心机中必须有独立可见转子和偏心示踪带。学习者调节概念转速并开始注入；HMI显示保持正常值，物理转速和独立观测持续变化。临界阶段必须发生真正的级联物理解体：至少4个有体积碎片从隐藏状态显现并沿不同三维轨道飞散，来源机壳或转子同步真实变化，设置专门破坏近景。提供暂停、单步、回拖、旋转缩放、紧急停机和重置。",
  },
  cpu: {
    mode: "cinematic-v1",
    title: "处理器封装",
    prompt:
      "生成精美可交互三维教学演示，观察处理器封装的外观、内部层次及展开复原过程，要求真实模型结构和可见状态变化，支持暂停、单步、回拖、重置、旋转与缩放观察。",
  },
  valve: {
    mode: "cinematic-v1",
    title: "闸阀开闭",
    prompt:
      "生成精美可交互三维动画演示闸阀从关闭到打开的过程，突出阀体、阀芯、阀杆、流道和流向的真实可见变化，支持暂停、单步、回拖、重置、旋转与缩放观察。",
  },
  dna: {
    mode: "cinematic-v1",
    title: "DNA结构",
    prompt:
      "生成精美可交互三维演示，展示DNA双螺旋的两条连续骨架与互补碱基配对，通过局部分离和重新配对解释结构，保持碱基顺序和连接关系，支持暂停、单步、回拖、重置、旋转与缩放观察。",
  },
};

const selection = process.argv[2] || "all";
const selected =
  selection === "all"
    ? Object.keys(scenarios)
    : selection.split(",").filter(Boolean);
if (!selected.length || selected.some((name) => !scenarios[name]))
  throw Error("Unknown scenario selection");
const output = path.resolve(
  process.env.SIMULATION_EVALUATION_OUTPUT || "simulation-workflow-evaluation",
  runId,
);
fs.mkdirSync(output, { recursive: true });

function request(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      runtimeUrl.replace(/\/$/, "") + "/api/integration/jobs/execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "X-AISecEdu-Service-Token": serviceToken,
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          try {
            resolve({ status: response.statusCode, result: JSON.parse(raw) });
          } catch (error) {
            reject(error);
          }
        });
        response.on("error", reject);
      },
    );
    req.setTimeout(1_850_000, () => req.destroy(Error("Evaluation timeout")));
    req.on("error", reject);
    req.end(data);
  });
}

function verify(response, scenario, elapsedMs) {
  const result = response.result;
  const artifact = result?.result?.content?.lesson?.artifacts?.[0];
  const validation = result?.result?.validation;
  const expectedBudget =
    scenario.mode === "cinematic-v1" ? 1_800_000 : 1_200_000;
  const reasons = [];
  if (response.status !== 200 || result?.success !== true)
    reasons.push(`request:${response.status}:${result?.errorCode || "failed"}`);
  if (artifact?.content?.renderingMode !== scenario.mode)
    reasons.push(`mode:${artifact?.content?.renderingMode || "missing"}`);
  if (
    artifact?.content?.generationFallback === true ||
    validation?.fallbackCount !== 0
  )
    reasons.push("fallback");
  if (
    elapsedMs >= expectedBudget ||
    validation?.generationTiming?.elapsedMs >= expectedBudget
  )
    reasons.push("time-budget");
  if (scenario.mode === "process-v1") {
    const processValidation = artifact?.content?.processValidation;
    if (processValidation?.browserValidation !== "PASSED")
      reasons.push("process-browser");
    if (
      processValidation?.qualityProfile?.id !== "openmaic-gold-v1" ||
      processValidation?.qualityProfile?.score < 100
    )
      reasons.push("process-quality");
    if (processValidation?.testCount < 3) reasons.push("process-tests");
  } else {
    const cinematicValidation = artifact?.content?.cinematicValidation;
    if (cinematicValidation?.runtimeRender !== "PASSED")
      reasons.push("cinematic-browser");
    if (cinematicValidation?.status !== "STRUCTURE_VALIDATED")
      reasons.push("cinematic-structure");
  }
  return { passed: reasons.length === 0, reasons, artifact, validation };
}

async function evaluate(name) {
  const scenario = scenarios[name];
  const body = {
    jobId: `job_eval_${runId}_${name}`,
    kind: "artifact.materialize",
    scope: { ownerId: 1 },
    payload: {
      artifactId: `artifact_eval_${runId}_${name}`,
      artifactType: "simulation",
      requestPrompt: scenario.prompt,
      plan: { title: scenario.title },
    },
    modelRoute: {
      route: "standard",
      provider: "deepseek",
      actual_model: "deepseek-v4-flash",
    },
  };
  fs.writeFileSync(
    path.join(output, `${name}-request.json`),
    JSON.stringify(body, null, 2),
  );
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    let response;
    try {
      response = await request(body);
    } catch (error) {
      response = {
        status: 0,
        result: {
          success: false,
          errorCode: "CLIENT_ERROR",
          error: error.message,
        },
      };
    }
    const elapsedMs = Date.now() - started;
    const checked = verify(response, scenario, elapsedMs);
    const record = {
      attempt,
      status: response.status,
      success: response.result?.success === true,
      passed: checked.passed,
      reasons: checked.reasons,
      errorCode: response.result?.errorCode,
      error: response.result?.error,
      elapsedMs,
      mode: checked.artifact?.content?.renderingMode,
      browserValidation:
        checked.artifact?.content?.processValidation?.browserValidation ||
        checked.artifact?.content?.cinematicValidation?.runtimeRender,
      qualityScore:
        checked.artifact?.content?.processValidation?.qualityProfile?.score,
      generationTiming: checked.validation?.generationTiming,
    };
    attempts.push(record);
    fs.writeFileSync(
      path.join(output, `${name}-attempt-${attempt}.json`),
      JSON.stringify({ record, response: response.result }, null, 2),
    );
    console.log(JSON.stringify({ scenario: name, ...record }));
    if (
      checked.passed ||
      ![
        "GENERATION_REPAIR_REQUIRED",
        "GENERATION_TEMPORARILY_UNAVAILABLE",
      ].includes(response.result?.errorCode)
    )
      break;
  }
  const result = {
    scenario: name,
    expectedMode: scenario.mode,
    passed: attempts.some((attempt) => attempt.passed),
    firstAttemptPassed: attempts[0].passed,
    attempts,
  };
  fs.writeFileSync(
    path.join(output, `${name}-result.json`),
    JSON.stringify(result, null, 2),
  );
  return result;
}

async function runPool(names) {
  const results = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, names.length) }, async () => {
      while (cursor < names.length) {
        const name = names[cursor++];
        results.push(await evaluate(name));
      }
    }),
  );
  return names.map((name) =>
    results.find((result) => result.scenario === name),
  );
}

const results = await runPool(selected);
const passed = results.filter((result) => result.passed).length;
const firstAttemptPassed = results.filter(
  (result) => result.firstAttemptPassed,
).length;
const summary = {
  runId,
  generatedAt: new Date().toISOString(),
  scenarios: results.length,
  passed,
  successRate: passed / results.length,
  firstAttemptPassed,
  firstAttemptSuccessRate: firstAttemptPassed / results.length,
  threshold: 0.9,
  thresholdPassed: passed / results.length > 0.9,
  firstAttemptThresholdPassed: firstAttemptPassed / results.length > 0.9,
  maxAttempts,
  results,
};
fs.writeFileSync(
  path.join(output, "summary.json"),
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
if (!summary.thresholdPassed) process.exitCode = 1;
