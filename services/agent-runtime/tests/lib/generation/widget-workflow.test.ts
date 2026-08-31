import { describe, it, expect } from 'vitest';
import {
  generateDiagramViaWorkflow,
  generateCodeViaWorkflow,
  generateProceduralSkillViaWorkflow,
  generateSimulationViaWorkflow,
  generateGameViaWorkflow,
  generateViz3DViaWorkflow,
  renderDiagramHtml,
  renderGameHtml,
  renderScenarioHtml,
  renderCodeHtml,
  upgradeLegacyCodeWidgetHtml,
} from '@/lib/generation/widget-workflow';
import type { SceneOutline } from '@/lib/types/generation';
import type { AICallFn } from '@/lib/generation/pipeline-types';

const baseOutline = (over: Partial<SceneOutline>): SceneOutline => ({
  id: 's',
  type: 'interactive',
  title: 'T',
  description: 'd',
  keyPoints: ['a'],
  order: 1,
  widgetType: 'diagram',
  ...over,
});

/** Build a mock aiCall that returns a canned config string for a given payload. */
const mockAi =
  (config: object): AICallFn =>
  async () =>
    JSON.stringify(config);

describe('widget workflow (mocked LLM)', () => {
  it('diagram: renders SVG with nodes/edges + widget-config', async () => {
    const r = await generateDiagramViaWorkflow(
      baseOutline({ widgetType: 'diagram', widgetOutline: { diagramType: 'attack-tree' } }),
      mockAi({
        type: 'diagram',
        diagramType: 'attack-tree',
        title: 'AT',
        nodes: [
          { id: 'n1', label: 'Goal', kind: 'goal' },
          { id: 'n2', label: 'Step' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      }),
    );
    expect(r?.widgetType).toBe('diagram');
    expect(r?.html).toContain('<svg');
    expect(r?.html).toContain('id="widget-config"');
    expect(r?.html).toContain('Goal');
  });

  it('code: renders editor + testCases + solution', async () => {
    const r = await generateCodeViaWorkflow(
      baseOutline({ widgetType: 'code', widgetOutline: { language: 'javascript' } }),
      mockAi({
        type: 'code',
        language: 'javascript',
        description: 'd',
        starterCode: 'function f(x){',
        testCases: [{ input: '1', expected: '2', description: 't' }],
        hints: ['h'],
        solution: 'function f(x){return x+1}',
      }),
    );
    expect(r?.widgetType).toBe('code');
    expect(r?.html).toContain('<textarea');
    expect(r?.html).toContain('function f(x){return x+1}');
    expect(r?.html).toContain('id="widget-config"');
  });

  it('python code: submits real callable tests to the isolated container runner', async () => {
    const r = await generateCodeViaWorkflow(
      baseOutline({ widgetType: 'code', widgetOutline: { language: 'python' } }),
      mockAi({
        type: 'code',
        language: 'python',
        description: 'RSA OAEP',
        starterCode: 'def rsa_sign_verify():\n    pass',
        testCases: [{ input: 'rsa_sign_verify()', expected: 'True', description: 'PSS' }],
        hints: ['使用 PSS'],
        solution: 'def rsa_sign_verify():\n    return True',
      }),
    );
    expect(r?.html).toContain('运行检查（Python 隔离容器）');
    expect(r?.html).toContain('/api/code/run');
    expect(r?.html).toContain('__openmaicCodeRunner');
    expect(r?.html).not.toContain('自动运行仅支持 JavaScript');
  });

  it('upgrades stored legacy Python widgets from their embedded config', () => {
    const config = {
      type: 'code' as const,
      language: 'python',
      description: 'legacy',
      starterCode: 'def f():\n    pass',
      testCases: [{ input: 'f()', expected: 'True' }],
      hints: [],
      solution: 'def f():\n    return True',
    };
    const legacy = `<html><body><button>运行检查（JS）</button><script>out.textContent = '自动运行仅支持 JavaScript';</script><script type="application/json" id="widget-config">${JSON.stringify(config)}</script></body></html>`;
    const upgraded = upgradeLegacyCodeWidgetHtml(legacy);
    expect(upgraded).not.toBe(legacy);
    expect(upgraded).toContain('name="openmaic-code-runner" content="container-v1"');
    expect(upgraded).toContain('运行检查（Python 隔离容器）');
    expect(upgradeLegacyCodeWidgetHtml(upgraded)).toBe(upgraded);
    expect(upgraded).toBe(renderCodeHtml(config));
  });

  it('procedural-skill: renders steps', async () => {
    const r = await generateProceduralSkillViaWorkflow(
      baseOutline({ widgetType: 'procedural-skill', widgetOutline: { task: 'Pentest' } }),
      mockAi({
        type: 'procedural-skill',
        task: 'Pentest',
        steps: [
          { title: 'Recon', description: 'scan', tools: ['nmap'], successCriteria: ['done'] },
        ],
        tools: ['nmap'],
      }),
    );
    expect(r?.widgetType).toBe('procedural-skill');
    expect(r?.html).toContain('Recon');
    expect(r?.html).toContain('nmap');
  });

  it('simulation: renders interactive scenario with scenes', async () => {
    const r = await generateSimulationViaWorkflow(
      baseOutline({ widgetType: 'simulation', widgetOutline: { concept: 'BB84' } }),
      mockAi({
        type: 'simulation-scenario',
        title: 'BB84',
        startScene: 's1',
        scenes: [
          {
            id: 's1',
            title: '制备光子',
            stateLabel: '等待发送',
            narrative: 'Alice 随机比特与基',
            expectedObservation: '不同基会产生不同测量结果',
            facilitatorCue: '先预测窃听者介入后的误码率。',
            visual: { kind: 'cells', rows: [{ label: 'bit', cells: ['0', '1'] }] },
          },
        ],
        debrief: '用误码率证据解释是否存在窃听者。',
      }),
    );
    expect(r?.widgetType).toBe('simulation');
    expect(r?.html).toContain('scene-title');
    expect(r?.html).toContain('制备光子');
    expect(r?.html).toContain('运行记录');
    expect(r?.html).toContain('重新开始');
    expect(r?.html).toContain('expectedObservation');
    expect(r?.html).toContain("type:'aisecedu:simulation'");
  });

  it('game: renders interactive quiz with questions', async () => {
    const r = await generateGameViaWorkflow(
      baseOutline({ widgetType: 'game', widgetOutline: { gameType: 'quiz' } }),
      mockAi({
        type: 'game',
        gameType: 'quiz',
        title: 'Q',
        questions: [
          {
            question: 'q1',
            options: ['a', 'b', 'c', 'd'],
            correctIndex: 1,
            explanation: 'because',
          },
        ],
      }),
    );
    expect(r?.widgetType).toBe('game');
    expect(r?.html).toContain('q1');
    expect(r?.html).toContain('cfg.questions');
    expect(r?.html).toContain('id="widget-config"');
  });

  it('visualization3d: renders object cards', async () => {
    const r = await generateViz3DViaWorkflow(
      baseOutline({
        widgetType: 'visualization3d',
        widgetOutline: { visualizationType: 'molecular' },
      }),
      mockAi({
        type: 'visualization3d',
        visualizationType: 'molecular',
        title: 'V',
        objects: [{ name: 'Core', kind: 'core', color: '#3b82f6', description: 'center' }],
      }),
    );
    expect(r?.widgetType).toBe('visualization3d');
    expect(r?.html).toContain('Core');
  });

  it('renderers are pure: same config → same output', () => {
    const cfg = {
      type: 'diagram' as const,
      diagramType: 'flowchart',
      title: 'X',
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
    };
    expect(renderDiagramHtml(cfg)).toBe(renderDiagramHtml(cfg));
  });

  it('game renderer produces a self-contained HTML doc', () => {
    const html = renderGameHtml({
      type: 'game',
      gameType: 'quiz',
      title: 'T',
      questions: [{ question: 'q', options: ['1', '2', '3', '4'], correctIndex: 0 }],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.includes('</html>')).toBe(true);
  });

  it('scenario renderer embeds scene data for the player', () => {
    const html = renderScenarioHtml({
      type: 'simulation-scenario',
      title: 'T',
      startScene: 's1',
      controls: [
        {
          id: 'payloadSize',
          label: '载荷长度',
          type: 'range',
          min: 1,
          max: 8,
          step: 1,
          default: 3,
        },
        {
          id: 'guardEnabled',
          label: '启用保护',
          type: 'toggle',
          default: false,
          onLabel: '已启用',
          offLabel: '未启用',
        },
      ],
      evidenceChannels: [
        { id: 'request', label: '请求' },
        { id: 'log', label: '日志' },
        { id: 'result', label: '结果' },
      ],
      scenes: [
        {
          id: 's1',
          title: 'Step1',
          stateLabel: '观察中',
          narrative: 'n',
          expectedObservation: 'metric changes',
          facilitatorCue: 'predict first',
          evidence: {
            request: 'payload={{payloadSize}}',
            log: 'guard={{guardEnabled}}',
            result: 'metric changes',
          },
          choices: [
            {
              label: '启用保护并继续',
              goto: 's1',
              effect: '切换保护状态',
              set: { guardEnabled: true },
            },
          ],
          visual: { kind: 'metric', value: '42' },
        },
      ],
      comparisonSummary: '比较保护开关启用前后的证据差异',
      debrief: 'compare the evidence',
    });
    expect(html).toContain('Step1');
    expect(html).toContain('42');
    expect(html).toContain('aria-label="模拟演示运行记录"');
    expect(html).toContain('compare the evidence');
    expect(html).toContain("event.data.type==='RESET_WIDGET'");
    expect(html).toContain('id="controls"');
    expect(html).toContain('id="evidence"');
    expect(html).toContain('type="range"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('payload={{payloadSize}}');
    expect(html).toContain("notify('control'");
    expect(html).toContain('controls=Object.create(null)');
    expect(html).toContain('applyControlSet(setValues)');
    expect(html).toContain('"set":{"guardEnabled":true}');
  });

  it('simulation: repairs duplicate scene ids and broken branches without failing the job', async () => {
    const duplicate = await generateSimulationViaWorkflow(
      baseOutline({ widgetType: 'simulation' }),
      mockAi({
        type: 'simulation-scenario',
        title: 'broken',
        startScene: 's1',
        scenes: [
          { id: 's1', title: 'A', narrative: 'a' },
          { id: 's1', title: 'B', narrative: 'b' },
        ],
      }),
    );
    const missingTarget = await generateSimulationViaWorkflow(
      baseOutline({ widgetType: 'simulation' }),
      mockAi({
        type: 'simulation-scenario',
        title: 'broken',
        startScene: 's1',
        scenes: [
          {
            id: 's1',
            title: 'A',
            narrative: 'a',
            choices: [{ label: 'go', goto: 'missing' }],
          },
        ],
      }),
    );
    expect(duplicate?.widgetType).toBe('simulation');
    expect(missingTarget?.widgetType).toBe('simulation');
    const duplicateConfig = duplicate?.widgetConfig as { scenes?: Array<{ id?: string }> };
    expect(new Set(duplicateConfig.scenes?.map((scene) => scene.id)).size).toBe(2);
    const missingTargetConfig = missingTarget?.widgetConfig as {
      scenes?: Array<{ choices?: Array<{ goto?: string }> }>;
    };
    expect(missingTargetConfig.scenes?.[0]?.choices).toEqual([]);
  });

  it('simulation: uses a complete deterministic scenario when model JSON is unusable', async () => {
    let attempts = 0;
    const bad: AICallFn = async () => {
      attempts += 1;
      return 'not json at all';
    };
    const r = await generateSimulationViaWorkflow(
      baseOutline({
        title: 'SQL 注入攻防对照',
        widgetType: 'simulation',
        widgetOutline: { concept: '参数化查询' },
      }),
      bad,
    );
    const config = r?.widgetConfig as {
      controls?: unknown[];
      evidenceChannels?: unknown[];
      scenes?: Array<{ choices?: unknown[] }>;
    };
    expect(r?.widgetType).toBe('simulation');
    expect(config.controls).toHaveLength(2);
    expect(config.evidenceChannels).toHaveLength(4);
    expect(config.scenes).toHaveLength(5);
    expect(config.scenes?.[0]?.choices).toHaveLength(2);
    expect(attempts).toBe(2);
    expect(r?.html).toContain('参数化查询');
    expect(r?.html).toContain('攻击强度');
    expect(r?.html).toContain('参数化查询防御');
    expect(r?.html).toContain('重新开始');
  });

  it('parse failures return null (graceful)', async () => {
    const bad: AICallFn = async () => 'not json at all';
    const r = await generateGameViaWorkflow(
      baseOutline({ widgetType: 'game', widgetOutline: { gameType: 'quiz' } }),
      bad,
    );
    expect(r).toBeNull();
  });
});
