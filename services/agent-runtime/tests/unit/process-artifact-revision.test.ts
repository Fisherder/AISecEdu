import { describe, expect, it } from 'vitest';
import { mergeProcessRevisionArtifact } from '@/lib/process/artifact-revision';

const current = {
  id: 'artifact-1',
  type: 'simulation',
  title: '原实验',
  order: 1,
  createdAt: 10,
  outline: {
    id: 'outline-1',
    title: '原实验',
    description: '原说明',
    keyPoints: ['保留控件', '保留状态机'],
    order: 1,
  },
  content: {renderingMode: 'process-v1', processScene: {title: '原实验'}},
};

describe('process revision artifact envelope', () => {
  it('preserves artifact identity and outline metadata for an inner scene edit', () => {
    const generated = {
      id: 'new-artifact',
      title: '原实验',
      outline: {id: 'new-outline', keyPoints: []},
      content: {renderingMode: 'process-v1', processScene: {title: '原实验', stages: [{title: '新阶段'}]}},
    };
    const merged = mergeProcessRevisionArtifact(
      current,
      generated,
      {title: '原实验', summary: '原说明'},
      {title: '原实验', summary: '原说明'},
    );

    expect(merged).toMatchObject({id: 'artifact-1', createdAt: 10, order: 1});
    expect(merged.outline).toEqual(current.outline);
    expect(merged.content).toEqual(generated.content);
  });

  it('updates only changed title and summary fields while retaining outline identity and key points', () => {
    const generated = {content: {renderingMode: 'process-v1'}};
    const merged = mergeProcessRevisionArtifact(
      current,
      generated,
      {title: '原实验', summary: '原说明'},
      {title: '新实验', summary: '新说明'},
    );

    expect(merged.title).toBe('新实验');
    expect(merged.outline).toEqual({...current.outline, title: '新实验', description: '新说明'});
  });
});
