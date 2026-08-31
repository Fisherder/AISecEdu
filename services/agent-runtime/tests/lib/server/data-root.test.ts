import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAgentRuntimeDataDir } from '@/lib/server/data-root';

describe('resolveAgentRuntimeDataDir', () => {
  it('keeps the historical data directory by default', () => {
    expect(resolveAgentRuntimeDataDir('/workspace/openmaic', undefined)).toBe(
      path.join('/workspace/openmaic', 'data'),
    );
  });

  it('resolves a relative isolated test directory from the process cwd', () => {
    expect(resolveAgentRuntimeDataDir('/workspace/openmaic', '.xuanjia-test-data')).toBe(
      path.join('/workspace/openmaic', '.xuanjia-test-data'),
    );
  });

  it('preserves an explicitly configured absolute directory', () => {
    expect(resolveAgentRuntimeDataDir('/workspace/openmaic', '/tmp/xuanjia-data')).toBe(
      '/tmp/xuanjia-data',
    );
  });
});
