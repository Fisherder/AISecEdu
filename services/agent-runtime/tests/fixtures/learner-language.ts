import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { LearnerTextUnit, LearnerLanguageReview } from '@/lib/teaching/learner-language';

export function passingLanguageReview(units: LearnerTextUnit[]): LearnerLanguageReview {
  return { version: 'plain-teaching-v1', checks: units.map(unit => ({
    unitId: unit.id, direct: true, concrete: true, termsExplained: true, natural: true, faithful: true,
  })), issues: [] };
}

export function withPassingLanguageReview(aiCall: AICallFn): AICallFn {
  return async (system, user) => {
    const raw = await aiCall(system, user);
    const context = JSON.parse(user.split('\n上一稿：')[0]);
    if (!context.learnerTextUnits) return raw;
    const result = JSON.parse(raw);
    if (!Object.hasOwn(result, 'languageReview')) result.languageReview = passingLanguageReview(context.learnerTextUnits);
    return JSON.stringify(result);
  };
}
