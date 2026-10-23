'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { SlideCanvas } from '@openmaic/renderer';
import type { Slide, PPTElement, SlideBackground } from '@openmaic/dsl';
import type { CoursewareSlideData } from '@/lib/courseware/schema';
import { compileCoursewareSlide, evaluateCoursewareCheck } from '@/lib/courseware/compiler';
import {
  initialCoursewarePlayback,
  reduceCoursewarePlayback,
  coursewareStepState,
  type CoursewarePlaybackAction,
} from '@/lib/courseware/playback';
import styles from './courseware-slide-preview.module.css';
import { CoursewareChart } from './courseware-chart';
import { applyCoursewareCanvasEdits } from '@/lib/courseware/edits';

type NativeCanvas = { elements: PPTElement[]; background?: SlideBackground };

export function CoursewareCanvas({
  data,
  step = -1,
  onInspect,
  nativeCanvas,
  thumbnail = false,
}: {
  data: CoursewareSlideData;
  step?: number;
  onInspect?: (id: string) => void;
  nativeCanvas?: NativeCanvas;
  thumbnail?: boolean;
}) {
  const compiled = useMemo(
    () => applyCoursewareCanvasEdits(data, compileCoursewareSlide(data, step), nativeCanvas),
    [data, step, nativeCanvas],
  );
  const slide = useMemo<Slide>(
    () => ({
      id: data.page.id,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: {
        backgroundColor: data.theme.background,
        themeColors: [data.theme.accent, data.theme.secondary],
        fontColor: data.theme.foreground,
        fontName: 'Noto Sans SC',
      },
      elements: compiled.elements.filter((element) => element.type !== 'chart'),
      background: compiled.background,
    }),
    [compiled, data],
  );
  return (
    <div
      className={styles.canvas}
      data-courseware-canvas={thumbnail ? undefined : true}
      data-courseware-thumbnail={thumbnail ? true : undefined}
      data-courseware-step={step}
      style={{ background: data.theme.background }}
    >
      <SlideCanvas
        slide={slide}
        chrome={false}
        canvasPercentage={100}
        elementIdPrefix={
          thumbnail ? `courseware-thumbnail-${data.page.id}-` : 'courseware-element-'
        }
      />
      {compiled.elements.map((element) =>
        element.type === 'chart' ? (
          <CoursewareChart
            key={element.id}
            element={element}
            focusIndexes={data.page.beats[step]?.chartFocusIndexes}
          />
        ) : null,
      )}
      {onInspect &&
        compiled.hotspots.map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            className={styles.hotspot}
            aria-label={`查看${hotspot.label}的解释`}
            data-courseware-node={hotspot.id}
            onClick={() => onInspect(hotspot.id)}
            style={{
              left: `${hotspot.left / 10}%`,
              top: `${hotspot.top / 5.625}%`,
              width: `${hotspot.width / 10}%`,
              height: `${hotspot.height / 5.625}%`,
            }}
          />
        ))}
    </div>
  );
}

