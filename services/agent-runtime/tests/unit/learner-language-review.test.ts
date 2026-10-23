import { describe, expect, it } from 'vitest';
import { assertLearnerTextOnlyRevision, validateLearnerLanguageReview } from '@/lib/teaching/learner-language';

const units = [{id: 'action-copy', fields: [
  {path: 'actions.1.label', text: '复制一个字节'},
  {path: 'actions.1.description', text: '把当前字节写入缓冲区。'},
]}];

function review(field: string, quote = '当前字节') {
  return {version: 'plain-teaching-v1',
    checks: [{unitId: 'action-copy', direct: false, concrete: true,
      termsExplained: true, natural: true, faithful: true}],
    issues: [{unitId: 'action-copy', field, quote,
      problem: '动作没有说明当前字节来自哪里。', correction: '明确指出输入载荷。'}]};
}

describe('learner language review evidence', () => {
  it('resolves a unique field suffix only when the quoted text matches', () => {
    expect(validateLearnerLanguageReview(units, review('description')).issues[0].field)
      .toBe('actions.1.description');
  });

  it('rejects an invented quote even when the field suffix is valid', () => {
    expect(() => validateLearnerLanguageReview(units, review('description', '不存在的原句')))
      .toThrow('文字审校必须引用当前字段中实际存在的原句');
  });

  it('uses quoted evidence over contradictory review scores', () => {
    const unsupported = review('description');
    unsupported.issues = [];
    const clean = validateLearnerLanguageReview(units, unsupported);
    expect(clean.checks[0].direct).toBe(true);
    expect(clean.issues).toEqual([]);

    const grounded = review('description');
    grounded.checks[0].direct = true;
    const accepted = validateLearnerLanguageReview(units, grounded);
    expect(accepted.checks[0].faithful).toBe(false);
    expect(accepted.issues[0].field).toBe('actions.1.description');
  });

  it('lets a process explanation use model-backed numbers while freezing code and structure', () => {
    const before = {id: 'copy', description: '返回地址有 4 个字节，执行 `copy()`。'};
    const after = {id: 'copy', description: '写入索引 20 后，执行 `copy()`。'};
    const fields = [{id: 'copy', fields: [{path: 'description', text: before.description}]}];
    expect(() => assertLearnerTextOnlyRevision(before, after, fields)).toThrow('数字');
    expect(() => assertLearnerTextOnlyRevision(before, after, fields,
      {allowReviewedNumericRephrasing: true})).not.toThrow();
    expect(() => assertLearnerTextOnlyRevision(before,
      {...after, description: '写入索引 20 后，执行 `erase()`。'}, fields,
      {allowReviewedNumericRephrasing: true})).toThrow('代码');
    expect(() => assertLearnerTextOnlyRevision(before,
      {...after, id: 'erase'}, fields, {allowReviewedNumericRephrasing: true})).toThrow('非文字结构');
  });

  it('lets process feedback be rewritten while keeping action behavior fixed', () => {
    const before = {actions: [{id: 'match', enabledWhen: {op: 'eq', args: [1, 1]},
      feedback: {op: 'concat', args: ['主体：', {input: 'role'}]}}]};
    const after = {actions: [{...before.actions[0], feedback: '策略已装载。请执行规则匹配。'}]};
    const fields = [{id: 'match', fields: [
      {path: 'actions.0.feedback.args.0', text: '主体：'},
    ]}];
    expect(() => assertLearnerTextOnlyRevision(before, after, fields)).toThrow('原有结构');
    expect(() => assertLearnerTextOnlyRevision(before, after, fields,
      {allowReviewedFeedbackExpressions: true})).not.toThrow();
    expect(() => assertLearnerTextOnlyRevision(before,
      {actions: [{...after.actions[0], enabledWhen: {op: 'eq', args: [1, 2]}}]},
      fields, {allowReviewedFeedbackExpressions: true})).toThrow('非文字结构');
  });
});
