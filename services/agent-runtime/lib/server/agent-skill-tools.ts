import { tool } from 'ai';
import { z } from 'zod';
import { getAgentSkill, readAgentSkillResource } from './agent-skills';
import { journaledToolCall } from '@/lib/ai/model-call-journal';

export function createAgentSkillTools(ownerId?: number, initiallyLoadedNames: string[] = []) {
  const initiallyLoaded = new Set(initiallyLoadedNames);
  const loadedNames: string[] = [...initiallyLoaded];
  const tools = {
    skill: tool({
      description: 'Load the complete instructions for an available skill. Call this before using a skill that is named by the user or relevant to the task and has not already been loaded.',
      inputSchema: z.object({ name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }),
      execute: async ({ name }, { toolCallId }) => journaledToolCall('skill', toolCallId, { name }, async () => {
        const skill = await getAgentSkill(name, ownerId, 'model');
        if (!skill) throw new Error(`skill "${name}" is unknown or unavailable for model invocation`);
        if (!loadedNames.includes(name)) loadedNames.push(name);
        return {
          name: skill.name,
          provider: skill.source === 'account' ? 'account' : 'filesystem',
          resourceBase: skill.resourceBase ? { kind: 'directory', path: skill.resourceBase } : null,
          content: skill.instructions,
        };
      }),
    }),
    skill_resource: tool({
      description: 'Read one reference, script, or asset explicitly named in a loaded skill. Paths are relative to that skill, for example references/workflow.md.',
      inputSchema: z.object({
        name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        path: z.string().min(1).max(240),
      }),
      execute: async ({ name, path }, { toolCallId }) => journaledToolCall(
        'skill_resource', toolCallId, { name, path }, async () => {
        if (!loadedNames.includes(name)) throw new Error(`load skill "${name}" before reading its resources`);
        const content = await readAgentSkillResource(name, path, ownerId, 'model')
          ?? (initiallyLoaded.has(name) ? await readAgentSkillResource(name, path, ownerId, 'user') : null);
        if (content === null) throw new Error(`resource "${path}" is unavailable for skill "${name}"`);
        return { name, path, content };
      }),
    }),
  };
  return { tools, loadedNames };
}
