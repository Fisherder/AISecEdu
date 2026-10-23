import { describe, expect, it, vi } from 'vitest';
import { animatedHtmlIssues, animatedPlanInput, generateAnimatedExplainer, wantsSingleAnimatedScene } from '@/lib/server/animated-explainer';
import {directorFixture} from '../../fixtures/cinematic';
import {assemblySceneFixture} from '../../fixtures/cinematic-assembly';

const validHtml = `<!doctype html><html><head><title>动画</title></head><body><svg data-animation-scene></svg>${['play','pause','step','reset'].map(id => `<button id="animation-${id}">${id}</button>`).join('')}<input id="animation-progress" type="range"><script>function frame(){};requestAnimationFrame(frame);</script><p>${'动画教学示例。'.repeat(400)}</p></body></html>`;

describe('animated explainer generation', () => {
  it('keeps all stages and global controls in one continuous scene input', () => {
    const plan={title:'反馈演示',outline:[{title:'正常控制'},{title:'发现偏差'},{title:'独立检测'},{title:'恢复一致'}],experience:{controls:['偏差幅度','独立测量开关']},objectives:['理解证据通道']};
    const input=animatedPlanInput(plan,'一个单页 Three.js 项目');
    expect(input.description).toContain(JSON.stringify(plan));
    expect(input.description).toContain('同一个连续画布');
    expect(input.description).toContain('一个单页 Three.js 项目');
    expect(input.keyPoints).toEqual(plan.objectives);
    expect(wantsSingleAnimatedScene('合并为单页连续动画')).toBe(true);
    expect(wantsSingleAnimatedScene('修改第二页的颜色')).toBe(false);
  });
  it('rejects slide-like pages and invalid animation scripts', () => {
    expect(animatedHtmlIssues('<html><body>只改了标题</body></html>')).toContain('逐帧动画');
    expect(animatedHtmlIssues(validHtml.replace('function frame(){}', 'function frame({'))).toContain('JavaScript 语法错误');
    expect(animatedHtmlIssues(validHtml.replace('</head>', '<script src="https://example.com/x.js"></script></head>'))).toContain('非内置脚本依赖');
    expect(animatedHtmlIssues(validHtml)).toEqual([]);
    expect(animatedHtmlIssues(validHtml.replace('function frame(){}', 'function frame(){ onResize(); }')).join(' ')).toContain('onResize');
    expect(animatedHtmlIssues(validHtml.replace('function frame(){}', 'function frame(){ window.addEventListener("resize", frame); }'))).toEqual([]);
  });
  it('sends the complete previous HTML and refinement instruction to the model', async () => {
    const ai = vi.fn().mockResolvedValueOnce(JSON.stringify(directorFixture)).mockResolvedValueOnce(JSON.stringify(assemblySceneFixture()));
    ai.mockResolvedValue(JSON.stringify({issues:[],patches:[]}));
    const previous = {html:'<html>previous topology</html>', instruction:'将实体改为三维旋转模型'};
    const result = await generateAnimatedExplainer({type:'simulation',title:'可视化',description:'阶段变化'},1,ai,previous);
    expect(ai.mock.calls[0][1]).toContain(previous.html);
    expect(ai.mock.calls[0][1]).toContain(previous.instruction);
    expect(result.content).toMatchObject({renderingMode:'cinematic-v1'});
  });
  it('keeps the old revision when the model cannot deliver a valid animation', async () => {
    const ai = vi.fn().mockResolvedValue('<html>still only a paragraph</html>');
    await expect(generateAnimatedExplainer({type:'simulation',title:'测试'},1,ai)).rejects.toThrow('原作品保持不变');
    // Initial director request plus two bounded contract repairs, never a flat fallback.
    expect(ai).toHaveBeenCalledTimes(3);
    expect(ai.mock.calls[1][1]).toContain('模型未返回完整JSON');
  });
});
