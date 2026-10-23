/**
 * In-memory localStorage/sessionStorage shim, injected as the FIRST thing in the
 * document so the page's own scripts see working storage.
 *
 * The interactive iframe is sandboxed `allow-scripts` WITHOUT `allow-same-origin`
 * (intentional — combining them negates the sandbox for LLM-authored HTML). In a
 * null-origin document, touching `window.localStorage` throws a SecurityError;
 * many generated pages read/write storage in their setup code, so that throw
 * crashes the script before anything renders → a blank/black widget. This shim
 * replaces both storages with an in-memory implementation when the real ones are
 * inaccessible, keeping the sandbox intact while letting storage-using pages run.
 */
import threeSource from '../../public/vendor/three-r150.min.js?raw';
import cinematicThreeSource from '../../public/vendor/cinematic-three-r150.min.js?raw';
import { compileCinematicScene } from '../cinematic/compile';
import { extractCinematicScene } from '../cinematic/schema';
import { extractDiagramConfig, renderDiagramHtml } from '../widgets/diagram';
import { compileProcessScene } from '../process/compile';
import { extractProcessScene } from '../process/schema';

const STORAGE_SHIM = `<script data-iframe-storage-shim>
(function () {
  function makeStore() {
    var data = Object.create(null);
    return {
      getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = Object.create(null); },
      key: function (i) { var keys = Object.keys(data); return i < keys.length ? keys[i] : null; },
      get length() { return Object.keys(data).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    var ok = false;
    try { var s = window[name]; if (s) { s.getItem('__probe__'); ok = true; } } catch (e) { ok = false; }
    if (!ok) {
      try { Object.defineProperty(window, name, { value: makeStore(), configurable: true }); } catch (e) {}
    }
  });
})();
</script>`;

/**
 * Runtime-error capture, injected as the VERY FIRST script so it observes errors
 * from the storage shim and every page script that follows. Generated interactive
 * pages frequently die on a runtime error (a `JSON.parse` of malformed config, a
 * reference to a CDN lib that failed to load, …) → the script aborts and the
 * widget renders blank. The sandboxed (null-origin) iframe can't be read by the
 * editor, but it CAN `postMessage` out: this forwards `window.onerror`, unhandled
 * rejections and `console.error` to the parent, which stores them per scene and
 * feeds them to the editor agent — so it can diagnose a blank page instead of
 * guessing. Only touches `window.*` so it stays sandbox-safe and unit-testable.
 *
 * The most important errors (a `JSON.parse` that aborts setup) fire SYNCHRONOUSLY
 * while srcDoc parses — potentially before the parent has subscribed its `message`
 * listener (which it installs from a passive effect after inserting the iframe).
 * To avoid losing exactly the errors this feature exists to surface, every post is
 * also buffered, and the shim re-emits the whole buffer when the parent sends a
 * `{ __maicErrorReplayRequest: true }` message once its listener is ready. The
 * parent dedups, so the live + replayed copies collapse to one.
 */
const ERROR_CAPTURE_SHIM = `<script data-iframe-error-shim>
(function () {
  var buffer = [];
  function emit(errorKind, message) {
    try {
      window.parent.postMessage(
        { __maicInteractive: true, kind: 'runtime-error', errorKind: errorKind, message: message },
        '*'
      );
    } catch (e) {}
  }
  function post(errorKind, message) {
    message = String(message).slice(0, 1200);
    if (buffer.length < 50) buffer.push([errorKind, message]);
    emit(errorKind, message);
  }
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (d && d.__maicErrorReplayRequest === true) {
      for (var i = 0; i < buffer.length; i++) emit(buffer[i][0], buffer[i][1]);
    }
  });
  window.addEventListener('error', function (e) {
    if (e && e.message) {
      post('error', e.message + (e.filename ? ' (' + e.filename + ':' + (e.lineno || 0) + ')' : ''));
    } else if (e && e.target && (e.target.src || e.target.href)) {
      post('resource', 'Failed to load resource: ' + (e.target.src || e.target.href));
    }
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    post('unhandledrejection', (r && (r.stack || r.message)) || r || 'unhandled promise rejection');
  });
  try {
    var c = window.console;
    if (c && c.error) {
      var _ce = c.error;
      c.error = function () {
        try { post('console.error', Array.prototype.map.call(arguments, function (a) { return (a && a.stack) || String(a); }).join(' ')); } catch (e) {}
        return _ce.apply(c, arguments);
      };
    }
  } catch (e) {}
})();
</script>`;

