import {describe, expect, it} from 'vitest';
import {applyProcessDraftRepair, processRevisionHash} from '@/lib/process/revision';

const base = {schemaVersion: 'process-v1', actions: [
  {id: 'load', enabledWhen: true},
  {id: 'step', enabledWhen: false},
]};

describe('process repair ID paths', () => {
  it('accepts an exact, unique action ID without the optional @ prefix', () => {
    const result = applyProcessDraftRepair(base, {
      baseHash: processRevisionHash(base),
      patches: [{op: 'replace', path: '/actions/step/enabledWhen',
        expected: false, value: true}], tests: [],
    });
    expect((result.draft as typeof base).actions[1].enabledWhen).toBe(true);
    expect((result.draft as typeof base).actions[0].enabledWhen).toBe(true);
  });

  it('rejects an unknown action ID and leaves the base untouched', () => {
    expect(() => applyProcessDraftRepair(base, {
      baseHash: processRevisionHash(base),
      patches: [{op: 'replace', path: '/actions/unknown/enabledWhen',
        expected: false, value: true}], tests: [],
    })).toThrow('数组下标无效');
    expect(base.actions[1].enabledWhen).toBe(false);
  });
});
