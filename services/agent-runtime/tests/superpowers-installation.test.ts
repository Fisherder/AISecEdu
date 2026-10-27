import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getBuiltinAgentSkill, listAgentSkills, readAgentSkillResource } from '@/lib/server/agent-skills';

const root = path.resolve(process.cwd(), '../../agent_skills');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'superpowers/installation.json'), 'utf8'));

describe('installed official Superpowers', () => {
  it('discovers all original skills and verifies their pinned sources and license', async () => {
    const catalog = await listAgentSkills();
    expect(manifest.skills).toHaveLength(15);
    for (const entry of manifest.skills) {
      const raw = fs.readFileSync(path.join(root, entry.name, 'SKILL.md'));
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry.sha256);
      expect(catalog.find(skill => skill.name === entry.name)).toBeDefined();
      expect(getBuiltinAgentSkill(entry.name)?.instructions.length).toBeGreaterThan(100);
      expect(fs.readFileSync(path.join(root, entry.name, 'LICENSE.txt'), 'utf8')).toContain('MIT License');
    }
  });
  it('reads official root resources without allowing traversal outside the skill', async () => {
    expect(await readAgentSkillResource('brainstorming', 'visual-companion.md')).toContain('Visual Companion Guide');
    expect(await readAgentSkillResource('brainstorming', '../superpowers/installation.json')).toBeNull();
    expect(await readAgentSkillResource('brainstorming', '/etc/passwd')).toBeNull();
  });
});