/**
 * Patch embedded HTML to display correctly inside an iframe.
 *
 * Injects a runtime-error capture shim + a storage shim (so sandboxed pages that
 * use localStorage don't crash) plus CSS that ensures proper sizing and scrolling
 * behavior when HTML content is rendered via srcDoc in an iframe. The shims are
 * placed first so they run before the page's own scripts (error capture first, so
 * it also observes the storage shim).
 */
export function patchHtmlForIframe(html: string): string {
  if (/<[^>]+\sdata-process\s*=\s*(?:"v[12]"|'v[12]'|v[12](?=[\s>]))/i.test(html)) {
    const scene = extractProcessScene(html);
    html = scene ? compileProcessScene(scene) : '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><main role="alert"><h1>互动过程数据无法读取</h1><p>请检查版本记录，原作品未被修改。</p></main></body></html>';
  }
  const cinematic = /<[^>]+\sdata-cinematic\s*=\s*(?:"v[12]"|'v[12]'|v[12](?=[\s>]))/i.test(html);
  if (cinematic) {
    const scene = extractCinematicScene(html);
    // Stored scenes carry an old inlined player; render their validated data with today's runtime without rewriting revision history.
    html = scene
      ? compileCinematicScene(scene)
      : '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><main role="alert"><h1>三维场景数据无法读取</h1><p>此版本缺少有效的场景数据，请返回版本记录检查或重新生成。原有内容未被修改。</p></main><script>throw new Error("三维场景数据无法读取：缺少或无效的 SceneIR")</script></body></html>';
  } else if (/<[^>]+\sdata-diagram\s*=\s*(?:"v1"|'v1'|v1(?=[\s>]))/i.test(html)) {
    const config = extractDiagramConfig(html);
    // Reuse validated data, not the obsolete inline interaction code; history
    // stays untouched and the same no-network iframe policy still applies.
    html = config
      ? renderDiagramHtml(config)
      : '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><main role="alert"><h1>交互图数据无法读取</h1><p>请检查原版本中的节点和关系数据。原有内容未被修改。</p></main><script>throw new Error("交互图数据无法读取：缺少或无效的配置")</script></body></html>';
  }
  const needsThree = /\bTHREE\s*[.\[]|src\s*=\s*["'][^"']*(?:three(?:\.min)?\.js|aisecedu:three)/i.test(html);
  if (cinematic) html = html.replace(/<script\b[^>]*\bdata-cinematic-library\s*=\s*["']three-r150["'][^>]*>[\s\S]*?<\/script\s*>/gi, '');
  if (needsThree) {
    html = html.replace(/<script\b[^>]*\bsrc\s*=\s*(["'])[^"']*(?:three(?:\.min)?\.js(?:\.下载)?|aisecedu:three)(?:\?[^"']*)?\1[^>]*>\s*<\/script\s*>/gi, '');
  }
  const dependencies = needsThree
    ? `<script data-aisecedu-library="${cinematic?'cinematic-three-r150':'three-r150'}">${(cinematic?cinematicThreeSource:threeSource).replace(/<\/script/gi, '<\\/script')}</script>`
    : '';
  const contentSecurityPolicy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  const iframeCss = `<style data-iframe-patch>
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    overflow-y: auto;
  }
  /* Fix min-h-screen: in iframes 100vh is the iframe height, which is correct,
     but ensure body actually fills it */
  body { min-height: 100vh; }
</style>`;

  const injection = '\n' + ERROR_CAPTURE_SHIM + '\n' + STORAGE_SHIM + '\n' + contentSecurityPolicy + '\n' + dependencies + '\n' + iframeCss;

  // Insert right after <head> or at the start of the document
  const headIdx = html.indexOf('<head>');
  if (headIdx !== -1) {
    const insertPos = headIdx + 6; // after <head>
    return html.substring(0, insertPos) + injection + html.substring(insertPos);
  }

  const headWithAttrs = html.indexOf('<head ');
  if (headWithAttrs !== -1) {
    const closeAngle = html.indexOf('>', headWithAttrs);
    if (closeAngle !== -1) {
      const insertPos = closeAngle + 1;
      return html.substring(0, insertPos) + injection + html.substring(insertPos);
    }
  }

  // Fallback: prepend
  return injection + html;
}
