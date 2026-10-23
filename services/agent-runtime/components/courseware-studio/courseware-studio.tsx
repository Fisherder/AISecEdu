'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { nanoid } from 'nanoid';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Expand,
  FileText,
  Grid2X2,
  History,
  Loader2,
  Menu,
  Minus,
  MousePointer2,
  PanelRightClose,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { Lesson, LessonArtifact } from '@/lib/types/lesson';
import type { PPTElement } from '@openmaic/dsl';
import { CoursewareCanvas, CoursewareSlidePreview } from '@/components/courseware-slide-preview';
import { LessonSlidePreview } from '@/components/integrated-lesson-preview';
import { consumeCoursewareNavigation } from '@/lib/courseware/playback';
import {
  applyProposal,
  contentOf,
  documentKey,
  historyChange,
  historyMove,
  nativeOf,
  notesOf,
  ordered,
  plainText,
  setNativeElement,
  studioOf,
  textHtml,
  updatePage,
  updateStudio,
  type AgentRun,
  type DocumentHistory,
  type StudioInfo,
  type StudioLesson,
} from '@/lib/courseware-studio/document';
import styles from './courseware-studio.module.css';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(value.error || '请求未完成，请重试'), {
      status: response.status,
    });
  return value;
}
const json = (value: unknown) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});
function parentEvent(id: string, action: string) {
  if (window.parent !== window)
    window.parent.postMessage(
      { type: 'aisecedu:courseware-studio', artifactId: id, action },
      location.origin,
    );
}
function StaticSlide({ page, thumbnail = false }: { page: LessonArtifact; thumbnail?: boolean }) {
  const data = studioOf(page),
    native = nativeOf(page);
  return data ? (
    <CoursewareCanvas
      data={data}
      nativeCanvas={native}
      step={data.page.beats.length - 1}
      thumbnail={thumbnail}
    />
  ) : (
    <LessonSlidePreview
      elements={native.elements}
      background={native.background}
      previewId={page.id + (thumbnail ? '-thumb' : '-stage')}
      fill
      thumbnail={thumbnail}
    />
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const props = {
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setText(e.target.value),
    onBlur: () => {
      if (text !== value) onChange(text);
    },
    maxLength,
  };
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {multiline ? <textarea rows={4} {...props} /> : <input {...props} />}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className={styles.numberField}>
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function CoursewareStudio({ lesson: original }: { lesson: Lesson }) {
  const initial = original as StudioLesson;
  const [history, setHistory] = useState<DocumentHistory>({
    past: [],
    present: initial,
    future: [],
  });
  const [saved, setSaved] = useState(initial);
  const [info, setInfo] = useState<StudioInfo | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [activeId, setActiveId] = useState(ordered(initial)[0]?.id || '');
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<'edit' | 'agent' | 'history' | 'sources' | null>(null);
  const [rail, setRail] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [fitWidth, setFitWidth] = useState(900);
  const canvasScroll = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [overview, setOverview] = useState(false);
  const [notes, setNotes] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runBase, setRunBase] = useState<StudioLesson | null>(null);
  const [instruction, setInstruction] = useState('');
  const [scope, setScope] = useState<'page' | 'deck' | 'element'>('page');
  const [starting, setStarting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [version, setVersion] = useState<StudioLesson | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [audienceUrl, setAudienceUrl] = useState('');
  const [audienceStep, setAudienceStep] = useState(-1);
  const playbackRef = useRef({ id: activeId, step: -1 });
  const [elapsed, setElapsed] = useState(0);
  const [help, setHelp] = useState(false);
  const [recovery, setRecovery] = useState<StudioLesson | null>(null);
  const shell = useRef<HTMLElement>(null);
  const modal = useRef<HTMLDialogElement>(null);
  const draftRef = useRef(history.present);
  const displayRef = useRef(activeId);
  const dragRef = useRef<{
    id: string;
    x: number;
    y: number;
    page: LessonArtifact;
    scale: number;
    resize: boolean;
  } | null>(null);
  const [dragged, setDragged] = useState<LessonArtifact | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const session = useRef('');
  const audience = useRef(false);
  const broadcastStep = useCallback(
    (step: number) => {
      playbackRef.current = { id: activeId, step };
      if (!audience.current) channel.current?.postMessage({ type: 'page', id: activeId, step });
    },
    [activeId],
  );
  const draft = history.present;
  draftRef.current = draft;
  displayRef.current = activeId;
  const pages = useMemo(() => ordered(draft), [draft]);
  const index = Math.max(
    0,
    pages.findIndex((p) => p.id === activeId),
  );
  const page = pages[index];
  const currentRun = runs.find((r) => r.id === runId);
  const dirty = documentKey(draft) !== documentKey(saved);
  const editable = Boolean(info) && !audience.current;
  const busy = starting || currentRun?.status === 'running';
  const baseUrl = `/api/lessons/${original.id}/studio`;
  const cacheKey = `xuanjia-courseware:${original.id}:${info?.ownerId || 'viewer'}`;
  const change = useCallback((next: StudioLesson) => {
    setHistory((h) => historyChange(h, next));
    setError('');
  }, []);
  const report = (e: unknown) => setError(e instanceof Error ? e.message : '操作未完成');
  const navigate = useCallback((id: string) => {
    setActiveId(id);
    setSelected(null);
    setRail(false);
    setVersion(null);
  }, []);
  const editPage = (fn: (p: LessonArtifact) => LessonArtifact) =>
    change(updatePage(draft, page.id, fn));
  const element = page && nativeOf(page).elements.find((e) => e.id === selected);
  const preview = useMemo(() => {
    if (!currentRun || !runBase) return null;
    try {
      return currentRun.proposals.reduce(
        (doc, p) => applyProposal(doc, p, currentRun.scope),
        runBase,
      );
    } catch {
      return null;
    }
  }, [currentRun, runBase]);
  const proposed =
    currentRun?.proposals.some((p) => p.pageId === page?.id) && !accepted.includes(page?.id);
  const activePreview =
    version?.artifacts.find((p) => p.id === page?.id) ||
    (proposed && !showOriginal ? preview?.artifacts.find((p) => p.id === page?.id) : undefined);
  const shown = dragged || activePreview || page;
  const filtered = pages.filter((p) =>
    `${p.title} ${studioOf(p)?.page.takeaway || ''}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    audience.current = params.get('audience') === '1';
    session.current = params.get('session') || nanoid(24);
    if (audience.current) {
      setPresentation(true);
      setAccessChecked(true);
      return;
    }
    let live = true;
    request<StudioInfo & { runs: AgentRun[] }>(baseUrl)
      .then((data) => {
        if (!live) return;
        setInfo(data);
        setRuns(data.runs);
        setMode('edit');
        const active = data.runs.find((r) => r.status === 'running');
        if (active) {
          void selectRun(active);
          setPanel('agent');
        }
      })
      .catch((e) => {
        if (e.status !== 404 && e.status !== 403) report(e);
      })
      .finally(() => {
        if (live) setAccessChecked(true);
      });
    return () => {
      live = false;
    };
  }, [baseUrl]);
  useEffect(() => {
    parentEvent(original.id, 'ready');
  }, [original.id]);
  useEffect(() => {
    const viewport = canvasScroll.current;
    if (!viewport) return;
    const fit = () => {
      const css = getComputedStyle(viewport);
      const width =
        viewport.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const height =
        viewport.clientHeight -
        parseFloat(css.paddingTop) -
        parseFloat(css.paddingBottom) -
        (mode === 'read' && studioOf(page) ? 120 : 0);
      setFitWidth(Math.max(180, Math.min(width, (height * 16) / 9)));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    fit();
    return () => observer.disconnect();
  }, [mode, presentation, page?.id]);
  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement && !audience.current) setPresentation(false);
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  useEffect(() => {
    if (!info) return;
    try {
      const old = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (old?.lesson?.id === original.id && documentKey(old.lesson) !== documentKey(saved))
        setRecovery(old.lesson);
    } catch {}
  }, [info?.ownerId, cacheKey]);
  useEffect(() => {
    if (!info || recovery) return;
    const timer = setTimeout(() => {
      try {
        if (dirty) localStorage.setItem(cacheKey, JSON.stringify({ lesson: draft }));
        else localStorage.removeItem(cacheKey);
      } catch {
        setMessage('浏览器存储空间不足，请及时保存课件。');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, dirty, cacheKey, info, recovery]);
  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);
  useEffect(() => {
    if (!currentRun || currentRun.status !== 'running') return;
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await request<{ run: AgentRun }>(`${baseUrl}/agent/${currentRun.id}`);
        if (live) setRuns((rs) => rs.map((r) => (r.id === data.run.id ? data.run : r)));
      } catch {
        if (live) setMessage('连接暂时中断，正在重连；课件草稿仍保留。');
      }
      if (live) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 700);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [currentRun?.id, currentRun?.status, baseUrl]);
  useEffect(() => {
    const hash = location.hash.match(/page=([^&]+)/);
    if (hash && pages.some((p) => p.id === decodeURIComponent(hash[1])))
      setActiveId(decodeURIComponent(hash[1]));
  }, []);
  useEffect(() => {
    if (page)
      window.history.replaceState(
        null,
        '',
        `${location.pathname}${location.search}#page=${encodeURIComponent(page.id)}`,
      );
  }, [page?.id]);
  useEffect(() => {
    if (!speaker) return;
    const clock = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(clock);
  }, [speaker]);
  useEffect(() => {
    if (!session.current) return;
    const bus = new BroadcastChannel(`courseware:${original.id}:${session.current}`);
    channel.current = bus;
    bus.onmessage = (e) => {
      if (audience.current && e.data?.type === 'page' && typeof e.data.id === 'string') {
        setActiveId(e.data.id);
        setAudienceStep(Number.isInteger(e.data.step) ? e.data.step : -1);
      }
      if (!audience.current && e.data?.type === 'ready')
        bus.postMessage({
          type: 'page',
          id: displayRef.current,
          step: playbackRef.current.id === displayRef.current ? playbackRef.current.step : -1,
        });
    };
    if (audience.current) bus.postMessage({ type: 'ready' });
    return () => {
      bus.close();
      channel.current = null;
    };
  }, [accessChecked, original.id]);
  useEffect(() => {
    if (!audience.current)
      channel.current?.postMessage({
        type: 'page',
        id: activeId,
        step: playbackRef.current.id === activeId ? playbackRef.current.step : -1,
      });
  }, [activeId]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = target?.closest('input,textarea,select,[contenteditable="true"]');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && editable) {
        event.preventDefault();
        target?.blur();
        setTimeout(() => void save(draftRef.current), 0);
        return;
      }
      if (typing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && editable) {
        event.preventDefault();
        setHistory((h) => historyMove(h, event.shiftKey ? 'redo' : 'undo'));
        setSelected(null);
        return;
      }
      if (event.key === 'Escape') {
        setSelected(null);
        setPanel(null);
        setOverview(false);
        setHelp(false);
        setPresentation(false);
        setVersion(null);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        if ((mode === 'read' || presentation) && consumeCoursewareNavigation('next', shell.current))
          return;
        navigate(pages[Math.min(index + 1, pages.length - 1)].id);
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        if (
          (mode === 'read' || presentation) &&
          consumeCoursewareNavigation('previous', shell.current)
        )
          return;
        navigate(pages[Math.max(index - 1, 0)].id);
      }
      if (event.key === 'Home') navigate(pages[0].id);
      if (event.key === 'End') navigate(pages.at(-1)!.id);
      if (event.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => {
    if (overview || help) modal.current?.showModal();
    else modal.current?.close();
  }, [overview, help]);

  async function save(next = draft, instructionText = '课件工作室：手动编辑') {
    if (!editable || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await request<{ lesson: StudioLesson }>(baseUrl, {
        method: 'PUT',
        ...json({ lesson: next, instruction: instructionText }),
      });
      setSaved(result.lesson);
      setHistory((h) => ({
        ...h,
        present: { ...h.present, __aiseceduRevision: result.lesson.__aiseceduRevision },
        past: h.past.map((p) => ({ ...p, __aiseceduRevision: result.lesson.__aiseceduRevision })),
        future: h.future.map((p) => ({
          ...p,
          __aiseceduRevision: result.lesson.__aiseceduRevision,
        })),
      }));
      const data = await request<StudioInfo>(baseUrl);
      setInfo(data);
      setMessage(`已保存为版本 ${result.lesson.__aiseceduRevision}，可继续编辑或审核发布。`);
      parentEvent(original.id, 'saved');
    } catch (e) {
      report(e);
    } finally {
      setSaving(false);
    }
  }
  async function startAgent() {
    if (!instruction.trim() || starting) return;
    setStarting(true);
    setError('');
    setAccepted([]);
    setShowOriginal(false);
    setVersion(null);
    try {
      const base = structuredClone(draft);
      const result = await request<{ run: AgentRun }>(`${baseUrl}/agent`, {
        method: 'POST',
        ...json({
          lesson: base,
          instruction,
          scope: {
            pageIds: scope === 'deck' ? pages.map((p) => p.id) : [page.id],
            ...(scope === 'element' && selected ? { elementId: selected } : {}),
          },
          requestId: nanoid(24),
        }),
      });
      setRuns((rs) => [result.run, ...rs.filter((r) => r.id !== result.run.id)]);
      setRunId(result.run.id);
      setRunBase(base);
      setInstruction('');
      try {
        localStorage.setItem(`${cacheKey}:run:${result.run.id}`, JSON.stringify(base));
      } catch {}
    } catch (e) {
      report(e);
    } finally {
      setStarting(false);
    }
  }
  async function selectRun(run: AgentRun) {
    setRunId(run.id);
    setAccepted([]);
    setShowOriginal(false);
    try {
      const result = await request<{ run: AgentRun; base: StudioLesson }>(
        `${baseUrl}/agent/${run.id}?base=1`,
      );
      setRunBase(result.base);
      if (result.base.__aiseceduRevision !== saved.__aiseceduRevision)
        setMessage('这是历史调整，请逐页比较。已被修改的页面会受到冲突保护。');
    } catch (e) {
      setRunBase(null);
      report(e);
    }
  }
  function accept(all: boolean) {
    if (!currentRun || !runBase) return;
    try {
      let next = draft;
      const chosen = currentRun.proposals.filter(
        (p) => !accepted.includes(p.pageId) && (all || p.pageId === page.id),
      );
      for (const proposal of chosen) {
        const base = runBase.artifacts.find((p) => p.id === proposal.pageId),
          current = next.artifacts.find((p) => p.id === proposal.pageId);
        if (JSON.stringify(base) !== JSON.stringify(current))
          throw new Error('此页在调整期间有新的修改，请保留手动修改并重新发起 Agent 调整。');
        next = applyProposal(next, proposal, currentRun.scope);
      }
      change(next);
      setAccepted((ids) => [...ids, ...chosen.map((p) => p.pageId)]);
      setMessage(`已采用 ${chosen.length} 页建议。保存后形成新版本。`);
    } catch (e) {
      report(e);
    }
  }
  function movePage(from: number, to: number) {
    if (to < 0 || to >= pages.length || from === to) return;
    const next = [...pages];
    next.splice(to, 0, next.splice(from, 1)[0]);
    change({ ...draft, artifacts: next.map((p, i) => ({ ...p, order: i })) });
  }
  function duplicate() {
    const copy = structuredClone(page);
    copy.id = 'page_' + nanoid(24);
    copy.title = page.title + '（副本）';
    const data = studioOf(copy);
    if (data) data.page.id = copy.id;
    const next = [...pages];
    next.splice(index + 1, 0, copy);
    change({ ...draft, artifacts: next.map((p, i) => ({ ...p, order: i })) });
    navigate(copy.id);
  }
  function remove() {
    if (pages.length <= 1) return;
    change({
      ...draft,
      artifacts: pages.filter((p) => p.id !== page.id).map((p, i) => ({ ...p, order: i })),
    });
    navigate(pages[index === 0 ? 1 : index - 1].id);
    setMessage('页面已移除，可以撤销。');
  }
  function insertElement(kind: 'text' | 'shape') {
    const id = 'element_' + nanoid(24);
    const shared = { id, type: kind, left: 180, top: 180, width: 300, height: 90, rotate: 0 };
    const item =
      kind === 'text'
        ? {
            ...shared,
            content: textHtml('在这里输入文字'),
            defaultFontName: 'Microsoft YaHei',
            defaultFontSize: 28,
            defaultColor: '#18243b',
            lineHeight: 1.2,
          }
        : {
            ...shared,
            fill: '#dbeafe',
            viewBox: [100, 100],
            path: 'M0 0H100V100H0Z',
            fixedRatio: false,
          };
    editPage((p) => ({
      ...p,
      content: {
        ...contentOf(p),
        ...nativeOf(p),
        elements: [...nativeOf(p).elements, item],
      } as unknown as LessonArtifact['content'],
    }));
    setSelected(id);
    setPanel('edit');
  }
  function textFormat(property: string, value: string) {
    if (!element || element.type !== 'text') return;
    const expression = new RegExp(`${property}\\s*:\\s*[^;"']+`, 'gi');
    let html = element.content;
    html = expression.test(html)
      ? html.replace(expression, `${property}:${value}`)
      : html.replace('<p', `<p style="${property}:${value}"`);
    editPage((p) => setNativeElement(p, element.id, { content: html }));
  }
  function pointerStart(event: PointerEvent<HTMLButtonElement>, item: PPTElement, resize = false) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(item.id);
    const box = event.currentTarget.parentElement!.getBoundingClientRect();
    dragRef.current = {
      id: item.id,
      x: event.clientX,
      y: event.clientY,
      page,
      scale: box.width / 1000,
      resize,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const e = nativeOf(drag.page).elements.find((e) => e.id === drag.id)!;
    const dx = (event.clientX - drag.x) / drag.scale,
      dy = (event.clientY - drag.y) / drag.scale;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    setDragged(
      setNativeElement(
        drag.page,
        drag.id,
        drag.resize
          ? {
              width: Math.max(12, Math.round(e.width + dx)),
              height: Math.max(12, Math.round(('height' in e ? Number(e.height) : 30) + dy)),
            }
          : {
              left: Math.round(e.left + dx),
              top: Math.round(e.top + dy),
            },
      ),
    );
  }
  function pointerEnd() {
    if (dragged) change(updatePage(draft, page.id, () => dragged));
    setDragged(null);
    dragRef.current = null;
  }
  function present() {
    setPresentation(true);
    setPanel(null);
    setRail(false);
    void shell.current?.requestFullscreen?.().catch(() => {});
  }
  function openSpeaker() {
    if (dirty) {
      setError('请先保存课件，再打开演讲者视图，确保观众看到同一版本。');
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('audience', '1');
    url.searchParams.set('session', session.current);
    setAudienceUrl(url.href);
    const opened = window.open(url, '_blank');
    if (!opened) {
      setMessage('演讲者视图已打开。点击“观众窗口”可单独显示课件。');
    }
    setSpeaker(true);
    setElapsed(0);
    setNotes(true);
    setPanel(null);
    setMode('read');
  }
  async function loadVersion(revision: number) {
    try {
      const data = await request<StudioInfo>(`${baseUrl}?revision=${revision}`);
      setVersion(data.lesson);
      setMessage(`正在查看版本 ${revision}；当前草稿未改动。`);
    } catch (e) {
      report(e);
    }
  }
  function restore() {
    if (!version) return;
    change({ ...version, __aiseceduRevision: saved.__aiseceduRevision });
    setVersion(null);
    setMessage('历史内容已恢复到草稿。保存会追加新版本，原版本仍保留。');
  }
  function download() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draft.title}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!page)
    return <section className={styles.empty}>课件还没有页面，请返回 AI 共创生成内容。</section>;
  return (
    <main
      ref={shell}
      className={`${styles.studio} ${presentation ? styles.presenting : ''} ${audience.current ? styles.audience : ''}`}
      data-courseware-studio="true"
      data-aisecedu-preview-state="ready"
    >
      <header className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            aria-label="页面导航"
            onClick={() => {
              if (window.innerWidth > 850) setRailCollapsed((v) => !v);
              else setRail((v) => !v);
            }}
          >
            <Menu size={18} />
          </button>
          <div className={styles.documentLabel}>
            <strong>课件工作室</strong>
            <span>
              {editable
                ? `版本 ${saved.__aiseceduRevision} · ${dirty ? '未保存' : '已保存'}`
                : `${pages.length} 页 · 阅读模式`}
            </span>
          </div>
          {editable && (
            <div className={styles.modeSwitch}>
              <button aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
                编辑
              </button>
              <button
                aria-pressed={mode === 'read'}
                onClick={() => {
                  setMode('read');
                  setSelected(null);
                }}
              >
                阅读
              </button>
            </div>
          )}
        </div>
        <div className={styles.toolbarGroup}>
          {editable && (
            <>
              <button
                aria-label="撤销"
                title="撤销 ⌘/Ctrl Z"
                disabled={!history.past.length}
                onClick={() => {
                  setHistory((h) => historyMove(h, 'undo'));
                  setSelected(null);
                }}
              >
                <Undo2 size={17} />
              </button>
              <button
                aria-label="重做"
                title="重做 ⌘/Ctrl Shift Z"
                disabled={!history.future.length}
                onClick={() => {
                  setHistory((h) => historyMove(h, 'redo'));
                  setSelected(null);
                }}
              >
                <Redo2 size={17} />
              </button>
              <span className={styles.separator} />
              <button
                aria-label="版本"
                aria-pressed={panel === 'history'}
                onClick={() => {
                  setPanel(panel === 'history' ? null : 'history');
                  setVersion(null);
                }}
              >
                <History size={16} />
                <span className={styles.optional}>版本</span>
              </button>
              <button
                aria-pressed={panel === 'agent'}
                onClick={() => setPanel(panel === 'agent' ? null : 'agent')}
              >
                <Sparkles size={16} />
                Agent
              </button>
              <button aria-label="保存" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
                <span className={styles.optional}>保存</span>
              </button>
            </>
          )}
          <button className={styles.primary} onClick={present}>
            <Play size={15} />
            演示
          </button>
        </div>
      </header>
      {(error || message) && (
        <div className={error ? styles.error : styles.notice} role={error ? 'alert' : 'status'}>
          {error || message}
          <button
            aria-label="关闭提示"
            onClick={() => {
              setError('');
              setMessage('');
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {recovery && (
        <div className={styles.recovery}>
          发现此浏览器未保存的草稿。
          <button
            onClick={() => {
              change(recovery);
              setRecovery(null);
              setMessage(
                recovery.__aiseceduRevision !== saved.__aiseceduRevision
                  ? '草稿版本与服务器不同，保存前请检查最新版本。'
                  : '已恢复未保存草稿。',
              );
            }}
          >
            恢复草稿
          </button>
          <button
            onClick={() => {
              setRecovery(null);
              localStorage.removeItem(cacheKey);
            }}
          >
            使用服务器版本
          </button>
        </div>
      )}
      <div className={styles.workspace}>
        <aside
          className={`${styles.rail} ${rail ? styles.railOpen : ''} ${railCollapsed ? styles.railCollapsed : ''}`}
          aria-label="课件页面"
        >
          <div className={styles.railTop}>
            <label>
              <Search size={15} />
              <input
                aria-label="搜索页面"
                value={search}
                placeholder="搜索页面"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button aria-label="页面总览" onClick={() => setOverview(true)}>
              <Grid2X2 size={17} />
            </button>
          </div>
          <div className={styles.thumbnails}>
            {filtered.map((p) => (
              <button
                key={p.id}
                className={styles.thumbnail}
                aria-current={p.id === page.id ? 'page' : undefined}
                aria-label={`第 ${pages.indexOf(p) + 1} 页 ${p.title}`}
                onClick={() => navigate(p.id)}
                draggable={editable && mode === 'edit'}
                onDragStart={(e) => e.dataTransfer.setData('text/x-courseware-page', p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = pages.findIndex(
                    (p) => p.id === e.dataTransfer.getData('text/x-courseware-page'),
                  );
                  if (from >= 0) movePage(from, pages.indexOf(p));
                }}
              >
                <span className={styles.thumbnailVisual}>
                  <StaticSlide page={p} thumbnail />
                </span>
                <span className={styles.thumbnailCaption}>
                  <b>{String(pages.indexOf(p) + 1).padStart(2, '0')}</b>
                  <span>{p.title}</span>
                  {currentRun?.proposals.some((x) => x.pageId === p.id) &&
                    !accepted.includes(p.id) && <i title="有调整建议" />}
                </span>
              </button>
            ))}
            {!filtered.length && <p className={styles.empty}>没有匹配的页面</p>}
          </div>
          {editable && (
            <div className={styles.pageActions}>
              <button
                aria-label="页面上移"
                disabled={index === 0}
                onClick={() => movePage(index, index - 1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                aria-label="页面下移"
                disabled={index === pages.length - 1}
                onClick={() => movePage(index, index + 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button aria-label="复制页面" onClick={duplicate}>
                <Copy size={15} />
              </button>
              <button aria-label="删除页面" disabled={pages.length === 1} onClick={remove}>
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </aside>
        <section className={styles.center} aria-label="课件画布">
          <div className={styles.canvasBar}>
            <div>
              <span className={styles.pagePill}>
                {index + 1} / {pages.length}
              </span>
              <strong>{page.title}</strong>
            </div>
            <div>
              {editable && mode === 'edit' && (
                <button
                  aria-pressed={panel === 'edit'}
                  onClick={() => setPanel(panel === 'edit' ? null : 'edit')}
                >
                  <MousePointer2 size={14} />
                  编辑内容
                </button>
              )}
              <button aria-label="快捷键" onClick={() => setHelp(true)}>
                ?
              </button>
            </div>
          </div>
          {(proposed || version) && (
            <div className={styles.compareBar}>
              <span>
                {version ? `版本 ${version.__aiseceduRevision} · 历史预览` : 'Agent 修改建议'}
              </span>
              {version ? (
                <>
                  <button onClick={() => setVersion(null)}>返回当前草稿</button>
                  <button onClick={restore}>恢复到草稿</button>
                </>
              ) : (
                <>
                  <div className={styles.modeSwitch}>
                    <button aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>
                      原稿
                    </button>
                    <button aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>
                      修改后
                    </button>
                  </div>
                  <button disabled={busy} onClick={() => accept(false)}>
                    <Check size={14} />
                    采用本页
                  </button>
                </>
              )}
            </div>
          )}
          <div
            ref={canvasScroll}
            className={styles.canvasScroll}
            onClick={() => {
              if (selected) setSelected(null);
            }}
          >
            <div className={styles.canvasWrap} style={{ width: `${fitWidth * zoom}px` }}>
              <div className={styles.paper}>
                {(mode === 'read' || presentation) && studioOf(shown) ? (
                  <CoursewareSlidePreview
                    key={shown.id}
                    data={studioOf(shown)!}
                    nativeCanvas={nativeOf(shown)}
                    playbackStep={audience.current ? audienceStep : undefined}
                    onStepChange={audience.current ? undefined : broadcastStep}
                  />
                ) : (
                  <StaticSlide page={shown} />
                )}
                {editable && mode === 'edit' && !activePreview && !presentation && (
                  <div className={styles.selectionLayer}>
                    {nativeOf(shown).elements.map((e) => (
                      <button
                        key={e.id}
                        aria-label={`选择对象 ${e.type === 'text' && 'content' in e ? plainText(String(e.content)).slice(0, 45) : e.id}`}
                        className={selected === e.id ? styles.selectedElement : ''}
                        style={{
                          left: `${e.left / 10}%`,
                          top: `${e.top / 5.625}%`,
                          width: `${e.width / 10}%`,
                          height: `${('height' in e ? Number(e.height) : 30) / 5.625}%`,
                          transform: `rotate(${('rotate' in e ? e.rotate : 0) || 0}deg)`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(e.id);
                          setPanel('edit');
                        }}
                        onPointerDown={(event) => pointerStart(event, e)}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerEnd}
                        onPointerCancel={() => {
                          dragRef.current = null;
                          setDragged(null);
                        }}
                      />
                    ))}
                    {selected &&
                      (() => {
                        const item = nativeOf(shown).elements.find((e) => e.id === selected);
                        return item && 'height' in item ? (
                          <button
                            className={styles.resizeHandle}
                            aria-label="缩放选中对象"
                            style={{
                              left: `${(item.left + item.width) / 10}%`,
                              top: `${(item.top + Number(item.height)) / 5.625}%`,
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => pointerStart(e, item, true)}
                            onPointerMove={pointerMove}
                            onPointerUp={pointerEnd}
                            onKeyDown={(event) => {
                              const step = event.shiftKey ? 10 : 1;
                              if (
                                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
                                  event.key,
                                )
                              ) {
                                event.preventDefault();
                                event.stopPropagation();
                                editPage((p) =>
                                  setNativeElement(p, item.id, {
                                    width: Math.max(
                                      12,
                                      item.width +
                                        (event.key === 'ArrowRight'
                                          ? step
                                          : event.key === 'ArrowLeft'
                                            ? -step
                                            : 0),
                                    ),
                                    height: Math.max(
                                      12,
                                      Number(item.height) +
                                        (event.key === 'ArrowDown'
                                          ? step
                                          : event.key === 'ArrowUp'
                                            ? -step
                                            : 0),
                                    ),
                                  }),
                                );
                              }
                            }}
                          />
                        ) : null;
                      })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          {speaker && (
            <div className={styles.speakerStrip}>
              <div>
                <strong>演讲者视图</strong>
                <span>
                  {Math.floor(elapsed / 60)
                    .toString()
                    .padStart(2, '0')}
                  :{(elapsed % 60).toString().padStart(2, '0')}
                </span>
                <button onClick={() => setElapsed(0)}>计时归零</button>
                <a href={audienceUrl} target="_blank" rel="noopener noreferrer">
                  观众窗口
                </a>
                <button onClick={() => setSpeaker(false)}>结束</button>
              </div>
              {pages[index + 1] && (
                <div className={styles.nextSlide}>
                  <StaticSlide page={pages[index + 1]} thumbnail />
                  <span>下一页：{pages[index + 1].title}</span>
                </div>
              )}
            </div>
          )}
          {notes && !audience.current && (
            <section className={styles.notes} aria-label="讲稿">
              {editable ? (
                <Field
                  key={page.id}
                  label="教师讲稿（学生不可见）"
                  value={notesOf(page)}
                  multiline
                  onChange={(text) =>
                    editPage((p) => {
                      const data = studioOf(p);
                      return data
                        ? updateStudio(p, { ...data, page: { ...data.page, speakerNotes: text } })
                        : {
                            ...p,
                            content: {
                              ...contentOf(p),
                              speakerNotes: text,
                            } as unknown as LessonArtifact['content'],
                          };
                    })
                  }
                />
              ) : (
                <p>{notesOf(page) || '本页没有讲稿'}</p>
              )}
            </section>
          )}
          <footer className={styles.statusbar}>
            <div>
              <button
                disabled={index === 0}
                aria-label="上一页"
                onClick={() => navigate(pages[index - 1].id)}
              >
                <ChevronLeft size={16} />
              </button>
              <label className={styles.pageJump}>
                <input
                  aria-label="跳转页码"
                  type="number"
                  min={1}
                  max={pages.length}
                  value={index + 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= pages.length) navigate(pages[n - 1].id);
                  }}
                />
                <span>/ {pages.length}</span>
              </label>
              <button
                disabled={index === pages.length - 1}
                aria-label="下一页"
                onClick={() => navigate(pages[index + 1].id)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div>
              {editable && (
                <button aria-label="讲稿" aria-pressed={notes} onClick={() => setNotes((v) => !v)}>
                  <FileText size={14} />
                  <span className={styles.optional}>讲稿</span>
                </button>
              )}
              <button
                aria-label="缩小"
                disabled={zoom <= 0.5}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
              >
                <Minus size={15} />
              </button>
              <button onClick={() => setZoom(1)}>
                {zoom === 1 ? '适应' : Math.round(zoom * 100) + '%'}
              </button>
              <button
                aria-label="放大"
                disabled={zoom >= 2}
                onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
              >
                <Plus size={15} />
              </button>
              {presentation && (
                <button
                  onClick={() => {
                    setPresentation(false);
                    if (document.fullscreenElement) void document.exitFullscreen();
                  }}
                >
                  退出演示
                </button>
              )}
            </div>
          </footer>
        </section>
        {panel && editable && (
          <aside className={styles.inspector} aria-label="课件编辑面板">
            <div className={styles.panelHeader}>
              <div className={styles.panelTabs}>
                <button aria-pressed={panel === 'edit'} onClick={() => setPanel('edit')}>
                  编辑
                </button>
                <button aria-pressed={panel === 'agent'} onClick={() => setPanel('agent')}>
                  <Sparkles size={14} />
                  Agent
                </button>
                <button aria-pressed={panel === 'history'} onClick={() => setPanel('history')}>
                  版本
                </button>
                <button aria-pressed={panel === 'sources'} onClick={() => setPanel('sources')}>
                  资料
                </button>
              </div>
              <button aria-label="关闭编辑面板" onClick={() => setPanel(null)}>
                <PanelRightClose size={17} />
              </button>
            </div>
            {panel === 'edit' && (
              <div className={styles.panelBody}>
                <div className={styles.sectionTitle}>
                  <h2>{element ? '选中对象' : '页面内容'}</h2>
                  {element && <button onClick={() => setSelected(null)}>取消选择</button>}
                </div>
                {element ? (
                  <>
                    <p className={styles.muted}>
                      {element.type === 'text'
                        ? '文本'
                        : element.type === 'shape'
                          ? '形状'
                          : '画布对象'}{' '}
                      · 拖动画布中的对象可以移动位置
                    </p>
                    {'content' in element && typeof element.content === 'string' && (
                      <Field
                        label="文字内容"
                        multiline
                        value={plainText(element.content)}
                        onChange={(text) =>
                          editPage((p) =>
                            setNativeElement(p, element.id, { content: textHtml(text) }),
                          )
                        }
                      />
                    )}
                    <div className={styles.numberGrid}>
                      <NumberField
                        label="水平位置"
                        value={element.left}
                        onChange={(left) =>
                          editPage((p) => setNativeElement(p, element.id, { left }))
                        }
                      />
                      <NumberField
                        label="垂直位置"
                        value={element.top}
                        onChange={(top) =>
                          editPage((p) => setNativeElement(p, element.id, { top }))
                        }
                      />
                      <NumberField
                        label="宽度"
                        value={element.width}
                        onChange={(width) =>
                          editPage((p) =>
                            setNativeElement(p, element.id, { width: Math.max(1, width) }),
                          )
                        }
                      />
                      {'height' in element && (
                        <NumberField
                          label="高度"
                          value={Number(element.height)}
                          onChange={(height) =>
                            editPage((p) =>
                              setNativeElement(p, element.id, { height: Math.max(1, height) }),
                            )
                          }
                        />
                      )}
                    </div>
                    <NumberField
                      label="旋转角度"
                      value={('rotate' in element ? element.rotate : 0) || 0}
                      onChange={(rotate) =>
                        editPage((p) => setNativeElement(p, element.id, { rotate }))
                      }
                    />
                    {element.type === 'text' && (
                      <>
                        <div className={styles.formatButtons}>
                          <button onClick={() => textFormat('font-weight', '700')}>
                            <b>加粗</b>
                          </button>
                          <button onClick={() => textFormat('font-weight', '400')}>常规</button>
                          <button onClick={() => textFormat('text-align', 'left')}>居左</button>
                          <button onClick={() => textFormat('text-align', 'center')}>居中</button>
                          <button onClick={() => textFormat('text-align', 'right')}>居右</button>
                        </div>
                        <NumberField
                          label="字号"
                          value={Number(
                            (element as unknown as Record<string, unknown>).defaultFontSize || 24,
                          )}
                          onChange={(defaultFontSize) =>
                            editPage((p) =>
                              setNativeElement(p, element.id, {
                                defaultFontSize: Math.max(8, Math.min(160, defaultFontSize)),
                              }),
                            )
                          }
                        />
                        <label className={styles.colorField}>
                          <span>文字颜色</span>
                          <input
                            type="color"
                            value={String(
                              (element as unknown as Record<string, unknown>).defaultColor ||
                                '#18243b',
                            )}
                            onChange={(e) =>
                              editPage((p) =>
                                setNativeElement(p, element.id, { defaultColor: e.target.value }),
                              )
                            }
                          />
                        </label>
                      </>
                    )}
                    <div className={styles.formatButtons}>
                      <button
                        onClick={() =>
                          editPage((p) =>
                            setNativeElement(p, element.id, { left: (1000 - element.width) / 2 }),
                          )
                        }
                      >
                        水平居中
                      </button>
                      <button
                        onClick={() =>
                          editPage((p) => {
                            const native = nativeOf(p);
                            return {
                              ...p,
                              content: {
                                ...contentOf(p),
                                ...native,
                                elements: native.elements.filter((e) => e.id !== element.id),
                              } as unknown as LessonArtifact['content'],
                            };
                          })
                        }
                      >
                        <Trash2 size={14} />
                        删除对象
                      </button>
                    </div>
                    <button
                      className={styles.fullButton}
                      onClick={() => {
                        setScope('element');
                        setPanel('agent');
                      }}
                    >
                      <Sparkles size={16} />让 Agent 调整这个对象
                    </button>
                  </>
                ) : (
                  <>
                    <Field
                      key={page.id + 'title'}
                      label="页面标题"
                      value={studioOf(page)?.page.title || page.title}
                      maxLength={studioOf(page) ? 40 : 240}
                      onChange={(text) =>
                        editPage((p) => {
                          const data = studioOf(p);
                          return data
                            ? updateStudio(p, { ...data, page: { ...data.page, title: text } })
                            : { ...p, title: text };
                        })
                      }
                    />
                    {studioOf(page) && (
                      <>
                        <Field
                          label="核心结论"
                          value={studioOf(page)!.page.takeaway}
                          multiline
                          maxLength={100}
                          onChange={(text) =>
                            editPage((p) => {
                              const data = studioOf(p)!;
                              return updateStudio(p, {
                                ...data,
                                page: { ...data.page, takeaway: text },
                              });
                            })
                          }
                        />
                        {studioOf(page)!.page.supporting.map((value, i) => (
                          <Field
                            key={i}
                            label={`说明 ${i + 1}`}
                            value={value}
                            maxLength={55}
                            onChange={(text) =>
                              editPage((p) => {
                                const data = studioOf(p)!;
                                return updateStudio(p, {
                                  ...data,
                                  page: {
                                    ...data.page,
                                    supporting: data.page.supporting.map((s, j) =>
                                      i === j ? text : s,
                                    ),
                                  },
                                });
                              })
                            }
                          />
                        ))}
                        <label className={styles.colorField}>
                          <span>本页强调色</span>
                          <input
                            type="color"
                            value={studioOf(page)!.theme.accent}
                            onChange={(e) =>
                              editPage((p) => {
                                const data = studioOf(p)!;
                                return updateStudio(p, {
                                  ...data,
                                  theme: { ...data.theme, accent: e.target.value },
                                });
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                    <div className={styles.formatButtons}>
                      <button onClick={() => insertElement('text')}>
                        <Plus size={14} />
                        插入文字
                      </button>
                      <button onClick={() => insertElement('shape')}>
                        <Plus size={14} />
                        插入矩形
                      </button>
                    </div>
                    <div className={styles.sectionTitle}>
                      <h3>画布对象</h3>
                      <span>{nativeOf(page).elements.length}</span>
                    </div>
                    <div className={styles.objectList}>
                      {nativeOf(page).elements.map((e, i) => (
                        <button key={e.id} onClick={() => setSelected(e.id)}>
                          <span>{e.type === 'text' ? 'T' : '◇'}</span>
                          <span>
                            {e.type === 'text' && 'content' in e
                              ? plainText(String(e.content)).slice(0, 45)
                              : `对象 ${i + 1} · ${e.type}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {panel === 'agent' && (
              <>
                <div className={styles.agentFeed} aria-label="Agent 调整记录">
                  {!currentRun && (
                    <div className={styles.agentIntro}>
                      <span className={styles.agentIcon}>
                        <Sparkles size={22} />
                      </span>
                      <h2>在这份课件上继续创作</h2>
                      <p>说出要改哪里、如何改。先看建议，再决定采用。</p>
                      <button
                        onClick={() =>
                          setInstruction(
                            '精简当前页的文字，保留核心结论和知识点，维持现有图示与动画。',
                          )
                        }
                      >
                        精简文字，保留知识点
                      </button>
                      <button
                        onClick={() =>
                          setInstruction(
                            '优化当前页排版，保持文字内容不变，加强标题与图示的层次和对齐。',
                          )
                        }
                      >
                        优化排版，保持内容
                      </button>
                    </div>
                  )}
                  {currentRun && (
                    <>
                      <div className={styles.userMessage}>{currentRun.instruction}</div>
                      <div className={styles.runLabel}>
                        <Sparkles size={15} />
                        <strong>
                          {busy
                            ? '正在调整'
                            : currentRun.status === 'ready'
                              ? '调整建议'
                              : currentRun.status === 'cancelled'
                                ? '已停止'
                                : '需要重试'}
                        </strong>
                        <span>
                          {currentRun.processed}/{currentRun.total} 页
                        </span>
                      </div>
                      <div className={styles.agentMessages} aria-live="polite">
                        {currentRun.messages.map((text, i) => (
                          <p key={i}>{text}</p>
                        ))}
                      </div>
                      {currentRun.error && <p className={styles.runError}>{currentRun.error}</p>}
                      {currentRun.proposals.map((proposal) => (
                        <button
                          key={proposal.pageId}
                          className={styles.proposal}
                          data-selected={page.id === proposal.pageId}
                          onClick={() => navigate(proposal.pageId)}
                        >
                          <span>
                            {accepted.includes(proposal.pageId) ? (
                              <Check size={15} />
                            ) : (
                              <FileText size={15} />
                            )}
                            第 {pages.findIndex((p) => p.id === proposal.pageId) + 1} 页
                            {accepted.includes(proposal.pageId) && ' · 已采用'}
                          </span>
                          <strong>{pages.find((p) => p.id === proposal.pageId)?.title}</strong>
                          <p>{proposal.summary}</p>
                          <small>{proposal.changes.length} 处修改 · 点击比较</small>
                        </button>
                      ))}
                      {currentRun.proposals.length > 0 && !busy && (
                        <div className={styles.proposalActions}>
                          <button
                            className={styles.primary}
                            disabled={currentRun.proposals.every((p) =>
                              accepted.includes(p.pageId),
                            )}
                            onClick={() => accept(true)}
                          >
                            <Check size={15} />
                            采用全部建议
                          </button>
                          <button
                            onClick={() => {
                              setRunId(null);
                              setRunBase(null);
                              setMessage('已关闭建议，当前草稿保留。历史调整仍可查看。');
                            }}
                          >
                            放弃未采用建议
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {runs.length > 0 && (
                    <details className={styles.previousRuns}>
                      <summary>历史调整 · {runs.length}</summary>
                      {runs.map((r) => (
                        <button key={r.id} onClick={() => selectRun(r)}>
                          <span>{r.instruction}</span>
                          <small>
                            {new Date(r.createdAt).toLocaleString('zh-CN', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </small>
                        </button>
                      ))}
                    </details>
                  )}
                </div>
                <div className={styles.composer}>
                  <label className={styles.scope}>
                    <span>修改范围</span>
                    <select
                      aria-label="Agent 修改范围"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as typeof scope)}
                    >
                      <option value="page">当前页 · 第 {index + 1} 页</option>
                      <option value="deck">整套课件 · {pages.length} 页</option>
                      <option value="element" disabled={!selected}>
                        选中对象{selected ? ' · ' + selected : ''}
                      </option>
                    </select>
                  </label>
                  <textarea
                    aria-label="课件调整要求"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="例如：保留文字，将图示对齐并放大…"
                    rows={4}
                    maxLength={6000}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void startAgent();
                      }
                    }}
                  />
                  <div>
                    <span>⌘ / Ctrl Enter 发送</span>
                    {busy ? (
                      <button
                        onClick={async () => {
                          try {
                            const data = await request<{ run: AgentRun }>(
                              `${baseUrl}/agent/${currentRun!.id}`,
                              { method: 'DELETE' },
                            );
                            setRuns((rs) => rs.map((r) => (r.id === data.run.id ? data.run : r)));
                          } catch (e) {
                            report(e);
                          }
                        }}
                        disabled={starting}
                      >
                        <Square size={14} />
                        停止
                      </button>
                    ) : (
                      <button
                        className={styles.primary}
                        aria-label="发送调整要求"
                        disabled={!instruction.trim() || (scope === 'element' && !selected)}
                        onClick={() => void startAgent()}
                      >
                        <Send size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            {panel === 'history' && (
              <div className={styles.panelBody}>
                <div className={styles.sectionTitle}>
                  <h2>版本记录</h2>
                  <span>当前 {saved.__aiseceduRevision}</span>
                </div>
                <p className={styles.muted}>
                  点击版本在画布中查看。恢复后保存为新版本，原记录保留。
                </p>
                {info?.revisions.map((r) => (
                  <button
                    key={r.revision}
                    className={styles.versionItem}
                    aria-pressed={version?.__aiseceduRevision === r.revision}
                    onClick={() => void loadVersion(r.revision)}
                  >
                    <span className={styles.versionDot} />
                    <div>
                      <strong>
                        版本 {r.revision}
                        {r.revision === saved.__aiseceduRevision ? ' · 当前' : ''}
                      </strong>
                      <p>{r.instruction || '初始生成'}</p>
                      <small>{new Date(r.created).toLocaleString('zh-CN')}</small>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {panel === 'sources' && (
              <div className={styles.panelBody}>
                <h2>资料与交付</h2>
                <Field
                  label="课件名称"
                  value={draft.title}
                  maxLength={240}
                  onChange={(title) => change({ ...draft, title })}
                />
                <p className={styles.muted}>课件的引用信息沿用生成时登记的资料。</p>
                {info?.sourceRefs.length ? (
                  <div className={styles.sources}>
                    {info.sourceRefs.map((s, i) => (
                      <pre key={i}>{typeof s === 'string' ? s : JSON.stringify(s, null, 2)}</pre>
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>
                    本课件没有登记资料引用。请在 AI 共创中补充来源后再审核使用。
                  </p>
                )}
                <button className={styles.fullButton} onClick={openSpeaker}>
                  <Play size={16} />
                  打开演讲者视图
                </button>
                <button className={styles.fullButton} onClick={() => window.print()}>
                  <FileText size={16} />
                  打印 / 保存 PDF
                </button>
                <button className={styles.fullButton} onClick={download}>
                  <Download size={16} />
                  下载课件源文件
                </button>
                {info?.canPublish && (
                  <>
                    <hr />
                    <p className={styles.muted}>
                      保存后提交现有审核发布流程。只有完成审核的版本会进入课程。
                    </p>
                    <button
                      className={`${styles.fullButton} ${styles.primary}`}
                      disabled={dirty || saving}
                      onClick={() => parentEvent(original.id, 'publish')}
                    >
                      审核并发布到课程
                    </button>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
      <dialog
        ref={modal}
        className={styles.dialog}
        onCancel={() => {
          setOverview(false);
          setHelp(false);
        }}
        aria-label={help ? '课件快捷键' : '页面总览'}
      >
        <header>
          <h2>{help ? '快捷键' : '全部页面'}</h2>
          <button
            aria-label="关闭弹窗"
            onClick={() => {
              setOverview(false);
              setHelp(false);
            }}
          >
            <X size={18} />
          </button>
        </header>
        {help ? (
          <dl className={styles.shortcuts}>
            <dt>上一页 / 下一页</dt>
            <dd>← → / Page Up、Page Down</dd>
            <dt>首尾页</dt>
            <dd>Home / End</dd>
            <dt>保存课件</dt>
            <dd>⌘ / Ctrl + S</dd>
            <dt>撤销 / 重做</dt>
            <dd>⌘ / Ctrl + Z / Shift + Z</dd>
            <dt>关闭面板 / 退出演示</dt>
            <dd>Esc</dd>
          </dl>
        ) : (
          <div className={styles.overviewGrid}>
            {pages.map((p, i) => (
              <button
                key={p.id}
                onClick={() => {
                  navigate(p.id);
                  setOverview(false);
                }}
              >
                <StaticSlide page={p} thumbnail />
                <span>
                  {i + 1}. {p.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </dialog>
      <div ref={printRef} className={styles.printOnly} aria-hidden="true" inert>
        {pages.map((p, i) => (
          <section key={p.id}>
            <StaticSlide page={p} />
            <footer>
              {i + 1} / {pages.length}
            </footer>
          </section>
        ))}
      </div>
    </main>
  );
}
