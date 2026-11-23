import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ChevronLeft, ChevronRight, Download, FileCode2, FileSpreadsheet, FileText,
  LoaderCircle, Maximize2, Minimize2, RotateCcw, X,
} from 'lucide-react';
import { api, ApiError } from '../core/api';
import { useWorkbench } from '../core/context';
import {
  conversationFiles, fileFormatLabel, filePath, fileSize, fileUrl, type ConversationFile,
} from '../core/conversation-files';
import { Button, IconButton } from '../components/ui';

type Preview =
  | { kind: 'pages'; pages: number; width: number; height: number }
  | { kind: 'markdown' | 'text'; text: string; truncated: boolean }
  | { kind: 'table'; rows: string[][]; truncated: boolean }
  | { kind: 'notebook'; cells: { kind: string; source: string }[]; truncated: boolean }
  | { kind: 'html' };

type Zoom = 'fit' | '50' | '70' | '100' | '125' | '150' | '200';

export function FileGlyph({ format, size = 21 }: { format: string; size?: number }) {
  const Icon = format === 'csv' ? FileSpreadsheet
    : ['json', 'html', 'ipynb'].includes(format) ? FileCode2 : FileText;
  return <Icon size={size} aria-hidden="true" />;
}

function PreviewMarkdown({ text }: { text: string }) {
  return <div className="markdown"><Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
    img: ({ alt }) => alt ? <span>{alt}</span> : null,
    a: ({ children }) => <span>{children}</span>,
  }}>{text}</Markdown></div>;
}

function pageError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 422) return '这份文件超出在线预览范围，可以下载原文件。';
    if (error.status === 401 || error.status === 404) return '当前会话无法读取这份文件。';
  }
  return '文件暂时无法预览。请重试，或下载原文件。';
}

function PageImage({ file, number }: { file: ConversationFile; number: number }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return failed
    ? <div className="preview-page-error">
        <p>第 {number} 页加载失败</p>
        <Button onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>重试此页</Button>
      </div>
    : <img src={`${fileUrl(file)}?view=page&page=${number}&attempt=${attempt}`}
        loading={number === 1 ? 'eager' : 'lazy'} decoding="async" alt={`第 ${number} 页`}
        draggable={false} onError={() => setFailed(true)} />;
}

