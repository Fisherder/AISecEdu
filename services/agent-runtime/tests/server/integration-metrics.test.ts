import { beforeEach, describe, expect, test } from 'vitest';
import {
  integrationMetricLines,
  recordIntegrationRequest,
  resetIntegrationMetricsForTests,
} from '@/lib/server/integration-metrics';

describe('Global agent runtime metrics', () => {
  beforeEach(() => resetIntegrationMetricsForTests());

  test('aggregates bounded operation and result labels', () => {
    recordIntegrationRequest('classroom_render', 200, 250);
    recordIntegrationRequest('classroom_render', 500, 750);
    recordIntegrationRequest('bad label/value', 401, -1);
    const text = integrationMetricLines().join('\n');

    expect(text).toContain(
      'aisecedu_agent_runtime_requests_total{operation="classroom_render",result="success"} 1',
    );
    expect(text).toContain(
      'aisecedu_agent_runtime_requests_total{operation="classroom_render",result="server_error"} 1',
    );
    expect(text).toContain('operation="bad_label_value",result="client_error"');
    expect(text).toContain(
      'aisecedu_agent_runtime_request_duration_seconds_sum{operation="classroom_render",result="success"} 0.250000',
    );
  });
});
