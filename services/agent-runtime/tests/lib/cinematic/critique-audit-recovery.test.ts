import { describe, expect, it, vi } from 'vitest';
import { adjudicateCinematicCritique } from '../../../lib/cinematic/critique';

describe('cinematic critique audit', () => {
  it('keeps every real claim when the model appends an extra numbered verdict', async () => {
    const aiCall = vi.fn(async () => JSON.stringify({assessments: [
      {index: 0, blocking: false, evidence: '真实浏览器画面已显示这一处结构。'},
      {index: 1, blocking: true, evidence: '真实画面中第二处结构仍被机壳遮住。'},
      {index: 2, blocking: false, evidence: '这一行不对应任何原始审查主张。'},
    ]}));
    const result = await adjudicateCinematicCritique({
      issues: ['第一处结构', '第二处结构'], evidence: {},
    }, aiCall);
    expect(result.assessments.map(item => item.index)).toEqual([0, 1]);
    expect(result.issues).toEqual(['第二处结构']);
    expect(aiCall).toHaveBeenCalledTimes(1);
  });

  it('treats duplicate verdicts conservatively', async () => {
    const aiCall = vi.fn(async () => JSON.stringify({assessments: [
      {index: 0, blocking: false, evidence: '首个判断认为画面证据足够清楚。'},
      {index: 0, blocking: true, evidence: '复核判断指出关键部件仍被遮住。'},
    ]}));
    const result = await adjudicateCinematicCritique({issues: ['关键部件'], evidence: {}}, aiCall);
    expect(result.issues).toEqual(['关键部件']);
  });

  it('splits a repeatedly incomplete batch and still obtains a verdict for every claim', async () => {
    const issues = ['第一个结构', '第二个结构', '第三个结构', '第四个结构'];
    const aiCall = vi.fn(async (_system: string, raw: string) => {
      const batch = JSON.parse(raw).issues as string[];
      const answered = batch.length === 4 ? batch.slice(0, 3) : batch;
      return JSON.stringify({assessments: answered.map((issue, index) => ({index,
        blocking: issue === '第四个结构', evidence: `${issue}的三维轨道与教师要求逐项对照后得到真实判断。`}))});
    });
    const result = await adjudicateCinematicCritique({issues, evidence: {scene: 'sampled'}}, aiCall);
    expect(result.assessments.map(row => row.issue)).toEqual(issues);
    expect(result.issues).toEqual(['第四个结构']);
    expect(aiCall).toHaveBeenCalledTimes(5);
  });
});
