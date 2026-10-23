// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CinematicPreview, isCinematicContent } from '@/components/cinematic-preview';
import { IntegratedLessonPreview } from '@/components/integrated-lesson-preview';
import { ArtifactPreview } from '@/components/teacher/artifact-workbench';
import type { LessonArtifact } from '@/lib/types/lesson';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { sceneFixture } from '../fixtures/cinematic';

const sceneHtml = compileCinematicScene(sceneFixture());

function artifact(id: string, content: unknown): LessonArtifact {
  return {
    id,
    order: 1,
    title: id,
    type: 'simulation',
    outline: { id, type: 'interactive', title: id, description: '', keyPoints: [], order: 1 },
    content,
    createdAt: 1,
  } as LessonArtifact;
}

describe('cinematic preview UI', () => {
  let container: HTMLDivElement;
  let root: Root;
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.history.replaceState(null, '', '/');
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  async function mount(html = sceneHtml) {
    await act(async () =>
      root.render(createElement(CinematicPreview, { title: '细胞结构', html })),
    );
  }

  async function clickImmersive() {
    const button = container.querySelector<HTMLButtonElement>('[aria-controls]')!;
    await act(async () => button.click());
  }

  async function message(source: MessageEventSource | null, data: unknown, origin = '') {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { source, data, origin }));
    });
  }

  it.each([
    [{ renderingMode: 'cinematic-v1', html: '<html></html>' }, true],
    [{ renderingMode: 'cinematic-v1' }, true],
    [{ html: sceneHtml }, true],
    [{ html: "<main data-cinematic = 'v1'></main>" }, true],
    [{ html: '<main data-cinematic=v1></main>' }, true],
    [{ renderingMode: 'animated-html', html: '<canvas></canvas>' }, false],
    [{ html: '<main data-cinematic="v2"></main>' }, false],
    [{ html: '<main>data-cinematic="v1"</main>' }, false],
    [null, false],
    [[], false],
  ])('detects cinematic markers without reclassifying legacy content: %j', (content, expected) => {
    expect(isCinematicContent(content)).toBe(expected);
  });

  it('patches the HTML, preserves the script-only sandbox, and provides a visible immersive entry', async () => {
    await mount();
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.hasAttribute('allowfullscreen')).toBe(true);
    expect(frame.srcdoc).toContain('data-iframe-error-shim');
    expect(frame.srcdoc).toContain('data-cinematic-preview-bridge');
    expect(frame.srcdoc).toContain('data-cinematic-preview-layout');
    expect(frame.srcdoc).toContain('#cinema{min-height:0;height:100vh}');
    expect(frame.srcdoc.indexOf('data-cinematic-preview-layout')).toBeGreaterThan(frame.srcdoc.indexOf('data-iframe-patch'));
    expect(frame.srcdoc).toContain("event.key === 'Escape'");
    expect(frame.srcdoc).not.toContain('allow-same-origin');
    expect(container.querySelector('button[aria-label="沉浸演示"]')?.textContent).toContain(
      '沉浸演示',
    );
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('keeps the same iframe, srcDoc and window through immersion, Escape and repeated toggles', async () => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'scroll';
    await mount();
    const frame = container.querySelector('iframe')!;
    const frameWindow = frame.contentWindow;
    const srcDoc = frame.srcdoc;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(frame, { attributes: true, attributeFilter: ['srcdoc'] });
    await clickImmersive();
    expect(container.querySelector('[role="dialog"]')?.getAttribute('data-immersive')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe(
      'false',
    );
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('scroll');
    await clickImmersive();
    await clickImmersive();
    expect(container.querySelector('iframe')).toBe(frame);
    expect(frame.contentWindow).toBe(frameWindow);
    expect(frame.srcdoc).toBe(srcDoc);
    expect(mutations).toHaveLength(0);
    observer.disconnect();
    expect(document.activeElement).toBe(container.querySelector('button[aria-label="沉浸演示"]'));
  });

  it('accepts iframe Escape only from its own contentWindow', async () => {
    await mount();
    await clickImmersive();
    const data = { __aiseceduCinematicPreview: true, action: 'exit-immersive' };
    await message(window, data);
    await message(null, data);
    expect(container.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe(
      'true',
    );
    await message(container.querySelector('iframe')!.contentWindow, data);
    expect(container.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe(
      'false',
    );
  });

  it('notifies the same-origin host on immersion, exit and active unmount without idle false messages', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('parent', { postMessage });
    await mount();
    expect(postMessage).not.toHaveBeenCalled();
    await clickImmersive();
    await clickImmersive();
    await clickImmersive();
    await act(async () => root.render(null));
    expect(postMessage.mock.calls).toEqual(
      [true, false, true, false].map((immersive) => [
        { __aiseceduCinematicPreview: true, action: 'immersive-change', immersive },
        window.location.origin,
      ]),
    );
  });

  it('accepts host exit only from the immediate same-origin parent and rejects parent runtime errors', async () => {
    const parent = { postMessage: vi.fn() } as unknown as Window;
    vi.stubGlobal('parent', parent);
    await mount();
    await clickImmersive();
    const exit = { __aiseceduCinematicPreview: true, action: 'host-exit-immersive' };
    await message(parent, exit, 'https://unrelated.test');
    await message(window, exit, window.location.origin);
    await message(container.querySelector('iframe')!.contentWindow, exit, window.location.origin);
    await message(
      parent,
      { __maicInteractive: true, kind: 'runtime-error', message: 'parent error must be ignored' },
      window.location.origin,
    );
    expect(container.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe(
      'true',
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await message(parent, exit, window.location.origin);
    expect(container.querySelector('[data-immersive]')?.getAttribute('data-immersive')).toBe(
      'false',
    );
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      { __aiseceduCinematicPreview: true, action: 'immersive-change', immersive: false },
      window.location.origin,
    );
  });

  it('shows only source-checked runtime errors, deduplicates replay, and keeps errors visible in immersion', async () => {
    await mount();
    const frame = container.querySelector('iframe')!;
    const data = {
      __maicInteractive: true,
      kind: 'runtime-error',
      errorKind: 'error',
      message: '<b>renderer failed</b>',
    };
    await message(window, data);
    await message(null, data);
    await message(frame.contentWindow, { ...data, message: { message: 'bad payload' } });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await message(frame.contentWindow, data);
    await message(frame.contentWindow, data);
    expect(container.querySelectorAll('[role="alert"] li')).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      '<b>renderer failed</b>',
    );
    expect(container.querySelector('[role="alert"] b')).toBeNull();
    await clickImmersive();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('renderer failed');
    await clickImmersive();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('renderer failed');
    expect(container.querySelector('iframe')).toBe(frame);
  });

  it('requests buffered errors on load and resets old errors only when the HTML changes', async () => {
    await mount();
    const frame = container.querySelector('iframe')!;
    const postMessage = vi.spyOn(frame.contentWindow!, 'postMessage');
    await act(async () => frame.dispatchEvent(new Event('load')));
    expect(postMessage).toHaveBeenCalledWith({ __maicErrorReplayRequest: true }, '*');
    await message(frame.contentWindow, {
      __maicInteractive: true,
      kind: 'runtime-error',
      message: 'old revision failure',
    });
    await mount(sceneHtml.replace('canvas', 'canvas aria-label="新版"'));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('reports missing cinematic HTML rather than silently displaying an empty frame', async () => {
    await mount('');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('缺少演示 HTML');
  });

  it('restores page scrolling and listeners when an immersed preview unmounts', async () => {
    await mount();
    await clickImmersive();
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe('');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  });

  it('bypasses PPT pagination, thumbnails and scale controls for integrated cinematic lessons', async () => {
    await act(async () =>
      root.render(
        createElement(IntegratedLessonPreview, {
          artifacts: [
            artifact('细胞结构', { html: sceneHtml }),
            artifact('另一作品', { html: sceneHtml }),
          ],
        }),
      ),
    );
    expect(container.querySelector('[data-aisecedu-preview-surface="cinematic"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="切换作品"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="画面控制"]')).toBeNull();
    expect(container.querySelector('[aria-label="演示场景切换"]')).toBeNull();
    expect(container.querySelector('[aria-label="阅读进度"]')).toBeNull();
    expect(container.querySelector('[aria-label="内容导航"]')).toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })));
    expect(container.querySelector('iframe')?.title).toContain('细胞结构');
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('uses the same cinematic player in the teacher workbench and retains legacy HTML previews', async () => {
    await act(async () =>
      root.render(
        createElement(ArtifactPreview, {
          artifact: artifact('工作台作品', {
            renderingMode: 'cinematic-v1',
            html: '<canvas></canvas>',
          }),
        }),
      ),
    );
    expect(container.querySelector('[data-aisecedu-cinematic-preview="v1"]')).not.toBeNull();
    await act(async () =>
      root.render(
        createElement(ArtifactPreview, {
          artifact: artifact('旧版 HTML', { html: '<p>旧作品</p>' }),
        }),
      ),
    );
    expect(container.querySelector('[data-aisecedu-cinematic-preview]')).toBeNull();
    expect(container.querySelector('iframe')?.srcdoc).toContain('旧作品');
    expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('can switch between metadata-only cinematic content and legacy scenes in a mixed collection', async () => {
    await act(async () =>
      root.render(
        createElement(IntegratedLessonPreview, {
          artifacts: [
            artifact('新演示', { renderingMode: 'cinematic-v1', html: '<canvas></canvas>' }),
            artifact('旧演示', { html: '<p>旧演示内容</p>' }),
          ],
        }),
      ),
    );
    expect(container.querySelector('[data-aisecedu-preview-surface="cinematic"]')).not.toBeNull();
    const selector = container.querySelector<HTMLSelectElement>('[aria-label="切换作品"]')!;
    await act(async () => {
      selector.value = '1';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('[data-aisecedu-preview-surface="reader"]')).not.toBeNull();
    expect(container.querySelector('iframe')?.srcdoc).toContain('旧演示内容');
    const openCinematic = container.querySelector<HTMLButtonElement>(
      '[aria-label="打开场景 1：新演示"]',
    )!;
    await act(async () => openCinematic.click());
    expect(container.querySelector('[data-aisecedu-preview-surface="cinematic"]')).not.toBeNull();
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('keeps cinematic sizing outside slide transforms and preserves prep build-time gating', () => {
    const css = readFileSync(
      resolve(__dirname, '../../components/integrated-lesson-preview.module.css'),
      'utf8',
    );
    const prep = readFileSync(resolve(__dirname, '../../app/prep/[id]/page.tsx'), 'utf8');
    expect(css).toContain('min-height: min(72vh, 800px)');
    expect(css).toMatch(
      /\.cinematicPlayer\[data-immersive='true'\]\s*\{[^}]*position: fixed;[^}]*width: 100%;[^}]*height: 100dvh/,
    );
    expect(css).not.toMatch(/\.cinematicFrame\s*\{[^}]*transform:/);
    expect(prep).toContain("process.env.NEXT_PUBLIC_AISECEDU_INTEGRATED === 'true'");
    expect(prep).toContain('if (INTEGRATED)');
    expect(prep).toContain('<CinematicPreview title={a.title}');
    expect(prep).toContain('!cinematic && isWidget');
  });
});
