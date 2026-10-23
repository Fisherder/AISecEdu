import { z } from 'zod';
import { debateV2SpecSchema, type DebateV2Spec } from './schema';

export const debatePatchSchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  operations: z.array(z.object({
    op: z.enum(['set', 'insert', 'remove', 'reorder']), path: z.string().min(2).max(400),
    value: z.unknown().optional(), index: z.number().int().nonnegative().optional(),
    ids: z.array(z.string()).max(100).optional(),
  }).strict()).min(1).max(100),
}).strict();
export type DebatePatch = z.infer<typeof debatePatchSchema>;
export type DebateRevisionEntry = {instruction: string; summary: string; appliedAt: string;
  changes: Array<{path: string; before?: unknown; after?: unknown}>};
const roots = new Set(['title', 'motion', 'scenario', 'studentRole', 'positions', 'objectives',
  'format', 'rules', 'roles', 'rounds', 'evidence', 'rubric', 'reflectionPrompts']);
const forbidden = new Set(['__proto__', 'prototype', 'constructor', 'schema']);

function segments(path: string) {
  if (!path.startsWith('/') || /~(?:[^01]|$)/.test(path)) throw Error('修改路径无效');
  const parts = path.slice(1).split('/').map(value => value.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (!roots.has(parts[0]) || parts.some(part => !part || forbidden.has(part))) throw Error('修改路径不在辩论内容范围内');
  return parts;
}

function keyAt(node: unknown, part: string): string | number {
  if (!node || typeof node !== 'object') throw Error('修改路径的父对象不存在');
  if (!Array.isArray(node)) {
    if (!Object.hasOwn(node, part)) throw Error('修改字段不存在：' + part);
    return part;
  }
  const index = part.startsWith('@') ? node.findIndex(item => item?.id === part.slice(1))
    : /^\d+$/.test(part) ? Number(part) : -1;
  if (index < 0 || index >= node.length) throw Error('指定的条目不存在：' + part);
  return index;
}

function locate(root: unknown, path: string) {
  const parts = segments(path);
  let parent = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) parent = parent[keyAt(parent, part)] as Record<string, unknown>;
  const key = keyAt(parent, parts.at(-1)!);
  return {parent, key, value: parent[key]};
}

function chineseIndex(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (digits[tens] || 1) * 10 + (digits[ones] || 0);
  }
  return digits[value] || 0;
}

function scopedPrefix(spec: DebateV2Spec, instruction: string) {
  if (!/(只|仅|其他.{0,12}(不动|不变|保持))/u.test(instruction)) return null;
  const match = instruction.match(/(?:只|仅)(?:修改|改动|改|调整|把|对)?\s*第([一二三四五六七八九十\d]+)(?:轮|环节|阶段)/u);
  if (match) {
    const round = spec.rounds[chineseIndex(match[1]) - 1];
    if (!round) throw Error('要求修改的环节不存在');
    const tail = instruction.slice((match.index || 0) + match[0].length);
    const field = /^(?:的)?(?:任务|任务描述)(?:[:：，,]|改成|改为|$)/u.test(tail) ? '/task' : '';
    return '/rounds/@' + round.id + field;
  }
  if (/学生(?:的)?身份|学生角色/u.test(instruction)) return '/studentRole';
  return null;
}

export function applyDebatePatch(original: DebateV2Spec, patch: DebatePatch, instruction = '') {
  const spec = structuredClone(original);
  const changes: DebateRevisionEntry['changes'] = [];
  const only = scopedPrefix(original, instruction);
  for (const operation of patch.operations) {
    const parts = segments(operation.path);
    const canonical = parts.map((part, index) => index === 1 && ['roles', 'rounds', 'evidence', 'rubric'].includes(parts[0]) && /^\d+$/.test(part)
      ? '@' + (spec[parts[0] as 'rounds'] as {id: string}[])[Number(part)]?.id : part);
    const canonicalPath = '/' + canonical.join('/');
    if (only && canonicalPath !== only && !canonicalPath.startsWith(only + '/'))
      continue;
    const {parent, key, value} = locate(spec, operation.path);
    const before = structuredClone(value);
    if (operation.op === 'set') {
      if (operation.value === undefined) throw Error('set 操作缺少 value');
      parent[key] = structuredClone(operation.value);
    } else if (operation.op === 'remove') {
      if (!Array.isArray(parent)) throw Error('只能删除数组条目，不能删除必需字段');
      parent.splice(Number(key), 1);
    } else if (operation.op === 'insert') {
      if (!Array.isArray(value) || operation.value === undefined) throw Error('insert 需要数组路径及完整条目');
      const index = operation.index ?? value.length;
      if (index > value.length) throw Error('插入位置超过现有条目数');
      value.splice(index, 0, structuredClone(operation.value));
    } else {
      if (!Array.isArray(value) || !operation.ids || operation.ids.length !== value.length ||
          new Set(operation.ids).size !== value.length || value.some(item => !operation.ids!.includes(item?.id)))
        throw Error('重排必须列出全部现有 ID，各一次');
      parent[key] = operation.ids.map(id => value.find(item => item.id === id));
    }
    const after = operation.op === 'remove' ? undefined : structuredClone(parent[key]);
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({path: canonicalPath, before, after});
  }
  if (!changes.length) throw Error(only ? '本次只允许修改 ' + only + '，当前补丁未在该范围产生变化' : '这次修改没有产生任何内容变化');
  return {spec: debateV2SpecSchema.parse(spec), changes,
    changedFields: [...new Set(changes.map(change => segments(change.path)[0]))],
    changedPaths: changes.map(change => change.path), summary: patch.summary};
}
