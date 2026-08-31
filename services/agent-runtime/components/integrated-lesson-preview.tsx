'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid2X2,
  HelpCircle,
  Maximize2,
  Menu,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import type { PPTElement, Slide, SlideBackground, SlideTheme } from '@openmaic/dsl';
import { SlideCanvas } from '@openmaic/renderer';
import type { LessonArtifact } from '@/lib/types/lesson';
import { patchHtmlForIframe } from '@/lib/utils/iframe';
import styles from './integrated-lesson-preview.module.css';

type IntegratedLessonPreviewProps = {
  artifacts: LessonArtifact[];
  title?: string;
};

const PREVIEW_SLIDE_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#dc2626'],
  fontColor: '#1f2937',
  fontName: 'Microsoft YaHei',
};

const ARTIFACT_TYPE_LABELS: Partial<Record<LessonArtifact['type'], string>> = {
  slide: '课件页',
  quiz: '随堂自检',
  diagram: '示意图',
  simulation: '交互演示',
  code: '代码演练',
  'procedural-skill': '流程演练',
  game: '互动练习',
  visualization3d: '三维演示',
  'vulnerable-lab': '攻防演示',
  debate: '课堂辩论',
};

function artifactTypeLabel(type: LessonArtifact['type']): string {
  return ARTIFACT_TYPE_LABELS[type] || '教学内容';
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return Boolean(
    element.isContentEditable ||
    element.closest(
      'input, textarea, select, button, a, [role="button"], [contenteditable="true"]',
    ),
  );
}

