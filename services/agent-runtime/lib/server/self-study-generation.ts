import { nanoid } from 'nanoid';
import type { NextRequest } from 'next/server';
import type { Principal } from '@/lib/server/auth/session';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { getDb } from '@/lib/server/db';
import { buildLessonAiCall, generateSingleArtifact } from '@/lib/server/lesson-generation';
import { publishLesson } from '@/lib/server/lesson-publish';
import { ensureAppSchema } from '@/lib/server/schema';
import {
  buildSelfStudyPlanningInput,
  selectSelfStudyItems,
  type SelfStudyRequest,
} from '@/lib/server/self-study';
import { PgLessonStore } from '@/lib/server/stores/pg-lesson-store';
import { loadStudentLearningContext } from '@/lib/server/student-learning-context';
import { planTeachingPackage } from '@/lib/server/teaching-plan';
import type { Lesson } from '@/lib/types/lesson';

const LEVELS = new Set<SelfStudyRequest['level']>(['beginner', 'intermediate', 'advanced']);
const PREFERENCES = new Set<SelfStudyRequest['preference']>([
  'auto',
  'explain',
  'practice',
  'challenge',
]);

export class SelfStudyGenerationError extends Error {
  constructor(
    message: string,
    readonly publicMessage: string,
  ) {
    super(message);
  }
}

export function normalizeSelfStudyRequest(body: Record<string, unknown>): SelfStudyRequest {
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 500) : '';
  if (goal.length < 4)
    throw new SelfStudyGenerationError('Learning goal is too short', '请描述至少 4 个字的学习目标');
  const level = LEVELS.has(body.level as SelfStudyRequest['level'])
    ? (body.level as SelfStudyRequest['level'])
    : 'beginner';
  const preference = PREFERENCES.has(body.preference as SelfStudyRequest['preference'])
    ? (body.preference as SelfStudyRequest['preference'])
    : 'auto';
  const rawDuration =
    typeof body.durationMinutes === 'number' ? body.durationMinutes : Number(body.durationMinutes);
  const durationMinutes = Number.isFinite(rawDuration)
    ? Math.max(10, Math.min(90, Math.round(rawDuration)))
    : 30;
  return { goal, level, durationMinutes, preference };
}

