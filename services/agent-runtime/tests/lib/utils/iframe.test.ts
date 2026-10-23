import { describe, expect, it } from 'vitest';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import { compileCinematicScene } from '@/lib/cinematic/compile';
import { extractCinematicScene } from '@/lib/cinematic/schema';
import { sceneFixture } from '../../fixtures/cinematic';
import { extractDiagramConfig } from '@/lib/widgets/diagram';

describe('patchHtmlForIframe', () => {
  it('refreshes an old diagram player from unchanged validated config and remains idempotent', () => {
    const config={type:'diagram',diagramType:'flowchart',title:'学习流程',nodes:[{id:'learn',label:'学习',details:'查看材料'},{id:'submit',label:'提交',details:'提交结果'}],edges:[{from:'learn',to:'submit'}]};
    const old='<html><head></head><body><main data-diagram="v1"></main><script type="application/json" id="widget-config">'+JSON.stringify(config)+'</script><script>window.legacyDiagram=true</script></body></html>';
    const output=patchHtmlForIframe(old);
    expect(output).not.toContain('legacyDiagram');
    expect(output).toContain('diagram-reset');
    expect(extractDiagramConfig(output)).toEqual(config);
    expect(output).toContain("connect-src 'none'");
    expect(output).not.toContain('data-aisecedu-library');
    expect(patchHtmlForIframe(output)).toEqual(output);
  });
  it('does not execute stale diagram scripts when its config is invalid', () => {
    const output=patchHtmlForIframe('<main data-diagram="v1"></main><script id="widget-config" type="application/json">{"nodes":[]}</script><script>window.staleDiagram=true</script>');
    expect(output).toContain('交互图数据无法读取');
    expect(output).toContain('role="alert"');
    expect(output).not.toContain('staleDiagram');
    expect(output).toContain("connect-src 'none'");
  });
  it('refreshes stored cinematic runtime without changing the scene or accumulating dependencies', () => {
    const scene = sceneFixture();
    const legacy = compileCinematicScene(scene).replace(/<script src="aisecedu:three">[\s\S]*<\/body>/, '<script>window.legacyBrokenPlayer=true</script></body>');
    const output = patchHtmlForIframe(legacy);
    expect(output).not.toContain('legacyBrokenPlayer');
    expect(output).toContain('data-cinematic-runtime="2026-09-13.5"');
    expect(output).toContain('data-aisecedu-library="cinematic-three-r150"');
    expect(extractCinematicScene(output)).toEqual(scene);
    expect(patchHtmlForIframe(output)).toEqual(output);
  });

  it('shows a recoverable error for invalid stored scenes and never executes their stale player', () => {
    const output = patchHtmlForIframe('<main data-cinematic="v1"></main><script>window.stalePlayer=true</script><script type="application/json" id="cinematic-scene">{"schemaVersion":"bad"}</script>');
    expect(output).toContain('三维场景数据无法读取');
    expect(output).toContain('role="alert"');
    expect(output).not.toContain('stalePlayer');
    expect(output).not.toContain('data-aisecedu-library');
    expect(output).toContain("connect-src 'none'");
  });

  it('bundles Three.js locally while keeping the no-network sandbox policy', () => {
    const out = patchHtmlForIframe('<html><head></head><body><script src="./saved_files/three.min.js.下载"></script><script>new THREE.Scene()</script></body></html>');
    expect(out).toContain('data-aisecedu-library="three-r150"');
    expect(out).not.toContain('src="./saved_files/three.min.js.下载"');
    expect(out.indexOf('data-aisecedu-library')).toBeLessThan(out.indexOf('new THREE.Scene()'));
    expect(out).toContain("connect-src 'none'");
    expect(out).not.toContain('allow-same-origin');
  });
  it('injects the storage shim and sizing CSS after <head>', () => {
    const out = patchHtmlForIframe(
      '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>',
    );
    expect(out).toContain('data-iframe-storage-shim');
    expect(out).toContain('data-iframe-patch');
  });

  it('runs the storage shim before the page scripts', () => {
    const html =
      '<!DOCTYPE html><html><head><script>window.__x = localStorage.getItem("k");</script></head><body></body></html>';
    const out = patchHtmlForIframe(html);
    // The shim must appear before the page's own <script> so storage is safe by then.
    expect(out.indexOf('data-iframe-storage-shim')).toBeLessThan(out.indexOf('window.__x'));
  });

  it('the shim provides a working in-memory storage when the real one throws', () => {
    // Execute the injected shim against a fake window whose localStorage getter
    // throws (mirroring a null-origin sandboxed iframe), then assert the shim
    // installed a usable in-memory store.
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-storage-shim>([\s\S]*?)<\/script>/)?.[1];
    expect(shim).toBeTruthy();

    const win: Record<string, unknown> = {};
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('sandboxed');
      },
    });
    Object.defineProperty(win, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('sandboxed');
      },
    });
    new Function('window', shim as string)(win);

    const ls = win.localStorage as Storage;
    expect(ls.getItem('missing')).toBeNull();
    ls.setItem('a', '1');
    expect(ls.getItem('a')).toBe('1');
    expect(ls.length).toBe(1);
    ls.removeItem('a');
    expect(ls.getItem('a')).toBeNull();
  });

  it('falls back to prepending when there is no <head>', () => {
    const out = patchHtmlForIframe('<div>no head</div>');
    // The error-capture shim is injected first, so it leads the prepended block.
    expect(out.startsWith('\n<script data-iframe-error-shim>')).toBe(true);
  });

  it('injects the error-capture shim before the storage shim and page scripts', () => {
    const html = '<!DOCTYPE html><html><head><script>boom()</script></head><body></body></html>';
    const out = patchHtmlForIframe(html);
    expect(out).toContain('data-iframe-error-shim');
    // error shim runs first → before storage shim → before page scripts, so it
    // catches errors from everything that follows.
    expect(out.indexOf('data-iframe-error-shim')).toBeLessThan(
      out.indexOf('data-iframe-storage-shim'),
    );
    expect(out.indexOf('data-iframe-storage-shim')).toBeLessThan(out.indexOf('boom()'));
  });

  it('the error shim posts runtime errors (onerror / resource / rejection / console.error) to the parent', () => {
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-error-shim>([\s\S]*?)<\/script>/)?.[1];
    expect(shim).toBeTruthy();

    const posts: Array<[Record<string, unknown>, string]> = [];
    const handlers: Record<string, (e: unknown) => void> = {};
    const win = {
      parent: { postMessage: (m: Record<string, unknown>, o: string) => posts.push([m, o]) },
      addEventListener: (t: string, cb: (e: unknown) => void) => {
        handlers[t] = cb;
      },
      console: { error: (..._args: unknown[]) => {} },
    };
    new Function('window', shim as string)(win);

    handlers.error({ message: 'JSON.parse boom', filename: 'p.html', lineno: 12 });
    expect(posts[0][0]).toMatchObject({ kind: 'runtime-error', errorKind: 'error' });
    expect(posts[0][0].message).toContain('JSON.parse boom');
    expect(posts[0][1]).toBe('*');

    handlers.error({ target: { src: 'https://cdn/katex.js' } });
    expect(String(posts[1][0].message)).toContain('Failed to load resource');

    handlers.unhandledrejection({ reason: { message: 'rej' } });
    expect(posts[2][0]).toMatchObject({ errorKind: 'unhandledrejection' });

    win.console.error('console boom');
    expect(posts[3][0]).toMatchObject({ errorKind: 'console.error' });
    expect(String(posts[3][0].message)).toContain('console boom');
  });

  it('the error shim buffers errors and re-emits them on a parent replay request', () => {
    // Guards the subscribe-after-insert race: a page that throws synchronously
    // while srcDoc parses may post before the parent subscribes. The shim must
    // re-emit the whole buffer when the parent asks, so nothing is lost.
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-error-shim>([\s\S]*?)<\/script>/)?.[1];
    const posts: Array<[Record<string, unknown>, string]> = [];
    const handlers: Record<string, (e: unknown) => void> = {};
    const win = {
      parent: { postMessage: (m: Record<string, unknown>, o: string) => posts.push([m, o]) },
      addEventListener: (t: string, cb: (e: unknown) => void) => {
        handlers[t] = cb;
      },
      console: { error: (..._args: unknown[]) => {} },
    };
    new Function('window', shim as string)(win);

    // Two errors fire "before the parent subscribed".
    handlers.error({ message: 'first boom' });
    handlers.unhandledrejection({ reason: { message: 'second boom' } });
    expect(posts).toHaveLength(2);

    // Parent now subscribes and requests a replay.
    handlers.message({ data: { __maicErrorReplayRequest: true } });
    expect(posts).toHaveLength(4);
    expect(String(posts[2][0].message)).toContain('first boom');
    expect(String(posts[3][0].message)).toContain('second boom');
    expect(posts[2][0]).toMatchObject({ kind: 'runtime-error', errorKind: 'error' });

    // An unrelated message must NOT trigger a replay.
    handlers.message({ data: { foo: 1 } });
    expect(posts).toHaveLength(4);
  });
});
