import { z } from 'zod';
import { coursewarePageSchema, normalizeCoursewarePageLayout, type CoursewarePage } from './schema';
import { coursewareLanguageUnit } from '@/lib/teaching/learner-language-surfaces';
import { protectedTeachingLiterals } from '@/lib/teaching/learner-language';

export const coursewarePatchSchema = z.object({
  changes: z.array(z.object({
    op: z.enum(['set', 'add', 'remove']),
    path: z.array(z.union([z.string().min(1).max(100), z.number().int().min(0).max(200)])).min(1).max(12),
    value: z.unknown().optional(),
  })).min(1).max(60),
});
const roots = new Set(['title', 'objective', 'composition', 'layout', 'takeaway', 'supporting', 'visual', 'beats', 'check', 'speakerNotes', 'durationSeconds', 'evidence']);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

export function applyCoursewarePagePatch(original: CoursewarePage, patch: z.infer<typeof coursewarePatchSchema>, textOnly = false): CoursewarePage {
  if (JSON.stringify(patch).length > 250000) throw new Error('A targeted correction exceeded the patch size limit');
  const page = structuredClone(original) as unknown as Record<string, any>;
  const proseFields = new Map(coursewareLanguageUnit(original).fields.filter(field => !field.literal).map(field => [field.path, field.text]));
  for (const change of patch.changes) {
    if (textOnly) {
      const before = proseFields.get(change.path.join('.'));
      if (change.op !== 'set' || before === undefined || typeof change.value !== 'string')
        throw Error('纯文字修订只能set现有教学文字字段，不可修改画面、代码、公式、答案键或数据');
      if (JSON.stringify(protectedTeachingLiterals(before)) !== JSON.stringify(protectedTeachingLiterals(change.value)))
        throw Error('纯文字修订不能增删或改变数字、单位、引文代码、公式或链接：' + change.path.join('.'));
    }
    if (!roots.has(String(change.path[0])) || change.path.some(key => forbidden.has(String(key)))) throw new Error('Patch cannot change page identity or prototype properties');
    let parent: any = page;
    for (const key of change.path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new Error('Patch path does not exist: ' + change.path.join('.'));
      parent = parent[key];
    }
    if (!parent || typeof parent !== 'object') throw new Error('Patch parent is not an object');
    const key = change.path.at(-1)!;
    if (Array.isArray(parent) && (typeof key !== 'number' || key > parent.length || (key === parent.length && change.op !== 'add')))
      throw new Error('Array patches need an existing index, or append with add');
    if (change.op === 'remove') {
      if (!Object.hasOwn(parent, key)) throw new Error('Cannot remove a missing field');
      if (Array.isArray(parent)) parent.splice(key as number, 1); else delete parent[key];
    } else {
      if (change.value === undefined) throw new Error('Set/add patches require a JSON value');
      if (Array.isArray(parent) && change.op === 'add') parent.splice(key as number, 0, structuredClone(change.value));
      else parent[key] = structuredClone(change.value);
    }
  }
  return coursewarePageSchema.parse(textOnly ? page : normalizeCoursewarePageLayout(page));
}