export function IntegratedLessonPreview({
  artifacts,
  title = '教学内容预览',
}: IntegratedLessonPreviewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenControlsVisible, setFullscreenControlsVisible] = useState(true);
  const stageRef = useRef<HTMLElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const jumpDigitsRef = useRef('');
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndex = Math.min(selectedIndex, Math.max(artifacts.length - 1, 0));
  const activeArtifact = artifacts[activeIndex];
  const hasMultiple = artifacts.length > 1;
  const activeSpeakerNotes = activeArtifact ? speakerNotesForArtifact(activeArtifact) : '';
  const showSpeakerNotes = Boolean(activeSpeakerNotes && notesExpanded);
  const progress = artifacts.length ? ((activeIndex + 1) / artifacts.length) * 100 : 0;

  const goTo = useCallback(
    (index: number) => {
      if (!artifacts.length) return;
      setSelectedIndex(Math.max(0, Math.min(artifacts.length - 1, index)));
    },
    [artifacts.length],
  );

  const goPrevious = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  const showFullscreenControls = useCallback(() => {
    setFullscreenControlsVisible(true);
    if (fullscreenTimerRef.current) clearTimeout(fullscreenTimerRef.current);
    if (isFullscreen) {
      fullscreenTimerRef.current = setTimeout(() => setFullscreenControlsVisible(false), 2400);
    }
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await stageRef.current?.requestFullscreen();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const requestedPage = Number(params.get('page'));
    if (Number.isInteger(requestedPage) && requestedPage > 0) goTo(requestedPage - 1);
  }, [goTo]);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    hash.set('page', String(activeIndex + 1));
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#${hash}`,
    );
    activeThumbRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setIsFullscreen(active);
      setFullscreenControlsVisible(true);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      if (event.key === 'Escape') {
        if (overviewOpen) setOverviewOpen(false);
        else if (helpOpen) setHelpOpen(false);
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        jumpDigitsRef.current = `${jumpDigitsRef.current}${event.key}`.slice(-3);
        if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
        jumpTimerRef.current = setTimeout(() => {
          jumpDigitsRef.current = '';
        }, 1600);
        return;
      }
      if (event.key === 'Enter' && jumpDigitsRef.current) {
        event.preventDefault();
        goTo(Number(jumpDigitsRef.current) - 1);
        jumpDigitsRef.current = '';
        return;
      }
      const key = event.key.toLowerCase();
      if (['arrowleft', 'pageup'].includes(key)) {
        event.preventDefault();
        goPrevious();
      } else if (['arrowright', 'pagedown', ' '].includes(key)) {
        event.preventDefault();
        goNext();
      } else if (key === 'home') {
        event.preventDefault();
        goTo(0);
      } else if (key === 'end') {
        event.preventDefault();
        goTo(artifacts.length - 1);
      } else if (key === 'f') {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === 'o') {
        event.preventDefault();
        setOverviewOpen((value) => !value);
      } else if (key === 'n' && activeSpeakerNotes) {
        event.preventDefault();
        setNotesExpanded((value) => !value);
      } else if (key === '?') {
        event.preventDefault();
        setHelpOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeSpeakerNotes,
    artifacts.length,
    goNext,
    goPrevious,
    goTo,
    helpOpen,
    overviewOpen,
    toggleFullscreen,
  ]);

  useEffect(
    () => () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      if (fullscreenTimerRef.current) clearTimeout(fullscreenTimerRef.current);
    },
    [],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (isTypingTarget(event.target)) return;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) < 64 || Math.abs(horizontal) <= Math.abs(vertical) * 1.25) return;
    if (horizontal < 0) goNext();
    else goPrevious();
  }

  return (
    <main
      data-aisecedu-preview-state="ready"
      data-aisecedu-preview-surface="reader"
      data-notes-open={showSpeakerNotes ? 'true' : 'false'}
      className={`${styles.shell} ${showSpeakerNotes ? styles.withNotes : ''}`}
    >
      <header className={styles.toolbar} aria-label="预览工具栏">
        <button
          type="button"
          className={styles.iconButton}
          aria-label={railOpen ? '收起内容导航' : '展开内容导航'}
          aria-expanded={railOpen}
          aria-controls="aisecedu-preview-outline"
          onClick={() => setRailOpen((value) => !value)}
        >
          <Menu size={18} aria-hidden="true" />
        </button>
        <div className={styles.titleBlock}>
          <small>{title}</small>
          <strong>{activeArtifact?.title || '暂无内容'}</strong>
        </div>
        <nav className={styles.transport} aria-label="演示场景切换">
          <button
            type="button"
            className={styles.iconButton}
            aria-label="上一个场景"
            title="上一页（←）"
            disabled={activeIndex === 0}
            onClick={goPrevious}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => setOverviewOpen(true)}
            aria-label={`第 ${activeIndex + 1} 页，共 ${artifacts.length} 页；打开全部页面`}
          >
            <strong>{activeIndex + 1}</strong>
            <span>/ {artifacts.length || 0}</span>
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="下一个场景"
            title="下一页（→）"
            disabled={!artifacts.length || activeIndex === artifacts.length - 1}
            onClick={goNext}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </nav>
        <div className={styles.toolbarActions}>
          {activeSpeakerNotes ? (
            <button
              type="button"
              className={`${styles.textButton} ${notesExpanded ? styles.isActive : ''}`}
              aria-expanded={notesExpanded}
              aria-controls="aisecedu-speaker-notes"
              title="显示或收起本页讲稿（N）"
              onClick={() => setNotesExpanded((value) => !value)}
            >
              <FileText size={16} aria-hidden="true" />
              <span>讲稿</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconButton}
            title="全部页面（O）"
            aria-label="打开全部页面"
            onClick={() => setOverviewOpen(true)}
          >
            <Grid2X2 size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            title="快捷键（?）"
            aria-label="查看预览快捷键"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.textButton}
            title="进入全屏（F）"
            aria-label="全屏预览"
            onClick={() => void toggleFullscreen()}
          >
            <Maximize2 size={16} aria-hidden="true" />
            <span>全屏</span>
          </button>
        </div>
      </header>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={`${styles.readerBody} ${railOpen ? styles.readerBodyWithRail : ''}`}>
        <aside
          id="aisecedu-preview-outline"
          className={`${styles.rail} ${railOpen ? styles.railOpen : ''}`}
          aria-label="内容导航"
          aria-hidden={!railOpen}
        >
          <div className={styles.railHeader}>
            <span>内容导航</span>
            <small>{artifacts.length} 页</small>
          </div>
          <ol className={styles.thumbnailList}>
            {artifacts.map((artifact, index) => (
              <li key={artifact.id}>
                <button
                  ref={index === activeIndex ? activeThumbRef : undefined}
                  type="button"
                  className={`${styles.thumbnailButton} ${index === activeIndex ? styles.thumbnailActive : ''}`}
                  aria-label={`打开场景 ${index + 1}：${artifact.title}`}
                  aria-current={index === activeIndex ? 'step' : undefined}
                  onClick={() => goTo(index)}
                >
                  <PreviewThumbnail artifact={artifact} index={index} />
                  <span className={styles.thumbnailMeta}>
                    <small>
                      {String(index + 1).padStart(2, '0')} · {artifactTypeLabel(artifact.type)}
                    </small>
                    <strong>{artifact.title}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
        <section
          ref={stageRef}
          className={styles.stage}
          data-preview-fullscreen={isFullscreen ? 'true' : 'false'}
          data-controls-visible={fullscreenControlsVisible ? 'true' : 'false'}
          aria-label={
            activeArtifact
              ? `正在查看第 ${activeIndex + 1} 页：${activeArtifact.title}`
              : '预览区域'
          }
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onMouseMove={showFullscreenControls}
          onFocusCapture={showFullscreenControls}
        >
          <p className={styles.srOnly} aria-live="polite">
            第 {activeIndex + 1} 页，共 {artifacts.length} 页：{activeArtifact?.title}
          </p>
          {hasMultiple ? (
            <>
              <button
                type="button"
                className={`${styles.stageArrow} ${styles.stageArrowPrevious}`}
                aria-label="上一个场景"
                title="上一页"
                disabled={activeIndex === 0}
                onClick={goPrevious}
              >
                <ChevronLeft size={28} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${styles.stageArrow} ${styles.stageArrowNext}`}
                aria-label="下一个场景"
                title="下一页"
                disabled={activeIndex === artifacts.length - 1}
                onClick={goNext}
              >
                <ChevronRight size={28} aria-hidden="true" />
              </button>
            </>
          ) : null}
          <div className={styles.zoomViewport}>
            <div
              className={styles.zoomPlane}
              style={
                { '--preview-zoom': zoom, '--preview-zoom-inverse': 1 / zoom } as CSSProperties
              }
            >
              <div className={styles.zoomContent}>
                {activeArtifact ? (
                  <IntegratedArtifactContent key={activeArtifact.id} artifact={activeArtifact} />
                ) : (
                  <div role="status" className={styles.emptyState}>
                    当前版本没有可预览的演示内容
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className={styles.stageControls} aria-label="画面控制">
            <button
              type="button"
              aria-label="缩小画面"
              disabled={zoom <= 1}
              onClick={() => setZoom((value) => Math.max(1, Number((value - 0.1).toFixed(1))))}
            >
              <Minus size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.zoomValue}
              onClick={() => setZoom(1)}
              title="适应窗口"
            >
              {zoom === 1 ? '适应' : `${Math.round(zoom * 100)}%`}
            </button>
            <button
              type="button"
              aria-label="放大画面"
              disabled={zoom >= 1.5}
              onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(1))))}
            >
              <Plus size={15} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.stageCaption}>
            <span>{String(activeIndex + 1).padStart(2, '0')}</span>
            <strong>{activeArtifact?.title || '暂无内容'}</strong>
            <small>{artifactTypeLabel(activeArtifact?.type || 'slide')}</small>
          </div>
          {isFullscreen ? (
            <div className={styles.fullscreenTransport}>
              <button
                type="button"
                aria-label="上一个场景"
                disabled={activeIndex === 0}
                onClick={goPrevious}
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span>
                {activeIndex + 1} / {artifacts.length}
              </span>
              <button
                type="button"
                aria-label="下一个场景"
                disabled={activeIndex === artifacts.length - 1}
                onClick={goNext}
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              <button type="button" aria-label="退出全屏" onClick={() => void toggleFullscreen()}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {overviewOpen ? (
            <div
              className={styles.overlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="preview-overview-title"
            >
              <div className={styles.overlayPanel}>
                <header>
                  <div>
                    <small>快速跳转</small>
                    <h2 id="preview-overview-title">全部页面</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭全部页面"
                    onClick={() => setOverviewOpen(false)}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </header>
                <div className={styles.overviewGrid}>
                  {artifacts.map((artifact, index) => (
                    <button
                      key={artifact.id}
                      type="button"
                      className={index === activeIndex ? styles.overviewActive : ''}
                      aria-current={index === activeIndex ? 'step' : undefined}
                      onClick={() => {
                        goTo(index);
                        setOverviewOpen(false);
                      }}
                    >
                      <PreviewThumbnail artifact={artifact} index={index} />
                      <span>
                        <small>
                          {String(index + 1).padStart(2, '0')} · {artifactTypeLabel(artifact.type)}
                        </small>
                        <strong>{artifact.title}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {helpOpen ? (
            <div
              className={styles.overlay}
              role="dialog"
              aria-modal="true"
              aria-labelledby="preview-help-title"
            >
              <div className={`${styles.overlayPanel} ${styles.helpPanel}`}>
                <header>
                  <div>
                    <small>高效浏览</small>
                    <h2 id="preview-help-title">预览快捷键</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭快捷键说明"
                    onClick={() => setHelpOpen(false)}
                  >
                    <X size={19} aria-hidden="true" />
                  </button>
                </header>
                <dl className={styles.shortcutList}>
                  <div>
                    <dt>
                      <kbd>←</kbd>
                      <kbd>→</kbd>
                    </dt>
                    <dd>上一页 / 下一页</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Home</kbd>
                      <kbd>End</kbd>
                    </dt>
                    <dd>第一页 / 最后一页</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>数字</kbd>
                      <kbd>Enter</kbd>
                    </dt>
                    <dd>跳转到指定页</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>O</kbd>
                    </dt>
                    <dd>打开全部页面</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>N</kbd>
                    </dt>
                    <dd>显示或收起讲稿</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>F</kbd>
                    </dt>
                    <dd>进入或退出全屏</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </section>
      </div>
      {showSpeakerNotes ? (
        <aside
          id="aisecedu-speaker-notes"
          data-aisecedu-speaker-notes="visible"
          aria-label={`第 ${activeIndex + 1} 页讲稿`}
          aria-live="polite"
          className={styles.notesPanel}
        >
          <div className={styles.notesHeader}>
            <span>
              <FileText size={16} aria-hidden="true" />
              <strong>本页讲稿</strong>
            </span>
            <span>
              {activeIndex + 1} / {artifacts.length} · {activeArtifact?.title}
            </span>
            <button type="button" aria-label="收起本页讲稿" onClick={() => setNotesExpanded(false)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div data-aisecedu-speaker-notes-text className={styles.notesText}>
            {activeSpeakerNotes}
          </div>
        </aside>
      ) : null}
    </main>
  );
}

function PreviewThumbnail({ artifact, index }: { artifact: LessonArtifact; index: number }) {
  const content = artifact.content as unknown as Record<string, unknown>;
  if (artifact.type === 'slide' && Array.isArray(content.elements)) {
    return (
      <span className={styles.thumbnailVisual}>
        <LessonSlidePreview
          previewId={`${artifact.id}-${index}`}
          elements={content.elements}
          background={content.background}
          fill
          thumbnail
        />
      </span>
    );
  }
  return (
    <span className={`${styles.thumbnailVisual} ${styles.thumbnailPlaceholder}`}>
      <span>{String(index + 1).padStart(2, '0')}</span>
      <strong>{artifactTypeLabel(artifact.type)}</strong>
    </span>
  );
}

export function speakerNotesForArtifact(artifact: LessonArtifact): string {
  if (artifact.type !== 'slide') return '';
  const content = artifact.content as unknown as Record<string, unknown>;
  const notes = content.speakerNotes || content.remark;
  return typeof notes === 'string' ? notes.trim() : '';
}

function IntegratedArtifactContent({ artifact }: { artifact: LessonArtifact }) {
  const content = artifact.content as unknown as Record<string, unknown>;
  if (artifact.type === 'quiz' && Array.isArray(content.questions)) {
    return (
      <QuizSelfCheckPreview
        artifactId={artifact.id}
        title={artifact.title}
        questions={content.questions}
      />
    );
  }
  if (typeof content.html === 'string') {
    return (
      <iframe
        srcDoc={patchHtmlForIframe(content.html)}
        title={artifact.title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        allowFullScreen
        className={styles.interactiveFrame}
      />
    );
  }
  if (Array.isArray(content.elements)) {
    return (
      <div className={styles.slideStage}>
        <LessonSlidePreview
          previewId={artifact.id}
          elements={content.elements}
          background={content.background}
          fill
        />
      </div>
    );
  }
  if (Array.isArray(content.questions)) {
    return (
      <QuizSelfCheckPreview
        artifactId={artifact.id}
        title={artifact.title}
        questions={content.questions}
      />
    );
  }
  return (
    <div role="status" className={styles.emptyState}>
      该内容暂不支持预览
    </div>
  );
}

type SelfCheckOption = {
  value: string;
  label: string;
};

export type SelfCheckQuestion = {
  key: string;
  prompt: string;
  options: SelfCheckOption[];
  answers: string[];
  feedback: string;
};

export type SelfCheckEvaluation = {
  correct: boolean | null;
  referenceAnswer: string;
  feedback: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).trim()
    : '';
}

function textList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined || value === null
      ? []
      : [value];
  return values.map(text).filter(Boolean);
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizedOptions(value: unknown): SelfCheckOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      return [{ value: String.fromCharCode(65 + index), label: text(entry) }];
    }
    const item = record(entry);
    if (!item) return [];
    const label = text(item.label ?? item.text ?? item.content ?? item.value);
    const optionValue = text(item.value ?? item.id ?? item.key) || String.fromCharCode(65 + index);
    return label ? [{ value: optionValue, label }] : [];
  });
}

/** Normalize the permissive model/API quiz payload before it reaches the learner UI. */
export function normalizeSelfCheckQuestion(raw: unknown, index: number): SelfCheckQuestion {
  const source = record(raw) ?? {};
  const directAnswers = textList(source.answer);
  const answers =
    directAnswers.length > 0
      ? directAnswers
      : textList(source.correctAnswer ?? source.correct_answer);
  return {
    key: `${text(source.id) || 'self-check'}-${index + 1}`,
    prompt: text(source.question ?? source.prompt ?? source.title) || `自检题 ${index + 1}`,
    options: normalizedOptions(source.options),
    answers,
    feedback:
      text(
        source.analysis ??
          source.feedback ??
          source.explanation ??
          source.comment ??
          source.rationale,
      ) || '请回看本题涉及的知识点，再结合自己的选择复盘原因。',
  };
}

/**
 * Grade only objective options locally. Open responses remain self-reflective:
 * the learner receives the source answer and explanation without a deceptive
 * exact-string judgment.
 */
export function evaluateSelfCheckAnswer(
  question: SelfCheckQuestion,
  response: string,
): SelfCheckEvaluation {
  const selected = question.options.find((option) => option.value === response);
  const responseForms = [normalize(response), normalize(selected?.label || '')].filter(Boolean);
  const answerForms = question.answers.map(normalize).filter(Boolean);
  const correct =
    question.options.length > 0 && answerForms.length > 0
      ? answerForms.some((answer) => responseForms.includes(answer))
      : null;
  const referenceAnswer = question.answers
    .map((answer) => question.options.find((option) => option.value === answer)?.label || answer)
    .filter(Boolean)
    .join('、');
  return { correct, referenceAnswer, feedback: question.feedback };
}

function QuizSelfCheckPreview({
  artifactId,
  title,
  questions,
}: {
  artifactId: string;
  title: string;
  questions: unknown[];
}) {
  const normalizedQuestions = useMemo(() => questions.map(normalizeSelfCheckQuestion), [questions]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const evaluations = submitted
    ? normalizedQuestions.map((question) =>
        evaluateSelfCheckAnswer(question, answers[question.key] || ''),
      )
    : [];
  const gradable = evaluations.filter((evaluation) => evaluation.correct !== null);
  const correctCount = gradable.filter((evaluation) => evaluation.correct).length;
  const hasResponse = normalizedQuestions.some((question) =>
    Boolean(answers[question.key]?.trim()),
  );

  return (
    <section
      data-aisecedu-quiz-self-check="ready"
      data-artifact-id={artifactId}
      aria-label={`${title} 自检题`}
      style={{
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
        padding: '24px max(20px, calc((100% - 760px) / 2)) 40px',
        color: 'var(--foreground)',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 13 }}>个人自主练习</p>
        <h1 style={{ margin: '4px 0 8px', fontSize: 24 }}>{title}</h1>
        <p style={{ margin: 0, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
          先独立作答；提交后会显示参考答案与即时解释，帮助你完成自检和下一步复盘。
        </p>
      </header>

      <ol style={{ display: 'grid', gap: 16, margin: 0, padding: 0, listStyle: 'none' }}>
        {normalizedQuestions.map((question, index) => {
          const evaluation = evaluations[index];
          return (
            <li
              key={question.key}
              style={{
                padding: 18,
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--card)',
              }}
            >
              <fieldset style={{ display: 'grid', gap: 10, margin: 0, padding: 0, border: 0 }}>
                <legend style={{ padding: 0, fontSize: 16, fontWeight: 650, lineHeight: 1.6 }}>
                  {index + 1}. {question.prompt}
                </legend>
                {question.options.length ? (
                  <div
                    role="radiogroup"
                    aria-label={`第 ${index + 1} 题选项`}
                    style={{ display: 'grid', gap: 8 }}
                  >
                    {question.options.map((option) => (
                      <label
                        key={option.value}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 9,
                          padding: '9px 11px',
                          border: `1px solid ${answers[question.key] === option.value ? 'var(--foreground)' : 'var(--border)'}`,
                          borderRadius: 8,
                          cursor: submitted ? 'default' : 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name={`${artifactId}-${question.key}`}
                          value={option.value}
                          checked={answers[question.key] === option.value}
                          disabled={submitted}
                          onChange={() =>
                            setAnswers((current) => ({ ...current, [question.key]: option.value }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    aria-label={`第 ${index + 1} 题回答`}
                    value={answers[question.key] || ''}
                    disabled={submitted}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [question.key]: event.target.value }))
                    }
                    placeholder="写下你的判断与理由…"
                    style={{
                      minHeight: 86,
                      padding: 10,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--foreground)',
                      background: 'var(--background)',
                      font: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                )}
              </fieldset>
              {submitted && evaluation ? (
                <div
                  data-aisecedu-self-check-feedback={
                    evaluation.correct === true
                      ? 'correct'
                      : evaluation.correct === false
                        ? 'incorrect'
                        : 'reflect'
                  }
                  role="status"
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 8,
                    background:
                      evaluation.correct === true
                        ? 'color-mix(in srgb, #16a34a 14%, var(--card))'
                        : evaluation.correct === false
                          ? 'color-mix(in srgb, #d97706 14%, var(--card))'
                          : 'color-mix(in srgb, #2563eb 12%, var(--card))',
                    lineHeight: 1.65,
                  }}
                >
                  <strong>
                    {evaluation.correct === true
                      ? '回答正确'
                      : evaluation.correct === false
                        ? '请对照参考答案复盘'
                        : '已记录你的思考'}
                  </strong>
                  {evaluation.referenceAnswer ? (
                    <div>参考答案：{evaluation.referenceAnswer}</div>
                  ) : null}
                  <div>即时反馈：{evaluation.feedback}</div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <footer
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 20 }}
      >
        {!submitted ? (
          <button
            type="button"
            disabled={!hasResponse}
            onClick={() => setSubmitted(true)}
            style={{
              ...previewControlButton,
              width: 'auto',
              height: 38,
              padding: '0 16px',
              fontSize: 14,
            }}
          >
            提交并查看反馈
          </button>
        ) : (
          <>
            <span
              data-aisecedu-self-check-summary
              aria-live="polite"
              style={{ color: 'var(--muted-foreground)', fontSize: 14 }}
            >
              {gradable.length
                ? `本次客观自检：${correctCount} / ${gradable.length} 题正确`
                : '已完成本次自检，请结合参考答案复盘。'}
            </span>
            <button
              type="button"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
              }}
              style={{
                ...previewControlButton,
                width: 'auto',
                height: 38,
                padding: '0 16px',
                fontSize: 14,
              }}
            >
              重新作答
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

export function LessonSlidePreview({
  previewId = 'default',
  elements,
  background,
  fill = false,
  thumbnail = false,
}: {
  previewId?: string;
  elements: unknown;
  background?: unknown;
  fill?: boolean;
  thumbnail?: boolean;
}) {
  const slide = useMemo<Slide>(
    () => ({
      id: `aisecedu-lesson-preview-${previewId}`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: PREVIEW_SLIDE_THEME,
      elements: (Array.isArray(elements) ? elements : []) as PPTElement[],
      background: background as SlideBackground | undefined,
    }),
    [background, elements, previewId],
  );

  return (
    <div
      data-aisecedu-slide-preview={thumbnail ? 'thumbnail' : fill ? 'fill' : 'inline'}
      style={
        fill
          ? {
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
            }
          : {
              width: 'min(100%, 760px)',
              aspectRatio: '16 / 9',
              marginTop: 6,
            }
      }
    >
      <SlideCanvas
        slide={slide}
        canvasPercentage={100}
        chrome={!thumbnail}
        elementIdPrefix={`slide-element-${previewId}-`}
      />
    </div>
  );
}

const previewControlButton: CSSProperties = {
  display: 'inline-grid',
  width: 30,
  height: 30,
  padding: 0,
  border: '1px solid var(--border)',
  borderRadius: 7,
  placeItems: 'center',
  color: 'var(--foreground)',
  background: 'var(--background)',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
};
