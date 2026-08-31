import { describe, it, expect } from 'vitest';
import type { DiagramConfig } from '@/lib/types/widgets';

describe('DiagramConfig diagramType', () => {
  it('accepts the 5 security diagram types', () => {
    const configs: DiagramConfig[] = [
      { type: 'diagram', diagramType: 'attack-tree', description: '', nodes: [], edges: [] },
      { type: 'diagram', diagramType: 'network-topology', description: '', nodes: [], edges: [] },
      { type: 'diagram', diagramType: 'crypto-protocol', description: '', nodes: [], edges: [] },
      { type: 'diagram', diagramType: 'threat-model', description: '', nodes: [], edges: [] },
      { type: 'diagram', diagramType: 'mitre-matrix', description: '', nodes: [], edges: [] },
    ];
    // Type-level guard: if the diagramType union didn't include these, tsc fails.
    expect(configs.every((c) => typeof c.diagramType === 'string')).toBe(true);
  });
});
