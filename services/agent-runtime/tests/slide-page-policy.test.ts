import { describe, expect, it } from 'vitest';
import {
  parseSlideDeckPageRequirement,
  slideDeckPageCountIssue,
  slideDeckPageInstruction,
} from '@/lib/server/slide-page-policy';

describe('slide deck page policy', () => {
  it('defaults to a compact 12-15 page deck with a 14-page preference', () => {
    const requirement = parseSlideDeckPageRequirement('帮我生成一份 SQL 注入防御课件');

    expect(requirement).toEqual({
      min: 12,
      max: 15,
      preferred: 14,
      explicit: false,
      source: 'default',
    });
    expect(slideDeckPageCountIssue(14, requirement)).toBeNull();
    expect(slideDeckPageCountIssue(16, requirement)).toContain('12-15');
  });

  it.each([
    ['生成一份恰好 9 页的课件', 9],
    ['帮我制作十五页课件', 15],
    ['create a 20-slide deck about secure coding', 20],
    ['修改课件并保持总页数为 14 页', 14],
    ['保持总页数恰好为 14 个完整教学页', 14],
  ])('honors an exact page count in %s', (prompt, expected) => {
    const requirement = parseSlideDeckPageRequirement(prompt);

    expect(requirement).toMatchObject({
      min: expected,
      max: expected,
      preferred: expected,
      explicit: true,
      source: 'exact',
    });
    expect(slideDeckPageInstruction(requirement)).toContain(`恰好生成 ${expected} 个`);
  });

  it('honors explicit ranges and approximate counts', () => {
    expect(parseSlideDeckPageRequirement('课件控制在 10–12 页')).toMatchObject({
      min: 10,
      max: 12,
      preferred: 11,
      source: 'range',
    });
    expect(parseSlideDeckPageRequirement('生成 20 页左右的课件')).toMatchObject({
      min: 19,
      max: 21,
      preferred: 20,
      source: 'approximate',
    });
  });

  it('does not mistake a referenced source page for the requested deck length', () => {
    expect(parseSlideDeckPageRequirement('根据材料第 2 页的内容生成一份防御课件')).toMatchObject({
      min: 12,
      max: 15,
      source: 'default',
    });
  });

  it('does not mistake an added page or retained duration for a total-page constraint', () => {
    expect(
      parseSlideDeckPageRequirement(
        '把刚才生成的课件修改为增加一页参数化查询前后对比，并保持20分钟',
      ),
    ).toMatchObject({ explicit: false, source: 'default' });
  });

  it('uses the final explicit rule when a rewritten prompt contains an obsolete default', () => {
    const requirement = parseSlideDeckPageRequirement(
      '默认生成 18–24 页。\n最终页数要求：必须恰好生成 8 个完整教学页面。',
    );

    expect(requirement).toMatchObject({ min: 8, max: 8, preferred: 8, source: 'exact' });
  });

  it('keeps the generated default instruction distinguishable from a teacher range', () => {
    const requirement = parseSlideDeckPageRequirement(
      '教师未指定页数；默认生成 12–15 个完整教学页面，优先 14 页。',
    );

    expect(requirement).toMatchObject({
      min: 12,
      max: 15,
      preferred: 14,
      explicit: false,
      source: 'default',
    });
  });
});
