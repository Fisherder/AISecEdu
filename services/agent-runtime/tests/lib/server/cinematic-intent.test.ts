import { describe, it, expect, vi } from 'vitest';
import { resolveVisualGenerationIntent, CINEMATIC_CAPABILITY_BRIEF } from '@/lib/cinematic/capabilities';
import { teacherAgentPlanningSystem, teacherAgentExecutionSystem } from '@/lib/server/teacher-agent';
import { buildDeterministicFallbackForOutline } from '@/lib/server/lesson-generation';
import { interactiveDiagramInput } from '@/lib/server/visual-artifact-input';

describe('ordinary teacher cinematic capability', () => {
  it('advertises the same capabilities before planning and candidate selection', () => {
    expect(teacherAgentPlanningSystem([])).toContain(CINEMATIC_CAPABILITY_BRIEF);
    expect(teacherAgentExecutionSystem([])).toContain(CINEMATIC_CAPABILITY_BRIEF);
  });

  it.each([
    ['让学生围着整套装置看，拆开阀门观察里面，再放大法兰连接', 'cinematic-v1'],
    ['只要二维流程图，不要Three.js和三维场景', 'interactive-2d'],
    ['画一张静态系统关系图', 'interactive-2d'],
  ])('carries original semantic requirements to the model: %s', async (request, mode) => {
    const ai = vi.fn().mockResolvedValue(JSON.stringify({ mode, twoDimensionalFormat: mode === 'interactive-2d' ? 'diagram' : undefined, reason: '根据完整需求选择表达形式', objects: ['实体阀门'], interactions: ['观察结构'], interactionRequirements:[{description:'观察结构',kind:'view'}], visualPriorities: ['清楚的装配关系'] }));
    const result = await resolveVisualGenerationIntent(request, { title: '自然语言需求' }, ai);
    expect(result.mode).toBe(mode);
    expect(ai.mock.calls[0][1]).toContain(request);
    expect(ai.mock.calls[0][0]).toContain('否定范围');
    expect(result.objects).toEqual(['实体阀门']);
  });

  it('does not silently downgrade after an invalid decision', async () => {
    const ai = vi.fn().mockResolvedValue('{"mode":"unknown","reason":"bad"}');
    await expect(resolveVisualGenerationIntent('生成立体装置', {}, ai)).rejects.toThrow('未用普通页面替代');
    expect(ai).toHaveBeenCalledTimes(2);
  });

  it('repairs a malformed decision and preserves its structured requirements', async () => {
    const ai = vi.fn().mockResolvedValueOnce('not JSON').mockResolvedValueOnce(JSON.stringify({mode:'cinematic-v1',reason:'空间装配关系确实重要',objects:['PCB','芯片','内存'],interactions:['结构拆解'],interactionRequirements:[{description:'结构拆解',kind:'structural-change'}]}));
    const result = await resolveVisualGenerationIntent('展示装配', {}, ai);
    expect(result.objects).toHaveLength(3);
    expect(ai.mock.calls[1][1]).toContain('上次输出不符合合同');
  });

  it('refuses a batch fallback that would replace a spatial request with a flat card', () => {
    expect(()=>buildDeterministicFallbackForOutline({id:'space',type:'interactive',title:'空间装配',description:'按部件观察',keyPoints:[],order:0,widgetType:'visualization3d'})).toThrow('未用平面占位内容替代');
  });

  it('requires a one-to-one semantic evidence contract, even if old stored intents omit it', async () => {
    const ai = vi.fn().mockResolvedValue(JSON.stringify({mode:'cinematic-v1',reason:'空间结构的观察',interactions:['拆开阀门']}));
    await expect(resolveVisualGenerationIntent('拆开阀门',{},ai)).rejects.toThrow('尚不能可靠确定');
    expect(ai.mock.calls[1][1]).toContain('Every interactions item');
  });

  it('keeps all steps in one interactive diagram, without inheriting the page count', async () => {
    const request = '只用二维流程图讲解学生选课、学习、练习、提交和反馈，点击步骤查看说明';
    const ai = vi.fn().mockResolvedValue(JSON.stringify({mode:'interactive-2d',twoDimensionalFormat:'diagram',reason:'一个可点击步骤的关系图',objects:['选课','学习','练习','提交','反馈'],interactions:['点击步骤查看说明'],interactionRequirements:[{description:'点击步骤查看说明',kind:'view'}]}));
    const intent = await resolveVisualGenerationIntent(request, {}, ai);
    const input = interactiveDiagramInput(request,{title:'学习流程',sections:[{title:'选课'},{title:'学习'},{title:'反馈'}]},intent);
    expect(input?.type).toBe('diagram');
    expect(input?.keyPoints).toEqual(['选课','学习','练习','提交','反馈','点击步骤查看说明']);
    expect(input?.description).toContain(request);
    expect(input?.description).toContain('同一个图');
    expect(input?.description).toContain('details');
    expect(teacherAgentExecutionSystem([])).toContain('严禁用于simulation、二维交互流程图或三维演示');
    expect(interactiveDiagramInput(request,{}, {...intent,mode:'cinematic-v1'})).toBeNull();
    expect(interactiveDiagramInput(request,{}, {...intent,twoDimensionalFormat:'simulation'})).toBeNull();
  });

  it('requests a specific correction instead of silently routing missing 2D format to a generic simulator', async () => {
    const ai = vi.fn().mockResolvedValue(JSON.stringify({mode:'interactive-2d',reason:'展示清楚的二维流程'}));
    await expect(resolveVisualGenerationIntent('可点击流程图',{},ai)).rejects.toThrow('尚不能可靠确定');
    expect(ai.mock.calls[1][1]).toContain('twoDimensionalFormat');
  });
  it('repairs missing JSON commas without dropping requirement values and records the syntax-only repair', async () => {
    const ai=vi.fn().mockResolvedValue('{"mode":"cinematic-v1" "reason":"观察空间结构","objects":["主板","处理器"],"interactions":[],"interactionRequirements":[]}');
    const intent=await resolveVisualGenerationIntent('观察主板与处理器',{},ai);
    expect(intent.objects).toEqual(['主板','处理器']);
    expect(intent.jsonParsing?.repairs.some(x=>x.operation==='insert-comma')).toBe(true);
    expect(ai).toHaveBeenCalledTimes(1);
  });
  it('never truncates a broken requirement array into a smaller accepted request', async () => {
    const ai=vi.fn().mockResolvedValue('{"mode":"cinematic-v1","reason":"观察空间结构","objects":["主板",{"name":"处理器"');
    await expect(resolveVisualGenerationIntent('主板与处理器两者都必须有',{},ai)).rejects.toThrow('尚不能可靠确定');
    expect(ai).toHaveBeenCalledTimes(2);
  });
});
