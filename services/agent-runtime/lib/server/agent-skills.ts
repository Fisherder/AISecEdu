import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export type AgentSkillSummary = {
  name: string;
  description: string;
  source: string;
};

export type AgentSkill = AgentSkillSummary & {
  instructions: string;
};

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const MAX_SKILLS = 64;
const MAX_SKILL_BYTES = 96_000;
const MAX_REFERENCE_TOTAL_BYTES = 64_000;

function skillRoots(): string[] {
  const configured = String(process.env.AISECEDU_AGENT_SKILLS_DIR || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  const defaults = [
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

function parseSkill(skillPath: string, source: string): AgentSkill | null {
  const raw = fs.readFileSync(skillPath, 'utf8').slice(0, MAX_SKILL_BYTES);
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;
  const metadata = yaml.load(match[1]);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const values = metadata as Record<string, unknown>;
  const name = String(values.name || '').trim();
  const description = String(values.description || '').trim();
  if (!SKILL_NAME.test(name) || !description || description.length > 1_000) return null;
  return {
    name,
    description,
    source,
    instructions: match[2].trim().slice(0, MAX_SKILL_BYTES),
  };
}

export function listAgentSkills(): AgentSkillSummary[] {
  const skills = new Map<string, AgentSkill>();
  for (const root of skillRoots()) {
    const realRoot = fs.realpathSync(root);
    for (const entry of fs.readdirSync(realRoot, { withFileTypes: true }).slice(0, MAX_SKILLS)) {
      if (!entry.isDirectory() || !SKILL_NAME.test(entry.name) || skills.has(entry.name)) continue;
      const directory = path.join(realRoot, entry.name);
      const realDirectory = fs.realpathSync(directory);
      if (realDirectory !== realRoot && !realDirectory.startsWith(`${realRoot}${path.sep}`))
        continue;
      const skillPath = path.join(realDirectory, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const skill = parseSkill(skillPath, path.relative(process.cwd(), realDirectory));
      if (!skill || skill.name !== entry.name) continue;
      skills.set(skill.name, skill);
    }
  }
  return [...skills.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, description, source }) => ({ name, description, source }));
}

function requestedReferenceNames(skillName: string, context: string): string[] {
  if (skillName === 'teaching-slide-deck') {
    return ['production-workflow.md', 'speaker-script.md'];
  }
  if (skillName === 'ctf-flag-challenge') {
    return ['challenge-production-workflow.md', 'category-patterns.md'];
  }
  if (skillName === 'cyber-lab-simulation') {
    return ['simulation-production-workflow.md'];
  }
  if (skillName === 'jupyter-notebook') {
    return [
      'notebook-structure.md',
      'quality-checklist.md',
      'experiment-patterns.md',
      'tutorial-patterns.md',
    ];
  }
  if (skillName === 'playwright') return ['workflows.md', 'cli.md'];
  if (skillName === 'security-threat-model') {
    return ['security-controls-and-assets.md', 'prompt-template.md'];
  }
  if (skillName !== 'security-best-practices') return [];

  const text = context.toLocaleLowerCase();
  const references: string[] = [];
  const add = (condition: boolean, filename: string) => {
    if (condition && !references.includes(filename)) references.push(filename);
  };
  add(/\bflask\b|flask 项目|flask 应用/.test(text), 'python-flask-web-server-security.md');
  add(/\bdjango\b/.test(text), 'python-django-web-server-security.md');
  add(/\bfastapi\b/.test(text), 'python-fastapi-web-server-security.md');
  add(/\bexpress(?:\.js)?\b/.test(text), 'javascript-express-web-server-security.md');
  add(/\bnext(?:\.js|js)?\b/.test(text), 'javascript-typescript-nextjs-web-server-security.md');
  add(/\breact(?:\.js|js)?\b/.test(text), 'javascript-typescript-react-web-frontend-security.md');
  add(/\bvue(?:\.js|js)?\b/.test(text), 'javascript-typescript-vue-web-frontend-security.md');
  add(/\bjquery\b/.test(text), 'javascript-jquery-web-frontend-security.md');
  add(/\b(?:golang|go language|go 后端)\b/.test(text), 'golang-general-backend-security.md');
  add(
    references.length === 0 && /\b(?:javascript|typescript|frontend|前端)\b/.test(text),
    'javascript-general-web-frontend-security.md',
  );
  return references.slice(0, 2);
}

function loadSkillReferences(
  directory: string,
  skillName: string,
  context: string,
  remainingBytes: number,
): { text: string; bytes: number } {
  if (remainingBytes <= 0) return { text: '', bytes: 0 };
  const referenceRoot = path.join(directory, 'references');
  if (!fs.existsSync(referenceRoot)) return { text: '', bytes: 0 };
  const realDirectory = fs.realpathSync(directory);
  const realReferenceRoot = fs.realpathSync(referenceRoot);
  if (!realReferenceRoot.startsWith(`${realDirectory}${path.sep}`)) {
    return { text: '', bytes: 0 };
  }
  const blocks: string[] = [];
  let bytes = 0;
  for (const filename of requestedReferenceNames(skillName, context)) {
    if (!REFERENCE_NAME.test(filename) || bytes >= remainingBytes) continue;
    const candidate = path.join(realReferenceRoot, filename);
    if (!fs.existsSync(candidate)) continue;
    const realCandidate = fs.realpathSync(candidate);
    if (!realCandidate.startsWith(`${realReferenceRoot}${path.sep}`)) continue;
    const allowance = Math.min(remainingBytes - bytes, MAX_SKILL_BYTES);
    const content = fs.readFileSync(realCandidate, 'utf8').slice(0, allowance).trim();
    if (!content) continue;
    const block = `<skill-reference file="references/${filename}">\n${content}\n</skill-reference>`;
    blocks.push(block);
    bytes += Buffer.byteLength(block, 'utf8');
  }
  return { text: blocks.join('\n\n'), bytes };
}

export function loadAgentSkills(names: string[], context = ''): AgentSkill[] {
  const selected = new Set(names.filter((name) => SKILL_NAME.test(name)).slice(0, 6));
  if (!selected.size) return [];
  const loaded: AgentSkill[] = [];
  let referenceBytes = 0;
  for (const summary of listAgentSkills()) {
    if (!selected.has(summary.name)) continue;
    const root = skillRoots().find((candidate) =>
      fs.existsSync(path.join(candidate, summary.name, 'SKILL.md')),
    );
    if (!root) continue;
    const skill = parseSkill(
      path.join(root, summary.name, 'SKILL.md'),
      path.relative(process.cwd(), path.join(root, summary.name)),
    );
    if (skill && skill.name === summary.name) {
      const references = loadSkillReferences(
        path.join(root, summary.name),
        summary.name,
        context,
        MAX_REFERENCE_TOTAL_BYTES - referenceBytes,
      );
      referenceBytes += references.bytes;
      if (references.text) skill.instructions = `${skill.instructions}\n\n${references.text}`;
      loaded.push(skill);
    }
  }
  return loaded;
}
