'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStageStore } from '@/lib/store';

type Evidence = { id: string; type: string; payload: Record<string, unknown> };

export function IntegratedClassroomTracker({ classroomId, active }: { classroomId: string; active: boolean }) {
  const sceneId = useStageStore((state) => state.currentSceneId);
  const pending = useRef(new Map<string, Evidence>());
  const sending = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      for (const [key, event] of pending.current) {
        const response = await fetch('/api/integration/aisecedu/events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...event, classroomId }), cache: 'no-store',
        });
        if (!response.ok) throw new Error('Evidence sync failed');
        const body = await response.json();
        if (!body.success) throw new Error('Evidence sync failed');
        if (event.type === 'student.joined') setEnabled(body.data?.accepted === true);
        pending.current.delete(key);
      }
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      sending.current = false;
    }
  }, [classroomId]);
  const record = useCallback((type: string, id: string, payload: Record<string, unknown>) => {
    const key = `${classroomId}:${id}`.slice(0, 128);
    pending.current.set(key, { id: key, type, payload });
    void flush();
  }, [classroomId, flush]);

  useEffect(() => {
    if (!active || classroomId.startsWith('study_')) return;
    record('student.joined', 'joined', {});
    const timer = window.setInterval(() => { if (pending.current.size) void flush(); }, 15000);
    window.addEventListener('online', flush);
    return () => { window.clearInterval(timer); window.removeEventListener('online', flush); };
  }, [active, classroomId, record, flush]);

  useEffect(() => {
    if (!active || !enabled || !sceneId) return;
    const timer = window.setTimeout(() => record('scene.viewed', `viewed:${sceneId}`, { sceneId, dwellSeconds: 8 }), 8000);
    let widgetState: string | null = null;
    const response = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId?: string }>).detail;
      if (detail?.messageId) record('student.response', `response:${detail.messageId}`, { sceneId, messageId: detail.messageId, activity: 'discussion' });
    };
    const quiz = (event: Event) => {
      const detail = (event as CustomEvent<{ sceneId?: string; attemptId?: string; score?: number }>).detail;
      if (detail?.sceneId === sceneId && typeof detail.score === 'number') record('activity.completed', `quiz:${sceneId}:${detail.attemptId || 'attempt'}`, { sceneId, activity: 'quiz' });
    };
    const widget = (event: MessageEvent) => {
      if (event.data?.type !== 'aisecedu:simulation' || !Array.from(document.querySelectorAll('iframe')).some(frame => frame.contentWindow === event.source && frame.getBoundingClientRect().width > 0)) return;
      const phase = String(event.data.sceneId || '').slice(0, 80);
      if (event.data.action === 'state') {
        if (widgetState !== null && widgetState !== phase) {
          record('student.response', `decision:${sceneId}:${phase}`, { sceneId, activity: 'decision', phase });
          if (event.data.detail?.terminal) record('activity.completed', `completed:${sceneId}`, { sceneId, activity: 'simulation' });
        }
        widgetState = phase;
      }
      if (event.data.action === 'control') {
        const control = String(event.data.detail?.controlId || '').slice(0, 60);
        record('student.response', `control:${sceneId}:${control}`, { sceneId, activity: 'parameter-comparison', control });
      }
    };
    window.addEventListener('aisecedu:student-response', response);
    window.addEventListener('openmaic:quiz-reviewed', quiz);
    window.addEventListener('message', widget);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('aisecedu:student-response', response);
      window.removeEventListener('openmaic:quiz-reviewed', quiz);
      window.removeEventListener('message', widget);
    };
  }, [active, enabled, sceneId, record]);

  return failed ? <div role="status" className="fixed bottom-2 left-2 z-50 rounded border bg-background p-2 text-sm">课堂记录尚未同步，正在重试。<button type="button" className="ml-2 underline" onClick={() => void flush()}>重试同步</button></div> : null;
}
