// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { extractCinematicScene } from '@/lib/cinematic/schema';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import { sceneFixture } from '../../fixtures/cinematic';

const scene = () => ({
  ...sceneFixture(),
  chapters: Array.from({ length: 10 }, (_, index) => ({
    at: index * 6,
    title: `${index + 1} 保存局部信息阶段 · 局部信息标记落入该帧分区`,
    caption: `阶段 ${index + 1} 的完整说明`,
    focus: [],
  })),
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('long cinematic chapter navigation', () => {
  it('bounds every title inside a non-shrinking, horizontally scrollable button', () => {
    const html = compileCinematicScene(scene());
    document.head.innerHTML = html.match(/<style>[\s\S]*?<\/style>/)![0];
    const rules = [...document.styleSheets[0].cssRules] as CSSStyleRule[];
    const row = rules.find((rule) => rule.selectorText === '.cinema-chapters')!.style;
    const button = rules.find((rule) => rule.selectorText === '.cinema-chapters button')!.style;
    expect(row.getPropertyValue('overflow-x')).toBe('auto');
    expect(button.getPropertyValue('flex')).toBe('0 0 auto');
    expect(html).toContain('width:clamp(160px,22vw,240px)');
    expect(button.getPropertyValue('min-width')).toBe('160px');
    expect(button.getPropertyValue('overflow')).toBe('hidden');
    expect(button.getPropertyValue('text-overflow')).toBe('ellipsis');
    expect(html).toContain('button.title=chapter.title');
    expect(html).toContain('document.createTextNode(chapter.title)');
  });

  it('refreshes the old overflowing player while preserving all ten saved chapters', () => {
    const saved = scene();
    const original = compileCinematicScene(saved);
    const legacy = original.replace(
      'flex:0 0 auto;width:clamp(160px,22vw,240px);min-width:160px;overflow:hidden;text-overflow:ellipsis;',
      'flex:1;min-width:95px;',
    );
    const output = patchHtmlForIframe(legacy);
    expect(output).toContain('flex:0 0 auto;width:clamp(160px,22vw,240px)');
    expect(extractCinematicScene(output)).toEqual(extractCinematicScene(original));
    expect(extractCinematicScene(output)!.chapters).toHaveLength(10);
    expect(patchHtmlForIframe(output)).toBe(output);
  });

  it.each([
    { left: 720, right: 900, expected: 712 },
    { left: 20, right: 200, expected: 308 },
    { left: 200, right: 380, expected: 400 },
  ])(
    'keeps an active chapter visible without scrolling its outer page: $left',
    ({ left, right, expected }) => {
      const data = scene();
      document.body.innerHTML = compileCinematicScene(data);
      const ids = [
        'chapters',
        'chapter-title',
        'chapter-caption',
        'chapter-number',
        'chapter-question',
        'animation-progress',
        'time-label',
        'animation-play',
        'animation-pause',
      ];
      const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)!]));
      const row = elements.chapters;
      data.chapters.forEach(() => row.append(document.createElement('button')));
      row.scrollLeft = 400;
      row.getBoundingClientRect = () => ({ left: 100, right: 600 }) as DOMRect;
      row.children[8].getBoundingClientRect = () => ({ left, right }) as DOMRect;
      const source = readFileSync('lib/cinematic/player.js', 'utf8');
      const body = source.match(/  function selectChapter\(\)\{([\s\S]*?)\n  \}/)![1];
      const state = { time: 48, playing: false, chapter: -1 };
      const root = document.getElementById('cinema')!;
      const select = new Function('sceneData', 'state', 'elements', 'root', body);
      select(data, state, elements, root);
      expect(state.chapter).toBe(8);
      expect(elements['chapter-title'].textContent).toBe(data.chapters[8].title);
      expect(row.children[8].getAttribute('aria-current')).toBe('step');
      expect(row.children[7].getAttribute('aria-current')).toBe('false');
      expect(row.scrollLeft).toBe(expected);
      row.scrollLeft = 300;
      select(data, state, elements, root);
      expect(row.scrollLeft).toBe(300);
      expect(document.documentElement.scrollTop).toBe(0);
    },
  );
});
