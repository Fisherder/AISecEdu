import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export interface PythonCodeTestCase {
  input: string;
  expected: string;
  description?: string;
}

export interface PythonCodeRunRequest {
  language: 'python';
  code: string;
  testCases: PythonCodeTestCase[];
}

export interface PythonCodeTestResult {
  index: number;
  description?: string;
  passed: boolean;
  actual: string;
  expected: string;
  error?: string;
}

export interface PythonCodeRunResult {
  status: 'passed' | 'failed' | 'error';
  passed: boolean;
  tests: PythonCodeTestResult[];
  stdout: string;
  error?: string;
  durationMs: number;
  runtime: 'python-container';
}

export type CodeRunnerErrorCode =
  | 'INVALID_REQUEST'
  | 'RUNNER_DISABLED'
  | 'RUNNER_BUSY'
  | 'RUNNER_UNAVAILABLE'
  | 'RUNNER_TIMEOUT'
  | 'OUTPUT_LIMIT';

export class CodeRunnerError extends Error {
  constructor(
    readonly code: CodeRunnerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CodeRunnerError';
  }
}

export const CODE_RUNNER_LIMITS = {
  maxCodeBytes: 50_000,
  maxTestCases: 12,
  maxTestInputBytes: 1_000,
  maxExpectedBytes: 2_000,
  maxDescriptionBytes: 300,
  maxOutputBytes: 96 * 1024,
} as const;

interface ContainerOptions {
  dockerBin?: string;
  image?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

interface RunnerGlobals {
  active: number;
}

const globalRunner = globalThis as typeof globalThis & {
  __aiseceduAgentCodeRunner?: RunnerGlobals;
};
const runnerGlobals = (globalRunner.__aiseceduAgentCodeRunner ??= { active: 0 });

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function validatePythonCodeRunRequest(value: unknown): PythonCodeRunRequest {
  if (!value || typeof value !== 'object') {
    throw new CodeRunnerError('INVALID_REQUEST', '请求内容必须是对象。');
  }
  const candidate = value as Record<string, unknown>;
  if (String(candidate.language ?? '').toLowerCase() !== 'python') {
    throw new CodeRunnerError('INVALID_REQUEST', '容器运行器目前仅支持 Python。');
  }
  if (typeof candidate.code !== 'string' || candidate.code.trim().length === 0) {
    throw new CodeRunnerError('INVALID_REQUEST', 'Python 代码不能为空。');
  }
  if (byteLength(candidate.code) > CODE_RUNNER_LIMITS.maxCodeBytes) {
    throw new CodeRunnerError(
      'INVALID_REQUEST',
      `Python 代码不能超过 ${CODE_RUNNER_LIMITS.maxCodeBytes} 字节。`,
    );
  }
  if (!Array.isArray(candidate.testCases) || candidate.testCases.length === 0) {
    throw new CodeRunnerError('INVALID_REQUEST', '至少需要一个可执行测试用例。');
  }
  if (candidate.testCases.length > CODE_RUNNER_LIMITS.maxTestCases) {
    throw new CodeRunnerError(
      'INVALID_REQUEST',
      `测试用例不能超过 ${CODE_RUNNER_LIMITS.maxTestCases} 个。`,
    );
  }

  const testCases = candidate.testCases.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new CodeRunnerError('INVALID_REQUEST', `测试用例 ${index + 1} 格式不正确。`);
    }
    const test = raw as Record<string, unknown>;
    if (typeof test.input !== 'string' || test.input.trim().length === 0) {
      throw new CodeRunnerError(
        'INVALID_REQUEST',
        `测试用例 ${index + 1} 必须提供 Python 调用表达式。`,
      );
    }
    if (typeof test.expected !== 'string') {
      throw new CodeRunnerError('INVALID_REQUEST', `测试用例 ${index + 1} 缺少期望值。`);
    }
    const description = typeof test.description === 'string' ? test.description : undefined;
    if (byteLength(test.input) > CODE_RUNNER_LIMITS.maxTestInputBytes) {
      throw new CodeRunnerError('INVALID_REQUEST', `测试用例 ${index + 1} 的调用表达式过长。`);
    }
    if (byteLength(test.expected) > CODE_RUNNER_LIMITS.maxExpectedBytes) {
      throw new CodeRunnerError('INVALID_REQUEST', `测试用例 ${index + 1} 的期望值过长。`);
    }
    if (description && byteLength(description) > CODE_RUNNER_LIMITS.maxDescriptionBytes) {
      throw new CodeRunnerError('INVALID_REQUEST', `测试用例 ${index + 1} 的说明过长。`);
    }
    return {
      input: test.input.trim(),
      expected: test.expected,
      ...(description ? { description } : {}),
    };
  });

  return { language: 'python', code: candidate.code, testCases };
}

