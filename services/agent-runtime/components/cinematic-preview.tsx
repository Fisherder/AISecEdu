'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Expand, Film, X } from 'lucide-react';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import styles from './integrated-lesson-preview.module.css';

type CinematicPreviewProps = {
  html: string;
  title: string;
  navigation?: ReactNode;
};

type RuntimeError = { kind: string; message: string };

const ESCAPE_BRIDGE = `<script data-cinematic-preview-bridge>
window.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !event.defaultPrevented) {
    window.parent.postMessage({ __aiseceduCinematicPreview: true, action: 'exit-immersive' }, '*');
  }
});
</script>`;

const EMBEDDED_LAYOUT = `<style data-cinematic-preview-layout>
#cinema{min-height:0;height:100vh;height:100dvh}
#cinema>.cinema-header{display:none}
#cinema.has-domain-lab>.cinema-header{display:flex;align-items:center;justify-content:flex-end}
#cinema>.cinema-header>h1{display:none}
</style>`;

export function isCinematicContent(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return false;
  const value = content as Record<string, unknown>;
  return (
    value.renderingMode === 'cinematic-v1' ||
    (typeof value.html === 'string' &&
      /<[^>]+\sdata-cinematic\s*=\s*(?:"v1"|'v1'|v1(?=[\s>]))/i.test(value.html))
  );
}

export function CinematicPreview({ html, title, navigation }: CinematicPreviewProps) {
  const [immersive, setImmersive] = useState(false);
  const [errorState, setErrorState] = useState<{ html: string; errors: RuntimeError[] }>({
    html,
    errors: [],
  });
  const rootRef = useRef<HTMLElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const immersiveButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const frameId = useId();
  const srcDoc = useMemo(() => {
    const patched = patchHtmlForIframe(html);
    return /<\/head\s*>/i.test(patched)
      ? patched.replace(/<\/head\s*>/i, `${EMBEDDED_LAYOUT}${ESCAPE_BRIDGE}</head>`)
      : `${EMBEDDED_LAYOUT}${ESCAPE_BRIDGE}${patched}`;
  }, [html]);
  if (errorState.html !== html) setErrorState({ html, errors: [] });
  const errors = errorState.html === html ? errorState.errors : [];

  const requestErrorReplay = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ __maicErrorReplayRequest: true }, '*');
  }, []);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    immersiveButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!immersive || window.parent === window) return;
    const notifyParent = (active: boolean) => {
      window.parent.postMessage(
        {
          __aiseceduCinematicPreview: true,
          action: 'immersive-change',
          immersive: active,
        },
        window.location.origin,
      );
    };
    notifyParent(true);
    return () => notifyParent(false);
  }, [immersive]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || Array.isArray(data)) return;
      if (
        window.parent !== window &&
        event.source === window.parent &&
        event.origin === window.location.origin &&
        data.__aiseceduCinematicPreview === true &&
        data.action === 'host-exit-immersive'
      ) {
        if (rootRef.current?.dataset.immersive === 'true') exitImmersive();
        return;
      }
      const source = iframeRef.current?.contentWindow;
      if (!source || event.source !== source) return;
      if (data.__aiseceduCinematicPreview === true && data.action === 'toggle-immersive') {
        setImmersive((previous) => !previous);
        return;
      }
      if (data.__aiseceduCinematicPreview === true && data.action === 'exit-immersive') {
        if (rootRef.current?.dataset.immersive === 'true') exitImmersive();
        return;
      }
      if (
        data.__maicInteractive !== true ||
        data.kind !== 'runtime-error' ||
        typeof data.message !== 'string' ||
        !data.message.trim()
      ) {
        return;
      }
      const error = {
        kind: typeof data.errorKind === 'string' ? data.errorKind.slice(0, 60) : 'runtime-error',
        message: data.message.slice(0, 1200),
      };
      setErrorState((current) => {
        const previous = current.html === html ? current.errors : [];
        return previous.some((item) => item.kind === error.kind && item.message === error.message)
          ? current
          : { html, errors: [...previous.slice(-19), error] };
      });
    };
    window.addEventListener('message', onMessage);
    requestErrorReplay();
    return () => window.removeEventListener('message', onMessage);
  }, [html, srcDoc, exitImmersive, requestErrorReplay]);

  useEffect(() => {
    if (!immersive) return;
    const root = rootRef.current;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    immersiveButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitImmersive();
      } else if (event.key === 'Tab' && root) {
        const focusable = root.querySelectorAll<HTMLElement>('button, select, iframe');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !root?.contains(event.target)) {
        immersiveButtonRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
    };
  }, [immersive, exitImmersive]);

  return (
    <section
      ref={rootRef}
      data-aisecedu-cinematic-preview="v1"
      data-immersive={immersive ? 'true' : 'false'}
      className={styles.cinematicPlayer}
      role={immersive ? 'dialog' : 'region'}
      aria-modal={immersive ? true : undefined}
      aria-labelledby={headingId}
    >
      <header className={styles.cinematicHeader}>
        <div className={styles.cinematicHeading}>
          <Film size={19} aria-hidden="true" />
          <div>
            <small>三维电影式演示</small>
            <h2 id={headingId}>{title}</h2>
          </div>
        </div>
        <div className={styles.cinematicActions}>
          {navigation}
          <button
            ref={immersiveButtonRef}
            type="button"
            className={styles.cinematicImmersiveButton}
            aria-label={immersive ? '退出沉浸演示' : '沉浸演示'}
            aria-pressed={immersive}
            aria-controls={frameId}
            onClick={() => (immersive ? exitImmersive() : setImmersive(true))}
          >
            {immersive ? (
              <X size={17} aria-hidden="true" />
            ) : (
              <Expand size={17} aria-hidden="true" />
            )}
            <span>{immersive ? '退出沉浸演示' : '沉浸演示'}</span>
            {immersive ? <kbd>Esc</kbd> : null}
          </button>
        </div>
      </header>
      {errors.length || !html.trim() ? (
        <aside className={styles.cinematicErrors} role="alert" aria-label="演示运行时错误">
          <strong>
            {html.trim() ? '演示出现运行时错误' : '该版本缺少演示 HTML，暂时无法播放。'}
          </strong>
          {errors.length ? (
            <>
              <p>画面与播放状态已保留；请将以下错误用于修订排查（最近 20 条）。</p>
              <ul>
                {errors.map((error, index) => (
                  <li key={index}>
                    <span>{error.kind}</span> {error.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      ) : null}
      <div className={styles.cinematicScreen}>
        <iframe
          id={frameId}
          ref={iframeRef}
          srcDoc={srcDoc}
          title={`${title} · 电影式播放器`}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          allowFullScreen
          onLoad={requestErrorReplay}
          className={styles.cinematicFrame}
        />
      </div>
    </section>
  );
}
