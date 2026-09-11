'use client';

import { useEffect, useState } from 'react';
import { useStageStore } from '@/lib/store';
import { IntegratedClassroomTracker } from './integrated-classroom-tracker';

export function ClassroomLearningTracker(props: { classroomId: string; active: boolean }) {
  return process.env.NEXT_PUBLIC_AISECEDU_INTEGRATED === 'true'
    ? <IntegratedClassroomTracker key={props.classroomId} {...props} />
    : <StandaloneClassroomLearningTracker {...props} />;
}

function eventId(parts: string[]): string {
  return parts.join('.').replace(/[^\w:.-]/g, '_').slice(0, 220);
}

/**
 * Records a conservative "scene viewed" event after an eight-second dwell.
 * It renders nothing and fails silently for public/teacher playback. Visiting a
 * scene is learning evidence, not a formal mastery or grade decision.
 */
function StandaloneClassroomLearningTracker({ classroomId, active }: { classroomId: string; active: boolean }) {
  const currentSceneId = useStageStore((state) => state.currentSceneId);
  const [studentId, setStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && payload?.user?.role === 'student') setStudentId(payload.user.id as string);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (!active || !studentId) return;
    void fetch('/api/classrooms/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classroomId,
        eventType: 'classroom.opened',
        eventId: eventId(['opened', studentId, classroomId]),
      }),
    }).catch(() => undefined);
  }, [active, classroomId, studentId]);

  useEffect(() => {
    if (!active || !studentId || !currentSceneId) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/classrooms/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId,
          sceneId: currentSceneId,
          lastSceneId: currentSceneId,
          completedSceneId: currentSceneId,
          eventType: 'scene.viewed',
          eventId: eventId(['viewed', studentId, classroomId, currentSceneId]),
        }),
      }).catch(() => undefined);
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [active, classroomId, currentSceneId, studentId]);

  useEffect(() => {
    if (!active || !studentId) return;
    const handleQuizReviewed = (event: Event) => {
      const detail = (event as CustomEvent<{ sceneId?: string; attemptId?: string; score?: number }>).detail;
      if (!detail?.sceneId || typeof detail.score !== 'number') return;
      void fetch('/api/classrooms/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId,
          sceneId: detail.sceneId,
          lastSceneId: detail.sceneId,
          completedSceneId: detail.sceneId,
          quizScores: { [detail.sceneId]: detail.score },
          eventType: 'quiz.submitted',
          eventId: eventId(['quiz', studentId, classroomId, detail.sceneId, detail.attemptId ?? 'attempt']),
        }),
      }).catch(() => undefined);
    };
    window.addEventListener('openmaic:quiz-reviewed', handleQuizReviewed);
    return () => window.removeEventListener('openmaic:quiz-reviewed', handleQuizReviewed);
  }, [active, classroomId, studentId]);

  return null;
}