/**
 * Build the trusted harness sent to Python on stdin. Student text is encoded as
 * base64 JSON, so it cannot escape into the harness source before `exec` runs it
 * inside the already isolated container.
 */
export function buildPythonHarness(request: PythonCodeRunRequest): string {
  const encoded = Buffer.from(JSON.stringify(request), 'utf8').toString('base64');
  return `import ast
import base64
import contextlib
import io
import json
import time
import traceback

_payload = json.loads(base64.b64decode(${JSON.stringify(encoded)}).decode("utf-8"))
_code = _payload["code"]
_cases = _payload["testCases"]
_namespace = {"__name__": "__main__"}
_captured = io.StringIO()
_started = time.monotonic()

def _short(value, limit=2000):
    text = str(value)
    return text if len(text) <= limit else text[:limit] + "…"

def _actual_text(value):
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return repr(value)
    return str(value)

def _matches(value, expected):
    expected_text = expected.strip()
    candidates = {str(value).strip(), repr(value).strip()}
    if isinstance(value, bytes):
        try:
            candidates.add(value.decode("utf-8").strip())
        except UnicodeDecodeError:
            pass
    if isinstance(value, bool):
        candidates.add(str(value).lower())
    if expected_text in candidates:
        return True
    try:
        return value == ast.literal_eval(expected_text)
    except Exception:
        return False

try:
    with contextlib.redirect_stdout(_captured), contextlib.redirect_stderr(_captured):
        exec(compile(_code, "student_submission.py", "exec"), _namespace, _namespace)
except BaseException as exc:
    _result = {
        "status": "error",
        "passed": False,
        "tests": [],
        "stdout": _short(_captured.getvalue(), 12000),
        "error": _short("".join(traceback.format_exception_only(type(exc), exc)).strip()),
    }
else:
    _tests = []
    for _index, _case in enumerate(_cases, start=1):
        _expression = _case["input"]
        try:
            with contextlib.redirect_stdout(_captured), contextlib.redirect_stderr(_captured):
                _value = eval(compile(_expression, "test_case.py", "eval"), _namespace, _namespace)
            _passed = _matches(_value, _case["expected"])
            _tests.append({
                "index": _index,
                "description": _case.get("description"),
                "passed": _passed,
                "actual": _short(_actual_text(_value)),
                "expected": _short(_case["expected"]),
            })
        except BaseException as exc:
            _tests.append({
                "index": _index,
                "description": _case.get("description"),
                "passed": False,
                "actual": "",
                "expected": _short(_case["expected"]),
                "error": _short("".join(traceback.format_exception_only(type(exc), exc)).strip()),
            })
    _all_passed = bool(_tests) and all(item["passed"] for item in _tests)
    _result = {
        "status": "passed" if _all_passed else "failed",
        "passed": _all_passed,
        "tests": _tests,
        "stdout": _short(_captured.getvalue(), 12000),
    }

_result["durationMs"] = round((time.monotonic() - _started) * 1000)
_encoded_result = base64.b64encode(json.dumps(_result, ensure_ascii=False).encode("utf-8")).decode("ascii")
print("__AISECEDU_AGENT_CODE_RESULT__" + _encoded_result)
`;
}

export function buildDockerArgs(containerName: string, image: string): string[] {
  return [
    'run',
    '--rm',
    '--interactive',
    '--name',
    containerName,
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '65534:65534',
    '--workdir',
    '/tmp',
    '--pids-limit',
    '64',
    '--memory',
    '256m',
    '--memory-swap',
    '256m',
    '--cpus',
    '0.5',
    '--ulimit',
    'nofile=64:64',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=32m',
    '--entrypoint',
    '/usr/bin/python3',
    image,
    '-I',
    '-B',
    '-',
  ];
}

function removeContainer(dockerBin: string, containerName: string): Promise<void> {
  return new Promise((resolve) => {
    execFile(dockerBin, ['rm', '-f', containerName], { timeout: 3_000 }, () => resolve());
  });
}

