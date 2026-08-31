type MetricState = {
  requests: Record<string, number>;
  durationCount: Record<string, number>;
  durationSum: Record<string, number>;
};

const STATE_KEY = '__aiseceduAgentRuntimeMetricState';

function state(): MetricState {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: MetricState };
  if (!root[STATE_KEY]) {
    root[STATE_KEY] = { requests: {}, durationCount: {}, durationSum: {} };
  }
  return root[STATE_KEY];
}

function resultForStatus(status: number): 'success' | 'client_error' | 'server_error' {
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'success';
}

function safeOperation(value: string): string {
  return value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'unknown';
}

export function recordIntegrationRequest(
  operation: string,
  status: number,
  durationMs: number,
): void {
  const operationLabel = safeOperation(operation);
  const result = resultForStatus(status);
  const key = `${operationLabel}|${result}`;
  const metrics = state();
  metrics.requests[key] = (metrics.requests[key] || 0) + 1;
  metrics.durationCount[key] = (metrics.durationCount[key] || 0) + 1;
  metrics.durationSum[key] = (metrics.durationSum[key] || 0) + Math.max(0, durationMs) / 1000;
}

export function integrationMetricLines(): string[] {
  const metrics = state();
  const lines = [
    '# HELP aisecedu_agent_runtime_requests_total Global agent runtime requests by operation and result.',
    '# TYPE aisecedu_agent_runtime_requests_total counter',
  ];
  for (const [key, count] of Object.entries(metrics.requests).sort()) {
    const [operation, result] = key.split('|');
    lines.push(
      `aisecedu_agent_runtime_requests_total{operation="${operation}",result="${result}"} ${count}`,
    );
  }
  lines.push(
    '# HELP aisecedu_agent_runtime_request_duration_seconds Global agent runtime request duration summary.',
    '# TYPE aisecedu_agent_runtime_request_duration_seconds summary',
  );
  for (const [key, count] of Object.entries(metrics.durationCount).sort()) {
    const [operation, result] = key.split('|');
    const labels = `operation="${operation}",result="${result}"`;
    lines.push(`aisecedu_agent_runtime_request_duration_seconds_count{${labels}} ${count}`);
    lines.push(
      `aisecedu_agent_runtime_request_duration_seconds_sum{${labels}} ${(metrics.durationSum[key] || 0).toFixed(6)}`,
    );
  }
  return lines;
}

export function resetIntegrationMetricsForTests(): void {
  const root = globalThis as typeof globalThis & { [STATE_KEY]?: MetricState };
  delete root[STATE_KEY];
}
