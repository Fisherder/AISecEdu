import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAgentSkill,
  invokedUserSkillNames,
  listAgentSkills,
  loadAgentSkills,
  readAgentSkillResource,
} from '@/lib/server/agent-skills';
import { createAgentSkillTools } from '@/lib/server/agent-skill-tools';

const previousRoot = process.env.AISECEDU_AGENT_SKILLS_DIR;
const previousInternalUrl = process.env.AISECEDU_INTERNAL_URL;
const previousServiceSecret = process.env.AISECEDU_SERVICE_SECRET;
let root = '';

function writeSkill(name: string, modelInvocable = true, userInvocable = true) {
  const directory = path.join(root, name);
  fs.mkdirSync(path.join(directory, 'references'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    'description: A temporary skill for runtime verification.',
    `disable-model-invocation: ${!modelInvocable}`,
    `user-invocable: ${userInvocable}`,
    '---',
    '# Current instructions',
    'Read references/workflow.md before responding.',
  ].join('\n'));
  fs.writeFileSync(path.join(directory, 'references/workflow.md'), 'Verified reference content');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aisecedu-skill-test-'));
  process.env.AISECEDU_AGENT_SKILLS_DIR = root;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousRoot === undefined) delete process.env.AISECEDU_AGENT_SKILLS_DIR;
  else process.env.AISECEDU_AGENT_SKILLS_DIR = previousRoot;
  if (previousInternalUrl === undefined) delete process.env.AISECEDU_INTERNAL_URL;
  else process.env.AISECEDU_INTERNAL_URL = previousInternalUrl;
  if (previousServiceSecret === undefined) delete process.env.AISECEDU_SERVICE_SECRET;
  else process.env.AISECEDU_SERVICE_SECRET = previousServiceSecret;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('agent skill registry', () => {
  it('discovers additions and rereads changed instructions without restarting', async () => {
    writeSkill('runtime-verification');
    expect((await listAgentSkills()).some((skill) => skill.name === 'runtime-verification')).toBe(true);
    expect((await getAgentSkill('runtime-verification'))?.instructions).toContain('# Current instructions');
    fs.appendFileSync(path.join(root, 'runtime-verification/SKILL.md'), '\nUpdated after discovery');
    expect((await getAgentSkill('runtime-verification'))?.instructions).toContain('Updated after discovery');
  });

  it('separates user and model invocation and checks policy again at load time', async () => {
    writeSkill('user-only-verification', false);
    const catalog = await listAgentSkills();
    const summary = catalog.find((skill) => skill.name === 'user-only-verification');
    expect(summary?.invocation).toEqual({ modelInvocable: false, userInvocable: true });
    expect(invokedUserSkillNames('Please /user-only-verification help me', catalog)).toEqual(['user-only-verification']);
    expect(await getAgentSkill('user-only-verification', undefined, 'model')).toBeNull();
    expect((await getAgentSkill('user-only-verification', undefined, 'user'))?.instructions).toContain('# Current instructions');
    writeSkill('user-only-verification', true);
    expect(await getAgentSkill('user-only-verification', undefined, 'model')).not.toBeNull();
  });

  it('loads a skill through the model tool and bounds resource reads', async () => {
    writeSkill('tool-verification');
    const outside = path.join(os.tmpdir(), `skill-outside-${process.pid}.md`);
    fs.writeFileSync(outside, 'not part of the skill');
    try {
      fs.symlinkSync(outside, path.join(root, 'tool-verification/references/outside.md'));
      const runtime = createAgentSkillTools();
      const loaded = await runtime.tools.skill.execute!({ name: 'tool-verification' }, {
        toolCallId: 'test-skill-call',
        messages: [],
        abortSignal: new AbortController().signal,
      });
      expect(loaded).toMatchObject({ content: expect.stringContaining('# Current instructions') });
      expect(runtime.loadedNames).toContain('tool-verification');
      expect(await readAgentSkillResource('tool-verification', 'references/workflow.md')).toBe('Verified reference content');
      expect(await readAgentSkillResource('tool-verification', 'references/../SKILL.md')).toBeNull();
      expect(await readAgentSkillResource('tool-verification', 'references/outside.md')).toBeNull();
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  it('allows a model-only skill to read its reference after loading', async () => {
    writeSkill('model-only-verification', true, false);
    const runtime = createAgentSkillTools();
    const callOptions = {
      toolCallId: 'test-model-only-skill',
      messages: [],
      abortSignal: new AbortController().signal,
    };
    await runtime.tools.skill.execute!({ name: 'model-only-verification' }, callOptions);
    const resource = await runtime.tools.skill_resource.execute!(
      { name: 'model-only-verification', path: 'references/workflow.md' },
      callOptions,
    );
    expect(resource).toMatchObject({ content: 'Verified reference content' });
  });

  it('allows an explicitly selected user-only skill to read its own reference', async () => {
    writeSkill('user-only-resource', false);
    const runtime = createAgentSkillTools(undefined, ['user-only-resource']);
    const resource = await runtime.tools.skill_resource.execute!(
      { name: 'user-only-resource', path: 'references/workflow.md' },
      { toolCallId: 'test-user-only-resource', messages: [], abortSignal: new AbortController().signal },
    );
    expect(resource).toMatchObject({ content: 'Verified reference content' });
  });

  it('uses an owner-scoped account skill ahead of a same-named builtin', async () => {
    writeSkill('account-verification');
    process.env.AISECEDU_INTERNAL_URL = 'http://internal.invalid';
    process.env.AISECEDU_SERVICE_SECRET = 'test-only-secret';
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ data: url.includes('view=body')
        ? { skill: { name: 'account-verification', description: 'Account-owned instructions.', instructions: 'Account owner instructions.' } }
        : { skills: [{ name: 'account-verification', description: 'Account-owned instructions.' }] } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const entries = (await listAgentSkills(123)).filter((skill) => skill.name === 'account-verification');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.source).toBe('account');
    expect((await getAgentSkill('account-verification', 123))?.instructions).toBe('Account owner instructions.');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://internal.invalid/pwncollege_api/v1/teaching/agent-skills/resolve?ownerId=123&view=catalog',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-AISecEdu-Service-Token': 'test-only-secret' }) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://internal.invalid/pwncollege_api/v1/teaching/agent-skills/resolve?ownerId=123&view=body&name=account-verification&audience=model',
      expect.anything(),
    );
  });

  it('honors independent invocation policies for account skills', async () => {
    process.env.AISECEDU_INTERNAL_URL = 'http://internal.invalid';
    process.env.AISECEDU_SERVICE_SECRET = 'test-only-secret';
    const fetchMock = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      const name = query.get('name');
      const data = query.get('view') === 'catalog'
        ? { skills: [
          { name: 'account-user-only', description: 'User invocation only.', modelInvocable: false, userInvocable: true },
          { name: 'account-model-only', description: 'Model invocation only.', modelInvocable: true, userInvocable: false },
          { name: 'account-invalid-policy', description: 'Invalid policy.', modelInvocable: 'false' },
        ] }
        : query.get('view') === 'body'
          ? { skill: { name, description: 'Selected skill.', instructions: name === 'account-user-only' ? 'Follow the user.' : 'Follow the model.',
            modelInvocable: name !== 'account-user-only', userInvocable: name === 'account-user-only',
            references: name === 'account-user-only' ? [{ path: 'references/workflow.md', bytes: 34 }] : [] } }
          : { resource: { name, path: query.get('path'), content: 'Private account reference content.' } };
      return { ok: true, json: async () => ({ data }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await listAgentSkills(123);
    expect(catalog.find((skill) => skill.name === 'account-user-only')?.invocation)
      .toEqual({ modelInvocable: false, userInvocable: true });
    expect(catalog.some((skill) => skill.name === 'account-invalid-policy')).toBe(false);
    expect(invokedUserSkillNames('/account-user-only /account-model-only', catalog))
      .toEqual(['account-user-only']);
    expect(await getAgentSkill('account-user-only', 123, 'model')).toBeNull();
    const userSkill = await getAgentSkill('account-user-only', 123, 'user');
    expect(userSkill?.instructions).toContain('references/workflow.md');
    expect(userSkill?.instructions).not.toContain('Private account reference content.');
    expect(await readAgentSkillResource('account-user-only', 'references/workflow.md', 123, 'model')).toBeNull();
    expect(await readAgentSkillResource('account-user-only', 'references/workflow.md', 123, 'user'))
      .toBe('Private account reference content.');
    const runtime = createAgentSkillTools(123, ['account-user-only']);
    const resource = await runtime.tools.skill_resource.execute!(
      { name: 'account-user-only', path: 'references/workflow.md' },
      { toolCallId: 'test-account-reference', messages: [], abortSignal: new AbortController().signal },
    );
    expect(resource).toMatchObject({ content: 'Private account reference content.' });
    expect((await getAgentSkill('account-model-only', 123, 'model'))?.instructions).toBe('Follow the model.');
    expect(await getAgentSkill('account-model-only', 123, 'user')).toBeNull();
    const requests = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams);
    expect(requests.filter((query) => query.get('view') === 'body').map((query) => query.get('name')))
      .toEqual(['account-user-only', 'account-model-only']);
    expect(requests.filter((query) => query.get('view') === 'resource').map((query) => query.get('path')))
      .toEqual(['references/workflow.md', 'references/workflow.md']);
  });

  it('loads only selected account instructions and reads one reference on demand', async () => {
    process.env.AISECEDU_INTERNAL_URL = 'http://internal.invalid';
    process.env.AISECEDU_SERVICE_SECRET = 'test-only-secret';
    const fetchMock = vi.fn(async (url: string) => {
      const query = new URL(url).searchParams;
      const data = query.get('view') === 'catalog'
        ? { skills: [
          { name: 'selected-workflow', description: 'Selected.' },
          { name: 'unselected-workflow', description: 'Unselected.' },
        ] }
        : query.get('view') === 'body'
          ? { skill: { name: 'selected-workflow', description: 'Selected.', instructions: 'SELECTED_INSTRUCTIONS',
            references: [{ path: 'references/first.md', bytes: 13 }, { path: 'references/second.md', bytes: 14 }] } }
          : { resource: { name: 'selected-workflow', path: 'references/first.md', content: 'FIRST_CONTENT' } };
      return { ok: true, json: async () => ({ data }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const catalog = await listAgentSkills(123);
    expect(catalog.filter((skill) => skill.source === 'account').map((skill) => skill.name))
      .toEqual(['selected-workflow', 'unselected-workflow']);
    expect(fetchMock.mock.calls.every(([url]) => new URL(url).searchParams.get('view') === 'catalog')).toBe(true);
    const loaded = await loadAgentSkills(['selected-workflow'], '', 123);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].instructions).toContain('references/second.md');
    expect(await readAgentSkillResource('selected-workflow', 'references/first.md', 123)).toBe('FIRST_CONTENT');
    const requests = fetchMock.mock.calls.map(([url]) => new URL(url).searchParams);
    expect(requests.filter((query) => query.get('view') === 'body').map((query) => query.get('name')))
      .toEqual(['selected-workflow']);
    expect(requests.filter((query) => query.get('view') === 'resource').map((query) => query.get('path')))
      .toEqual(['references/first.md']);
  });
});
