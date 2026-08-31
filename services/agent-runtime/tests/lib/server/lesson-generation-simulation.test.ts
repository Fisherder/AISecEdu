import { describe, expect, it, vi } from 'vitest';
import { generateSingleArtifact } from '@/lib/server/lesson-generation';

describe('deterministic simulation materialization', () => {
  it('compiles an already planned SQL simulation without another model call', async () => {
    const aiCall = vi.fn(async () => {
      throw new Error('the compiler must not call the model');
    });
    const artifact = await generateSingleArtifact(
      {
        type: 'simulation',
        title: 'SQL 注入请求与查询对照',
        description:
          '教师要求增加攻击强度滑杆、参数化查询防御开关、请求/查询/日志/结果证据，并支持一键重置。',
        keyPoints: ['固定攻击载荷后比较防护前后', '从日志与响应解释因果关系'],
      },
      1,
      aiCall,
      {
        subjectProfile: true,
        useWorkflow: true,
        deterministicSimulation: true,
      },
    );

    expect(aiCall).not.toHaveBeenCalled();
    expect(artifact?.type).toBe('simulation');
    const content = artifact?.content as unknown as {
      html: string;
      widgetConfig: {
        controls: Array<{ id: string; label: string; type: string }>;
        evidenceChannels: Array<{ id: string }>;
        scenes: Array<{
          id: string;
          choices?: Array<{ goto: string; set?: Record<string, boolean | number> }>;
        }>;
      };
    };
    expect(content.widgetConfig.scenes).toHaveLength(5);
    expect(new Set(content.widgetConfig.scenes.map((scene) => scene.id)).size).toBe(5);
    expect(content.widgetConfig.controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: '攻击强度', type: 'range' }),
        expect.objectContaining({ label: '参数化查询防御', type: 'toggle' }),
      ]),
    );
    expect(content.widgetConfig.evidenceChannels.map((channel) => channel.id)).toEqual([
      'request',
      'query',
      'log',
      'result',
    ]);
    expect(content.widgetConfig.scenes[0]?.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goto: 'protected',
          set: { parameterizedQuery: true },
        }),
      ]),
    );
    for (const marker of [
      'id="reset"',
      'id="controls"',
      'id="evidence"',
      'id="events"',
      'type="range"',
      'type="checkbox"',
      "type:'aisecedu:simulation'",
      'SET_WIDGET_STATE',
    ]) {
      expect(content.html).toContain(marker);
    }
  });

  it('keeps revision instructions and embedded widget JSON out of visible copy', async () => {
    const artifact = await generateSingleArtifact(
      {
        type: 'simulation',
        title: 'SQL 注入攻防对照',
        description:
          '教师修改要求（必须逐项落实）：增加滑杆与防御开关。当前模拟配置：{"scenario":{"title":"内部配置"}}。交付要求：重新生成。',
        keyPoints: ['比较请求、最终 SQL、日志与结果'],
      },
      1,
      vi.fn(async () => {
        throw new Error('the compiler must not call the model');
      }),
      { deterministicSimulation: true },
    );

    const content = artifact?.content as unknown as { html: string };
    expect(content.html).not.toContain('教师修改要求');
    expect(content.html).not.toContain('当前模拟配置');
    expect(content.html).not.toContain('交付要求');
    expect(content.html).toContain('受控 SQL 注入攻防对照');
    expect(artifact?.outline.description).toContain('受控 SQL 注入攻防对照');
  });
});