export async function createStudentSelfStudyPackage(
  req: NextRequest,
  principal: Principal,
  request: SelfStudyRequest,
) {
  const db = await getDb();
  await ensureAppSchema(db);
  const id = `study_${nanoid(12)}`;
  const lessonId = `self_lesson_${nanoid(12)}`;
  const now = Date.now();
  await db.query(
    `INSERT INTO self_study_sessions
       (id, learner_key, goal, title, level, duration_minutes, preference, lesson_id, status, created_at, updated_at)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'generating',$8,$8)`,
    [
      id,
      principal.learnerKey,
      request.goal,
      request.level,
      request.durationMinutes,
      request.preference,
      lessonId,
      now,
    ],
  );

  try {
    const context = await loadStudentLearningContext(principal.learnerKey, db);
    const planningInput = buildSelfStudyPlanningInput(request, context.insight);
    const plan = await planTeachingPackage(planningInput);
    const selectedItems = selectSelfStudyItems(plan, request.durationMinutes);
    if (selectedItems.length === 0) throw new Error('Planner returned no usable learning items');
    let aiCall: Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall'];
    try {
      aiCall = (
        await buildLessonAiCall('fast', {
          thinking: { mode: 'disabled', enabled: false },
          retries: 1,
        })
      ).aiCall;
    } catch {
      aiCall = async () => {
        throw new Error('Self-study model unavailable; use deterministic artifact fallback');
      };
    }
    const generateItem = (item: (typeof selectedItems)[number], order: number) =>
      generateSingleArtifact(
        {
          type: item.type,
          title: item.title,
          keyPoints: item.keyPoints,
          description: `${item.purpose}\n学习目标：${planningInput.description ?? ''}`,
        },
        order,
        aiCall,
        {
          languageDirective: '使用简体中文；面向学生自主学习；提供明确指引、反馈和安全边界。',
          subjectProfile: true,
          useWorkflow: true,
        },
      );
    const generated = await Promise.allSettled(selectedItems.map(generateItem));
    const artifactsByIndex = generated.map((result) =>
      result.status === 'fulfilled' ? result.value : null,
    );
    const failedIndexes = artifactsByIndex.flatMap((artifact, index) => (artifact ? [] : [index]));
    const retries = await Promise.allSettled(
      failedIndexes.map((index) => generateItem(selectedItems[index]!, index)),
    );
    retries.forEach((result, retryIndex) => {
      if (result.status === 'fulfilled' && result.value) {
        artifactsByIndex[failedIndexes[retryIndex]!] = result.value;
      }
    });
    const generatedItems = selectedItems.filter((_, index) => artifactsByIndex[index]);
    const artifacts = artifactsByIndex.flatMap((artifact) => (artifact ? [artifact] : []));
    artifacts.forEach((artifact, order) => {
      artifact.order = order;
      artifact.outline.order = order;
    });
    if (artifacts.length === 0) throw new Error('No learning artifact could be generated');
    const lesson: Lesson = {
      id: lessonId,
      title: plan.title || request.goal,
      description: `${plan.summary}\n由学生学习目标与现有学习证据共同生成。`,
      subjectProfile: 'cybersecurity',
      artifacts,
      createdAt: now,
      updatedAt: Date.now(),
    };
    const store = new PgLessonStore();
    await store.write(principal, lesson);
    const published = await publishLesson(lesson, buildRequestOrigin(req), principal.learnerKey);
    lesson.publishedClassroomId = published.classroomId;
    lesson.updatedAt = Date.now();
    await store.write(principal, lesson);
    await db.query(
      `INSERT INTO classroom_enrollments (classroom_id, learner_key, enrolled_at)
       VALUES ($1,$2,$3) ON CONFLICT (classroom_id, learner_key) DO NOTHING`,
      [published.classroomId, principal.learnerKey, Date.now()],
    );
    const storedPlan = {
      ...plan,
      items: generatedItems,
      omittedItems: selectedItems
        .filter((_, index) => !artifactsByIndex[index])
        .map((item) => ({ type: item.type, title: item.title })),
      generatedArtifactCount: artifacts.length,
      failedArtifactCount: selectedItems.length - artifacts.length,
      learnerContext: {
        state: context.insight.state,
        completionRate: context.insight.completionRate,
        averageQuizScore: context.insight.averageQuizScore,
        weakestCapability: context.insight.weakestCapability?.label ?? null,
      },
    };
    await db.query(
      `UPDATE self_study_sessions
       SET title = $1, classroom_id = $2, plan = $3, status = 'ready', error = NULL, updated_at = $4
       WHERE id = $5 AND learner_key = $6`,
      [
        lesson.title,
        published.classroomId,
        JSON.stringify(storedPlan),
        Date.now(),
        id,
        principal.learnerKey,
      ],
    );
    return {
      id,
      title: lesson.title,
      lessonId,
      classroomId: published.classroomId,
      classroomUrl: published.url,
      status: 'ready' as const,
      plan: storedPlan,
    };
  } catch (error) {
    const publicMessage =
      error instanceof Error && /Planner returned|No learning artifact/.test(error.message)
        ? error.message
        : '内容生成暂时失败，请稍后重试';
    await db.query(
      `UPDATE self_study_sessions SET status = 'failed', error = $1, updated_at = $2
       WHERE id = $3 AND learner_key = $4`,
      [publicMessage, Date.now(), id, principal.learnerKey],
    );
    throw new SelfStudyGenerationError(
      error instanceof Error ? error.message : 'Self-study package generation failed',
      publicMessage,
    );
  }
}
