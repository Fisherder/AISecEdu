import { describe, expect, it } from 'vitest';
import {
  getAgentPlatformSummary,
  SECURITY_AGENT_CATALOG,
  SECURITY_AGENT_WORKFLOWS,
} from '@/lib/security/agent-platform';

describe('security agent platform catalog', () => {
  it('uses unique stable agent ids', () => {
    const ids = SECURITY_AGENT_CATALOG.map((agent) => agent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every workflow reference resolvable', () => {
    const ids = new Set(SECURITY_AGENT_CATALOG.map((agent) => agent.id));
    for (const workflow of SECURITY_AGENT_WORKFLOWS) {
      for (const stage of workflow.stages) {
        expect(stage.agentIds.length).toBeGreaterThan(0);
        for (const id of stage.agentIds) expect(ids.has(id), `${workflow.id}/${stage.id}: ${id}`).toBe(true);
      }
    }
  });

  it('exposes fail-safe platform policy', () => {
    const summary = getAgentPlatformSummary();
    expect(summary.policy.llmMayPublish).toBe(false);
    expect(summary.policy.llmMaySetFinalGrade).toBe(false);
    expect(summary.policy.llmMayAccessInfrastructureCredentials).toBe(false);
    expect(summary.total).toBe(SECURITY_AGENT_CATALOG.length);
  });
});
