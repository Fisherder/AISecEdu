import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export type AgentSkillSummary = {
  name: string;
  description: string;
  source: string;
  invocation: { modelInvocable: boolean; userInvocable: boolean };
};

export type AgentSkill = AgentSkillSummary & {
  instructions: string;
  resourceBase?: string;
  resourcePaths?: string[];
};

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCOUNT_REFERENCE_PATH = /^references\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const MAX_SKILLS = 64;
const MAX_SKILL_BYTES = 96_000;
const MAX_FRONTMATTER_BYTES = 16_384;
const MAX_REFERENCE_TOTAL_BYTES = 64_000;
const RESOURCE_PATH = /^(?:(?:references|scripts|assets)\/[a-zA-Z0-9][a-zA-Z0-9._/-]*|[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:md|txt|json|py|js|sh))$/;

type BuiltinEntry = { summary: AgentSkillSummary; rootPath: string; skillPath: string };
let lastCompleteBuiltinEntries: BuiltinEntry[] = [];

export class SkillCatalogUnavailableError extends Error {
  constructor() {
    super('Skill catalog is unavailable or incomplete');
    this.name = 'SkillCatalogUnavailableError';
  }
}

function skillRoots(): string[] {
  const configured = String(process.env.AISECEDU_AGENT_SKILLS_DIR || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
    path.resolve(process.cwd(), '.dsh/skills'),
    path.resolve(process.cwd(), '.agents/skills'),
    path.resolve(process.cwd(), '../../.dsh/skills'),
    path.resolve(process.cwd(), '../../.agents/skills'),
    path.resolve(process.cwd(), 'agent-skills'),
    path.resolve(process.cwd(), '../../agent_skills'),
  ];
  return [...new Set([...configured, ...defaults])].filter((root) => {
    try {
      return fs.statSync(root).isDirectory();
    } catch {
      return false;
    }
  });
}