export function FilePreview({
  file, expanded, onExpand, onClose,
}: {
  file: ConversationFile;
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
}) {
  const { state, controller: c } = useWorkbench();
  const files = conversationFiles(state.thread?.messages);
  if (!files.some(item => item.id === file.id)) files.unshift(file);
  const [result, setResult] = useState<{ id: string; preview?: Preview; error?: string }>();
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [page, setPage] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(500);
  const picker = useRef<HTMLSelectElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pages = useRef<(HTMLElement | null)[]>([]);
  const positions = useRef(new Map<string, { top: number; left: number }>());
  const view = result?.id === file.id ? result.preview : undefined;
  const error = result?.id === file.id ? result.error : undefined;
  const pageView = view?.kind === 'pages' ? view : undefined;
  const paperWidth = pageView ? pageView.width * 4 / 3 : 816;
  const fitting = Math.min(920, Math.max(200, viewportWidth - (viewportWidth < 460 ? 28 : 48)));
  const scale = zoom === 'fit' ? 1 : Number(zoom) / 100;
  const contentWidth = zoom === 'fit' ? fitting : paperWidth * scale;

  useEffect(() => {
    const control = picker.current;
    if (!control) return;
    const root = control.getRootNode() as ShadowRoot | Document;
    const active = root.activeElement;
    control.focus({ preventScroll: true });
    return () => {
      if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    api<Preview>(filePath(file) + '?view=preview', { signal: abort.signal })
      .then(preview => { if (!abort.signal.aborted) setResult({ id: file.id, preview }); })
      .catch(error => { if (!abort.signal.aborted) setResult({ id: file.id, error: pageError(error) }); });
    return () => abort.abort();
  }, [file.id, file.jobId, retry]);

  useLayoutEffect(() => {
    const surface = canvas.current;
    if (!surface || !view) return;
    const position = positions.current.get(file.id);
    surface.scrollTop = position?.top || 0;
    surface.scrollLeft = position?.left || 0;
    setPage(1);
  }, [file.id, view]);

  useEffect(() => {
    if (!pageView || !canvas.current) return;
    const surface = canvas.current;
    let frame = 0;
    const update = () => {
      const center = surface.getBoundingClientRect().top + surface.clientHeight * 0.36;
      let next = 1;
      for (const [index, element] of pages.current.slice(0, pageView.pages).entries()) {
        if (element && element.getBoundingClientRect().top <= center) next = index + 1;
      }
      const maxScroll = surface.scrollHeight - surface.clientHeight;
      setPage(maxScroll > 2 && surface.scrollTop >= maxScroll - 2 ? pageView.pages : next);
    };
    const scroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    surface.addEventListener('scroll', scroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener('scroll', scroll);
    };
  }, [pageView, contentWidth]);

  const goTo = (number: number) => {
    const element = pages.current[number - 1];
    const surface = canvas.current;
    if (!element || !surface) return;
    surface.scrollTop += element.getBoundingClientRect().top - surface.getBoundingClientRect().top - 12;
    setPage(number);
  };

  const zoomTo = (value: Zoom) => {
    const selectedPage = page;
    setZoom(value);
    if (pageView) requestAnimationFrame(() => goTo(selectedPage));
  };

  return (
    <section className="file-preview" aria-label="文件预览">
      <header className="file-preview-toolbar">
        <label className="file-preview-picker" title={file.filename}>
          <FileGlyph format={file.format} size={19} />
          <select aria-label="切换预览文件" ref={picker} value={file.id}
            onChange={event => {
              const selected = files.find(item => item.id === event.target.value);
              if (selected) c.openFile(selected);
            }}>
            {files.map(item => <option key={item.id} value={item.id}>{item.filename}</option>)}
          </select>
        </label>
        <div className="file-preview-tools">
          <select className="file-preview-zoom" aria-label="缩放预览" value={zoom} disabled={!view}
            onChange={event => zoomTo(event.target.value as Zoom)}>
            <option value="fit">适应宽度</option>
            {(['50', '70', '100', '125', '150', '200'] as const).map(value =>
              <option key={value} value={value}>{value}%</option>)}
          </select>
          <a className="button icon-button" aria-label="下载原文件" title="下载原文件"
            href={fileUrl(file)} download={file.filename}><Download size={17} /></a>
          <IconButton className="desktop-only" label={expanded ? '恢复分栏' : '展开文件预览'} onClick={onExpand}>
            {expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </IconButton>
          <IconButton label="关闭文件预览" onClick={onClose}><X size={18} /></IconButton>
        </div>
      </header>

      <div className="file-preview-canvas" ref={canvas} role="region" aria-label="文件内容" tabIndex={0}
        aria-busy={!view && !error} onScroll={event => {
          const { scrollTop, scrollLeft } = event.currentTarget;
          if (view) positions.current.set(file.id, { top: scrollTop, left: scrollLeft });
        }}>
        {error ? (
          <div className="file-preview-state" role="status">
            <FileGlyph format={file.format} size={29} />
            <p>{error}</p>
            <Button onClick={() => { setResult(undefined); setRetry(value => value + 1); }}>
              <RotateCcw size={15} />重试预览
            </Button>
          </div>
        ) : !view ? (
          <div className="file-preview-state" role="status"><LoaderCircle className="spin" size={22} />正在准备预览</div>
        ) : (
          <div className="file-preview-stack" key={file.id}>
            {view.kind === 'pages' ? (
              Array.from({ length: view.pages }, (_, index) => (
                <figure className="file-paper" key={index} ref={element => { pages.current[index] = element; }}
                  style={{ width: contentWidth, aspectRatio: view.width / view.height }}>
                  <PageImage file={file} number={index + 1} />
                </figure>
              ))
            ) : view.kind === 'html' ? (
              <iframe className="file-html-preview" title={file.filename} src={fileUrl(file) + '?view=html'}
                sandbox="" referrerPolicy="no-referrer"
                style={{ width: contentWidth / scale, zoom: scale }} />
            ) : (
              <article className="file-reading-sheet" style={{ width: contentWidth, fontSize: `${scale}rem` }}>
                {view.truncated && <p className="file-preview-limit">仅显示部分内容，可下载原文件阅读全文。</p>}
                {view.kind === 'markdown' ? <PreviewMarkdown text={view.text} />
                  : view.kind === 'table' ? (
                    <table>
                      <thead><tr>{view.rows[0]?.map((cell, index) => <th key={index} scope="col">{cell}</th>)}</tr></thead>
                      <tbody>{view.rows.slice(1).map((row, index) =>
                        <tr key={index}>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody>
                    </table>
                  ) : view.kind === 'notebook' ? view.cells.map((cell, index) =>
                    cell.kind === 'markdown'
                      ? <PreviewMarkdown key={index} text={cell.source} />
                      : <pre key={index}><code>{cell.source}</code></pre>)
                    : 'text' in view && <pre>{view.text}</pre>}
              </article>
            )}
          </div>
        )}
      </div>

      <footer className="file-preview-footer">
        <span>{fileFormatLabel(file.format)}{file.size > 0 ? ` · ${fileSize(file.size)}` : ''}</span>
        {pageView && <div className="file-page-controls">
          <IconButton label="上一页" disabled={page <= 1} onClick={() => goTo(page - 1)}><ChevronLeft size={16} /></IconButton>
          <span aria-live="polite">{page} / {pageView.pages}</span>
          <IconButton label="下一页" disabled={page >= pageView.pages} onClick={() => goTo(page + 1)}><ChevronRight size={16} /></IconButton>
        </div>}
      </footer>
    </section>
  );
}