function parseContainerResult(stdout: string, durationMs: number): PythonCodeRunResult {
  const marker = '__AISECEDU_AGENT_CODE_RESULT__';
  const markerIndex = stdout.lastIndexOf(marker);
  if (markerIndex < 0) {
    throw new CodeRunnerError('RUNNER_UNAVAILABLE', 'Python 容器没有返回有效的测试结果。');
  }
  const encoded = stdout
    .slice(markerIndex + marker.length)
    .split(/\r?\n/, 1)[0]
    ?.trim();
  if (!encoded) {
    throw new CodeRunnerError('RUNNER_UNAVAILABLE', 'Python 容器返回了空的测试结果。');
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Omit<
      PythonCodeRunResult,
      'runtime' | 'durationMs'
    > & { durationMs?: number };
    return {
      ...parsed,
      durationMs: Math.max(parsed.durationMs ?? 0, durationMs),
      runtime: 'python-container',
    };
  } catch {
    throw new CodeRunnerError('RUNNER_UNAVAILABLE', '无法解析 Python 容器的测试结果。');
  }
}

async function executeContainer(
  request: PythonCodeRunRequest,
  options: ContainerOptions,
): Promise<PythonCodeRunResult> {
  const dockerBin =
    options.dockerBin ||
    process.env.GLOBAL_AGENT_CODE_RUNNER_DOCKER_BIN ||
    process.env.OPENMAIC_DOCKER_BIN ||
    '/usr/bin/docker';
  const image =
    options.image ||
    process.env.GLOBAL_AGENT_CODE_RUNNER_IMAGE ||
    process.env.OPENMAIC_CODE_RUNNER_IMAGE ||
    'aisecedu/code-runner:python-3.11';
  const timeoutMs = Math.min(
    Math.max(
      options.timeoutMs ??
        (Number(
          process.env.GLOBAL_AGENT_CODE_RUNNER_TIMEOUT_MS ||
            process.env.OPENMAIC_CODE_RUNNER_TIMEOUT_MS,
        ) || 12_000),
      500,
    ),
    30_000,
  );
  const maxOutputBytes = options.maxOutputBytes ?? CODE_RUNNER_LIMITS.maxOutputBytes;
  const containerName = `aisecedu-agent-code-${randomUUID().replaceAll('-', '')}`;
  const harness = buildPythonHarness(request);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, buildDockerArgs(containerName, image), {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputLimited = false;

    const stop = async () => {
      child.kill('SIGKILL');
      await removeContainer(dockerBin, containerName);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void stop();
    }, timeoutMs);

    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        outputLimited = true;
        void stop();
        return;
      }
      target.push(chunk);
    };

    child.stdout.on('data', (chunk: Buffer) => collect(stdoutChunks, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(stderrChunks, chunk));
    child.once('error', async (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await removeContainer(dockerBin, containerName);
      reject(
        new CodeRunnerError('RUNNER_UNAVAILABLE', `无法启动 Python 隔离容器：${error.message}`),
      );
    });
    child.once('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut || outputLimited) await removeContainer(dockerBin, containerName);
      if (timedOut) {
        reject(new CodeRunnerError('RUNNER_TIMEOUT', `代码运行超过 ${timeoutMs}ms，已终止。`));
        return;
      }
      if (outputLimited) {
        reject(new CodeRunnerError('OUTPUT_LIMIT', '代码输出过多，容器已终止。'));
        return;
      }
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      if (code !== 0) {
        reject(
          new CodeRunnerError(
            'RUNNER_UNAVAILABLE',
            stderr
              ? `Python 容器执行失败：${stderr.slice(0, 1200)}`
              : `Python 容器异常退出（代码 ${code ?? 'unknown'}）。`,
          ),
        );
        return;
      }
      try {
        resolve(parseContainerResult(stdout, Date.now() - startedAt));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.on('error', () => {
      // A timed-out or early-exited container may close stdin first; close/exit
      // handling above owns the user-facing result.
    });
    child.stdin.end(harness, 'utf8');
  });
}

export async function runPythonInContainer(
  input: unknown,
  options: ContainerOptions = {},
): Promise<PythonCodeRunResult> {
  if (
    (process.env.GLOBAL_AGENT_CODE_RUNNER_ENABLED ||
      process.env.OPENMAIC_CODE_RUNNER_ENABLED) === 'false'
  ) {
    throw new CodeRunnerError('RUNNER_DISABLED', 'Python 代码容器已被管理员禁用。');
  }
  const request = validatePythonCodeRunRequest(input);
  const maxConcurrency = Math.min(
    Math.max(
      Number(
        process.env.GLOBAL_AGENT_CODE_RUNNER_MAX_CONCURRENCY ||
          process.env.OPENMAIC_CODE_RUNNER_MAX_CONCURRENCY,
      ) || 2,
      1,
    ),
    8,
  );
  if (runnerGlobals.active >= maxConcurrency) {
    throw new CodeRunnerError('RUNNER_BUSY', '代码运行容器正忙，请稍后重试。');
  }
  runnerGlobals.active += 1;
  try {
    return await executeContainer(request, options);
  } finally {
    runnerGlobals.active -= 1;
  }
}