function summaryFromFrontmatter(frontmatter: string, source: string): AgentSkillSummary | null {
  let metadata: unknown;
  try {
    metadata = yaml.load(frontmatter);
  } catch {
    return null;
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const values = metadata as Record<string, unknown>;
  const name = String(values.name || '').trim();
  const description = String(values.description || '').trim();
  if (!SKILL_NAME.test(name) || !description || description.length > 1_000) return null;
  const disabledForModel = values['disable-model-invocation'];
  const enabledForUser = values['user-invocable'];
  if (disabledForModel !== undefined && typeof disabledForModel !== 'boolean') return null;
  if (enabledForUser !== undefined && typeof enabledForUser !== 'boolean') return null;
  return {
    name,
    description,
    source,
    invocation: {
      modelInvocable: disabledForModel !== true,
      userInvocable: enabledForUser !== false,
    },
  };
}

function readSkillFrontmatter(skillPath: string): string | null {
  if (fs.statSync(skillPath).size > MAX_SKILL_BYTES) return null;
  const descriptor = fs.openSync(skillPath, 'r');
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (total < MAX_FRONTMATTER_BYTES) {
      const buffer = Buffer.alloc(Math.min(512, MAX_FRONTMATTER_BYTES - total));
      const length = fs.readSync(descriptor, buffer, 0, buffer.length, total);
      if (!length) break;
      chunks.push(buffer.subarray(0, length));
      total += length;
      const header = Buffer.concat(chunks).toString('utf8');
      const match = header.match(/^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n/);
      if (match) return match[1];
    }
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

function parseSkillSummary(skillPath: string, source: string): AgentSkillSummary | null {
  const frontmatter = readSkillFrontmatter(skillPath);
  return frontmatter === null ? null : summaryFromFrontmatter(frontmatter, source);
}

function parseSkill(skillPath: string, source: string): AgentSkill | null {
  if (fs.statSync(skillPath).size > MAX_SKILL_BYTES) return null;
  const raw = fs.readFileSync(skillPath, 'utf8');
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n([\s\S]*)$/);
  if (!match) return null;
  const summary = summaryFromFrontmatter(match[1], source);
  const instructions = match[2].trim();
  if (!summary || !instructions || Buffer.byteLength(instructions, 'utf8') > MAX_SKILL_BYTES) return null;
  return { ...summary, instructions, resourceBase: path.dirname(skillPath) };
}

type AccountSkillPayload = {
  name?: unknown;
  description?: unknown;
  instructions?: unknown;
  references?: unknown;
  modelInvocable?: unknown;
  userInvocable?: unknown;
};

function accountSkillRoot(): { base: string; secret: string } | null {
  const base = String(process.env.AISECEDU_INTERNAL_URL || '').replace(/\/$/, '');
  const secret = String(process.env.AISECEDU_SERVICE_SECRET || '');
  if (!base || !secret) return null;
  return { base, secret };
}

function accountSummaryFromPayload(value: AccountSkillPayload): AgentSkillSummary | null {
  const name = String(value.name || '').trim();
  const description = String(value.description || '').trim();
  if (!SKILL_NAME.test(name) || !description) return null;
  if (value.modelInvocable !== undefined && typeof value.modelInvocable !== 'boolean') return null;
  if (value.userInvocable !== undefined && typeof value.userInvocable !== 'boolean') return null;
  return {
    name, description, source: 'account',
    invocation: {
      modelInvocable: value.modelInvocable !== false,
      userInvocable: value.userInvocable !== false,
    },
  };
}

function accountSkillFromPayload(value: AccountSkillPayload): AgentSkill | null {
  const summary = accountSummaryFromPayload(value);
  const instructions = String(value.instructions || '').trim();
  if (!summary || !instructions || Buffer.byteLength(instructions, 'utf8') > MAX_SKILL_BYTES) return null;
  let text = instructions;
  const references = Array.isArray(value.references) ? value.references : [];
  const resourcePaths: string[] = [];
  for (const item of references) {
    const entry = item as { path?: unknown };
    const referencePath = String(entry?.path || '').trim();
    if (!ACCOUNT_REFERENCE_PATH.test(referencePath) || resourcePaths.includes(referencePath)) continue;
    resourcePaths.push(referencePath);
  }
  if (resourcePaths.length) {
    text = `${text}\n\nAvailable skill references (read with skill_resource({name,path}) when needed): ${resourcePaths.join(', ')}`;
  }
  return { ...summary, instructions: text, resourcePaths };
}

async function requestAccountSkill(
  ownerId: number | undefined,
  params: Record<string, string>,
  required = false,
): Promise<Record<string, unknown> | null> {
  const target = accountSkillRoot();
  if (!target || !ownerId) {
    if (required) throw new SkillCatalogUnavailableError();
    return null;
  }
  try {
    const query = new URLSearchParams({ ownerId: String(ownerId), ...params });
    const response = await fetch(
      `${target.base}/pwncollege_api/v1/teaching/agent-skills/resolve?${query}`,
      {
        headers: { 'X-AISecEdu-Service-Token': target.secret, Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok) {
      if (required && response.status !== 400 && response.status !== 404)
        throw new SkillCatalogUnavailableError();
      return null;
    }
    const payload = (await response.json()) as { data?: Record<string, unknown> };
    if (payload?.data && typeof payload.data === 'object') return payload.data;
    if (required) throw new SkillCatalogUnavailableError();
    return null;
  } catch {
    if (required) throw new SkillCatalogUnavailableError();
    return null;
  }
}

async function loadAccountSkillCatalog(ownerId?: number): Promise<{ skills: AgentSkillSummary[]; complete: boolean }> {
  if (!ownerId) return { skills: [], complete: true };
  // A scoped run cannot prove there are no owner skills without reaching the
  // account catalog. Missing service configuration is an outage, not an empty
  // catalog that may silently expose a same-named builtin instead.
  if (!accountSkillRoot()) return { skills: [], complete: false };
  const payload = await requestAccountSkill(ownerId, { view: 'catalog' });
  if (!Array.isArray(payload?.skills)) return { skills: [], complete: false };
  const skills = payload.skills
    .map((row) => accountSummaryFromPayload(row as AccountSkillPayload))
    .filter((row): row is AgentSkillSummary => row !== null)
    .slice(0, MAX_SKILLS);
  return { skills, complete: true };
}

async function loadAccountSkill(name: string, ownerId: number | undefined, audience: 'model' | 'user'): Promise<AgentSkill | null> {
  const payload = await requestAccountSkill(ownerId, { view: 'body', name, audience }, true);
  const skill = payload?.skill && typeof payload.skill === 'object'
    ? accountSkillFromPayload(payload.skill as AccountSkillPayload) : null;
  if (!skill || skill.name !== name || !skill.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable'])
    throw new SkillCatalogUnavailableError();
  return skill;
}

function discoverBuiltinSkillEntries(): { entries: BuiltinEntry[]; complete: boolean } {
  const skills = new Map<string, BuiltinEntry>();
  let complete = true;
  for (const root of skillRoots()) {
    try {
      const realRoot = fs.realpathSync(root);
      for (const entry of fs.readdirSync(realRoot, { withFileTypes: true }).slice(0, MAX_SKILLS)) {
        const bundle = entry.isDirectory() && SKILL_NAME.test(entry.name);
        const flat = entry.isFile() && entry.name.endsWith('.md') && SKILL_NAME.test(entry.name.slice(0, -3));
        if (!bundle && !flat) continue;
        const expectedName = bundle ? entry.name : entry.name.slice(0, -3);
        if (skills.has(expectedName)) continue;
        const directory = bundle ? path.join(realRoot, entry.name) : realRoot;
        const realDirectory = fs.realpathSync(directory);
        if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${path.sep}`)) continue;
        const skillPath = path.join(realDirectory, bundle ? 'SKILL.md' : entry.name);
        if (!fs.existsSync(skillPath)) continue;
        const realSkillPath = fs.realpathSync(skillPath);
        if (!realSkillPath.startsWith(`${realRoot}${path.sep}`)) continue;
        const summary = parseSkillSummary(realSkillPath, path.relative(process.cwd(), realDirectory));
        if (!summary || summary.name !== expectedName) continue;
        skills.set(summary.name, { summary, rootPath: realRoot, skillPath: realSkillPath });
      }
    } catch {
      complete = false;
    }
  }
  const entries = [...skills.values()].sort((left, right) => left.summary.name.localeCompare(right.summary.name));
  if (complete) lastCompleteBuiltinEntries = entries;
  return { entries: complete ? entries : lastCompleteBuiltinEntries.length ? lastCompleteBuiltinEntries : entries, complete };
}

export async function listAgentSkills(ownerId?: number): Promise<AgentSkillSummary[]> {
  const snapshot = await agentSkillCatalogSnapshot(ownerId);
  if (!snapshot.complete) throw new SkillCatalogUnavailableError();
  return snapshot.skills;
}

export async function agentSkillCatalogSnapshot(ownerId?: number) {
  const discovered = discoverBuiltinSkillEntries();
  const builtin = discovered.entries.map(({ summary }) => summary);
  const account = await loadAccountSkillCatalog(ownerId);
  const accountNames = new Set(account.skills.map((skill) => skill.name));
  const skills = [
    ...account.skills,
    ...builtin.filter((skill) => !accountNames.has(skill.name)),
  ].sort((left, right) => left.name.localeCompare(right.name));
  return { skills, complete: discovered.complete && account.complete };
}

export function invokedUserSkillNames(prompt: string, catalog: AgentSkillSummary[]): string[] {
  const available = new Set(catalog.filter((skill) => skill.invocation.userInvocable).map((skill) => skill.name));
  const seen = new Set<string>();
  for (const match of prompt.matchAll(/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g)) {
    if (available.has(match[2])) seen.add(match[2]);
  }
  return [...seen];
}

export async function getAgentSkill(
  name: string,
  ownerId?: number,
  audience: 'model' | 'user' = 'model',
): Promise<AgentSkill | null> {
  if (!SKILL_NAME.test(name)) return null;
  const catalog = await loadAccountSkillCatalog(ownerId);
  if (!catalog.complete) throw new SkillCatalogUnavailableError();
  const account = catalog.skills.find((skill) => skill.name === name);
  if (account) {
    if (!account.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']) return null;
    return loadAccountSkill(name, ownerId, audience);
  }
  return getBuiltinAgentSkill(name, audience);
}

export function getBuiltinAgentSkill(name: string, audience: 'model' | 'user' = 'model'): AgentSkill | null {
  if (!SKILL_NAME.test(name)) return null;
  const entry = discoverBuiltinSkillEntries().entries.find((item) => item.summary.name === name);
  if (!entry || !entry.summary.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']) return null;
  try {
    const currentPath = fs.realpathSync(entry.skillPath);
    if (!currentPath.startsWith(`${entry.rootPath}${path.sep}`)) return null;
    const skill = parseSkill(currentPath, entry.summary.source);
    if (!skill || skill.name !== name || !skill.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']) return null;
    return skill;
  } catch {
    return null;
  }
}

export async function readAgentSkillResource(
  name: string,
  resource: string,
  ownerId?: number,
  audience: 'model' | 'user' = 'model',
): Promise<string | null> {
  if (!SKILL_NAME.test(name) || !RESOURCE_PATH.test(resource) || resource.split('/').includes('..')) return null;
  const catalog = await loadAccountSkillCatalog(ownerId);
  if (!catalog.complete) throw new SkillCatalogUnavailableError();
  const account = catalog.skills.find((skill) => skill.name === name);
  if (account) {
    if (!account.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']
      || !ACCOUNT_REFERENCE_PATH.test(resource)) return null;
    const payload = await requestAccountSkill(ownerId, { view: 'resource', name, path: resource, audience }, true);
    const result = payload?.resource && typeof payload.resource === 'object'
      ? payload.resource as { name?: unknown; path?: unknown; content?: unknown }
      : null;
    if (result?.name !== name || result?.path !== resource || typeof result?.content !== 'string'
      || Buffer.byteLength(result.content, 'utf8') > MAX_REFERENCE_TOTAL_BYTES) return null;
    return result.content;
  }
  const entry = discoverBuiltinSkillEntries().entries.find((item) => item.summary.name === name);
  if (!entry || !entry.summary.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']) return null;
  try {
    const realDirectory = fs.realpathSync(path.dirname(entry.skillPath));
    if (realDirectory !== entry.rootPath && !realDirectory.startsWith(`${entry.rootPath}${path.sep}`)) return null;
    const realResource = fs.realpathSync(path.join(realDirectory, resource));
    if (!realResource.startsWith(`${realDirectory}${path.sep}`) || !fs.statSync(realResource).isFile()) return null;
    if (fs.statSync(realResource).size > MAX_SKILL_BYTES) return null;
    return fs.readFileSync(realResource, 'utf8');
  } catch {
    return null;
  }
}

export async function loadAgentSkills(
  names: string[],
  _context = '',
  ownerId?: number,
  audience: 'model' | 'user' = 'model',
): Promise<AgentSkill[]> {
  const selected = new Set(names.filter((name) => SKILL_NAME.test(name)).slice(0, 6));
  if (!selected.size) return [];
  const loaded: AgentSkill[] = [];
  const catalog = await loadAccountSkillCatalog(ownerId);
  if (!catalog.complete) throw new SkillCatalogUnavailableError();
  const accountNames = new Set(catalog.skills.map((skill) => skill.name));
  for (const summary of catalog.skills) {
    if (!selected.has(summary.name) || !summary.invocation[audience === 'model' ? 'modelInvocable' : 'userInvocable']) continue;
    const skill = await loadAccountSkill(summary.name, ownerId, audience);
    if (skill) loaded.push(skill);
  }
  for (const entry of discoverBuiltinSkillEntries().entries) {
    const name = entry.summary.name;
    if (accountNames.has(name) || !selected.has(name)) continue;
    const skill = await getAgentSkill(name, undefined, audience);
    if (skill?.resourceBase) {
      loaded.push(skill);
    }
  }
  return loaded;
}