export function CoursewareSlidePreview({
  data,
  nativeCanvas,
  playbackStep,
  onStepChange,
}: {
  data: CoursewareSlideData;
  nativeCanvas?: NativeCanvas;
  playbackStep?: number;
  onStepChange?: (step: number) => void;
}) {
  const [state, setState] = useState(initialCoursewarePlayback);
  const [printing, setPrinting] = useState(false);
  const player = useRef<HTMLElement>(null);
  const dispatch = (action: CoursewarePlaybackAction) =>
    setState((previous) => reduceCoursewarePlayback(data.page, previous, action));
  const { page, theme } = data;
  useEffect(() => {
    if (playbackStep !== undefined)
      setState((previous) =>
        reduceCoursewarePlayback(page, previous, { type: 'seek', step: playbackStep }),
      );
  }, [page, playbackStep]);
  useEffect(() => {
    onStepChange?.(state.step);
  }, [onStepChange, state.step]);
  const hotspots = useMemo(
    () => compileCoursewareSlide(data, state.step).hotspots,
    [data, state.step],
  );
  const overlappingHotspots = hotspots.some((a, index) =>
    hotspots
      .slice(index + 1)
      .some(
        (b) =>
          Math.min(a.left + a.width, b.left + b.width) > Math.max(a.left, b.left) + 2 &&
          Math.min(a.top + a.height, b.top + b.height) > Math.max(a.top, b.top) + 2,
      ),
  );
  useEffect(() => {
    const element = player.current;
    const navigate = (event: Event) => {
      const direction = (event as CustomEvent).detail?.direction;
      if (
        (direction === 'next' && state.step < page.beats.length - 1) ||
        (direction === 'previous' && state.step >= 0)
      ) {
        event.preventDefault();
        setState((previous) => reduceCoursewarePlayback(page, previous, { type: direction }));
      }
    };
    element?.addEventListener('courseware:navigate', navigate);
    return () => element?.removeEventListener('courseware:navigate', navigate);
  }, [page, state.step]);
  useEffect(() => {
    const media = window.matchMedia('print');
    const sync = () => setPrinting(media.matches);
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    sync();
    media.addEventListener('change', sync);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const beat = page.beats[state.step];
  const node =
    page.visual.kind === 'diagram'
      ? page.visual.nodes.find((node) => node.id === state.selectedNode)
      : page.visual.kind === 'scene'
        ? page.visual.objects.find((object) => object.id === state.selectedNode)
        : null;
  const result = state.selectedOption ? evaluateCoursewareCheck(page, state.selectedOption) : null;
  return (
    <section
      ref={player}
      className={styles.player}
      data-courseware-player
      style={
        {
          '--cw-accent': theme.accent,
          '--cw-bg': theme.background,
          '--cw-text': theme.foreground,
          '--cw-muted': theme.muted,
          '--cw-surface': theme.surface,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('button,input,textarea,select,a')
        )
          return;
        if (
          ['ArrowRight', 'PageDown', ' '].includes(event.key) &&
          state.step < page.beats.length - 1
        ) {
          event.preventDefault();
          event.stopPropagation();
          dispatch({ type: 'next' });
        }
        if (['ArrowLeft', 'PageUp'].includes(event.key) && state.step >= 0) {
          event.preventDefault();
          event.stopPropagation();
          dispatch({ type: 'previous' });
        }
      }}
      tabIndex={0}
      aria-label={`${page.title}互动课件`}
    >
      <CoursewareCanvas
        data={data}
        nativeCanvas={nativeCanvas}
        step={printing ? page.beats.length - 1 : state.step}
        onInspect={(id) => dispatch({ type: 'inspect', nodeId: id })}
      />
      {page.beats.length > 0 && (
        <div className={styles.timeline} aria-label="页内讲解步骤">
          <button
            type="button"
            disabled={state.step < 0}
            onClick={() => dispatch({ type: 'previous' })}
          >
            上一步
          </button>
          <ol>
            {page.beats.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={index === state.step ? 'step' : undefined}
                  data-step-state={coursewareStepState(index, state.step)}
                  onClick={() => dispatch({ type: 'seek', step: index })}
                >
                  {index + 1}. {item.title}
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={state.step >= page.beats.length - 1}
            onClick={() => dispatch({ type: 'next' })}
          >
            下一步
          </button>
          <button type="button" onClick={() => dispatch({ type: 'reset' })}>
            重置
          </button>
        </div>
      )}
      {overlappingHotspots && (
        <details className={styles.objects} data-courseware-object-list>
          <summary>查看叠放对象的解释</summary>
          <div>
            {hotspots.map((hotspot) => (
              <button
                key={hotspot.id}
                type="button"
                data-courseware-object-option={hotspot.id}
                onClick={() => dispatch({ type: 'inspect', nodeId: hotspot.id })}
              >
                {hotspot.label}
              </button>
            ))}
          </div>
        </details>
      )}
      {(beat || node) && (
        <div className={styles.explanation} aria-live="polite">
          {node ? (
            <>
              <strong>{node.label}</strong>
              <p>{node.detail}</p>
              <button type="button" onClick={() => dispatch({ type: 'inspect', nodeId: null })}>
                关闭解释
              </button>
            </>
          ) : (
            <>
              <strong>{beat?.title}</strong>
              <p>{beat?.explanation}</p>
            </>
          )}
        </div>
      )}
      {page.check && (
        <fieldset className={styles.check}>
          <legend>{page.check.question}</legend>
          <div className={styles.options}>
            {page.check.options.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={option.id === state.selectedOption}
                data-courseware-option={option.id}
                onClick={() => dispatch({ type: 'answer', optionId: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {result && (
            <div className={styles.feedback} role="status" data-correct={result.correct}>
              <strong>{result.correct ? '判断正确' : '再观察一下'}</strong>
              <p>{result.feedback}</p>
              <button type="button" onClick={() => dispatch({ type: 'answer', optionId: null })}>
                重新作答
              </button>
            </div>
          )}
        </fieldset>
      )}
      <details className={styles.sources}>
        <summary>数据与素材说明</summary>
        {page.visual.kind === 'chart' && (
          <p>
            {page.visual.basis}
            {page.visual.illustrative ? '（教学示例，并非实测数据）' : ''}
          </p>
        )}
        {page.visual.kind === 'equation' && <p>{page.visual.example}</p>}
        {page.visual.kind === 'image' && <p>{page.visual.caption}</p>}
        {page.visual.kind === 'code' && <p>{page.visual.explanation}</p>}
        {data.assets
          .filter((asset) => page.visual.kind === 'image' && asset.id === page.visual.assetId)
          .map((asset) => (
            <p key={asset.id}>
              {asset.alt} · {asset.source}
            </p>
          ))}
        {page.evidence.map((item, index) => (
          <p key={index}>
            {item.claim} · {item.sourceId}
          </p>
        ))}
      </details>
    </section>
  );
}
