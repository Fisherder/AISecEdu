import { describe, expect, it, vi } from 'vitest';
import {
  generateDiagramViaWorkflow,
  parseDiagramConfig,
  renderDiagramHtml,
  type DiagramConfig,
} from '@/lib/generation/widget-workflow';
import fixture from '../../fixtures/diagram-workflow.json';
import type { SceneOutline } from '@/lib/types/generation';
import { extractDiagramConfig, renderDiagramHtml as renderClientDiagram, validateDiagramConfig } from '@/lib/widgets/diagram';

const config = () => structuredClone(fixture) as DiagramConfig;
const embedded = (html: string) => JSON.parse(html.match(/<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/)![1]);

describe('offline interactive diagram workflow', () => {
  it('exports the same dependency-free renderer and initially collapses every node', () => {
    expect(renderClientDiagram).toBe(renderDiagramHtml);
    const html = renderClientDiagram(config());
    expect(html).not.toMatch(/<button[^>]*aria-pressed="true"/);
    expect(html).not.toMatch(/<button[^>]*aria-expanded="true"/);
    expect(html).toContain('data-state="collapsed"');
    expect(html).toContain('data-diagram-reset');
    expect(html).toContain("event.key==='Escape'");
    expect(validateDiagramConfig(config())).toEqual(config());
  });

  it('extracts only strict inert diagram JSON from historical widget HTML', () => {
    const html = renderDiagramHtml(config());
    expect(extractDiagramConfig(html)).toEqual(config());
    expect(extractDiagramConfig(html.replace('type="application/json" id="widget-config"', "id='widget-config' type='application/json'"))).toEqual(config());
    expect(extractDiagramConfig(html + '<script type="application/json" id="widget-config">{}</script>')).toBeNull();
    expect(extractDiagramConfig(html.replace('type="application/json"', 'type="text/javascript"'))).toBeNull();
    expect(extractDiagramConfig(html.replace('id="widget-config"', 'id="widget-config" src="https://invalid.example"'))).toBeNull();
    expect(extractDiagramConfig(html.replace('id="widget-config"', 'id="widget-config" id="widget-config"'))).toBeNull();
    expect(extractDiagramConfig('<script id="widget-config" type="application/json">prefix ' + JSON.stringify(config()) + '</script>')).toBeNull();
    expect(extractDiagramConfig('<script id="widget-config" type="application/json">' + JSON.stringify({ ...config(), edges: [{ from: 'choose', to: 'absent' }] }) + '</script>')).toBeNull();
    expect(extractDiagramConfig('<script>globalThis.injected=true</script>')).toBeNull();
    expect(extractDiagramConfig('<!--' + html + '-->')).toBeNull();
  });
  it('keeps one complete model-authored graph and full details without domain substitution', async () => {
    const aiCall = vi.fn(async () => JSON.stringify(config()));
    const outline: SceneOutline = {
      id: 'diagram-control', type: 'interactive', order: 1, title: fixture.title,
      description: '只用二维流程图讲解选课、学习、练习、提交和反馈，点击步骤查看说明。',
      keyPoints: fixture.nodes.map(node => node.label), widgetType: 'diagram',
      widgetOutline: { diagramType: 'flowchart' },
    };
    const output = await generateDiagramViaWorkflow(outline, aiCall, { subjectProfile: false });
    expect(aiCall).toHaveBeenCalledTimes(1);
    expect(output?.widgetType).toBe('diagram');
    expect(embedded(output!.html)).toEqual(fixture);
    expect(embedded(output!.html).nodes[1].details).toBe(fixture.nodes[1].details);
    expect(output!.html).not.toMatch(/SQL|参数化查询|防护开关|new Function|eval\(/);
    expect(output!.html).toContain('data-diagram="v1"');
    expect(output!.html).toContain('data-diagram-details');
    expect(output!.html).toContain('aria-live="polite"');
    expect(output!.html).toContain("event.key==='Home'");
  });

  it('escapes every HTML context and embeds text as inert JSON, not executable source', () => {
    const value = config();
    const hostile = `" autofocus onfocus="globalThis.diagramInjected=1"><script>globalThis.diagramInjected=2</script>&'\u2028\u2029`;
    value.title = hostile;
    value.description = hostile;
    value.nodes[0].id = hostile;
    value.nodes[0].label = hostile;
    value.nodes[0].details = hostile.repeat(20);
    value.nodes[0].kind = 'constructor';
    value.edges[0].from = hostile;
    value.edges[0].label = hostile;
    const html = renderDiagramHtml(value);
    expect(html).not.toContain('<script>globalThis.diagramInjected');
    expect(html).toContain('&quot; autofocus onfocus=&quot;');
    expect(html).toContain('\\u003cscript\\u003e');
    expect(html).toContain('--kind-color:#64748b');
    expect(embedded(html)).toEqual(value);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(script).not.toMatch(/innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|diagramInjected/);
    expect(script).toContain('.textContent=');
  });

  it.each([
    { nodes: [] }, { nodes: [null] }, { nodes: [{ id: 'a', label: {} }] },
    { nodes: [{ id: 'a', label: ' ' }] }, { nodes: [{ id: ' ', label: 'A' }] },
    { nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] },
    { nodes: [{ id: 'a', label: 'A', details: [] }] },
    { edges: [{ from: 'choose', to: 'missing' }] }, { edges: {} }, { edges: [null] },
    { edges: [{ from: 'choose', to: 'learn', label: false }] },
    { title: {} }, { diagramType: [] }, { description: false }, { type: 'code' },
  ])('rejects malformed config or ambiguous/missing references: %j', patch => {
    expect(parseDiagramConfig(JSON.stringify({ ...fixture, ...patch }))).toBeNull();
    expect(() => renderDiagramHtml({ ...fixture, ...patch } as DiagramConfig)).toThrow('Invalid diagram');
  });

  it('accepts fenced JSON, optional details/edges and safe Map-based identifiers', () => {
    const parsed = parseDiagramConfig('```json\n' + JSON.stringify({ nodes: [{ id: '__proto__', label: '单一节点' }] }) + '\n```');
    expect(parsed).toEqual({ type: 'diagram', diagramType: 'flowchart', title: 'Diagram', nodes: [{ id: '__proto__', label: '单一节点' }], edges: [] });
    expect(renderDiagramHtml(parsed!)).toContain('此步骤暂无补充说明。');
    expect(parseDiagramConfig('null')).toBeNull();
    expect(parseDiagramConfig('{}')).toBeNull();
  });

  it('drops unknown executable-looking fields rather than promoting them into behavior', () => {
    const parsed = parseDiagramConfig(JSON.stringify({ ...fixture, script: 'run()', nodes: [{ id: 'choose', label: '选课', onclick: 'run()' }], edges: [] }));
    expect(JSON.stringify(parsed)).not.toContain('run()');
    expect(Object.prototype).not.toHaveProperty('diagramInjected');
  });

  it('supports bounded feedback loops and self-loops without unstable coordinates', () => {
    const value = config(); value.edges.push({ from: 'feedback', to: 'feedback' });
    const html = renderDiagramHtml(value);
    expect(html).toBe(renderDiagramHtml(value));
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('data-orientation="vertical"');
    expect(html).toContain('@media(max-width:640px)');
    for (const [, width, height] of html.matchAll(/viewBox="0 0 (\d+) (\d+)"/g)) {
      expect(Number(width)).toBeLessThan(2500);
      expect(Number(height)).toBeLessThan(2500);
    }
  });
});
