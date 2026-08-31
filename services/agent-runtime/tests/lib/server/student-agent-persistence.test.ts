import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Queryable } from '@/lib/server/db';
import { _resetSchemaFlag, ensureAppSchema } from '@/lib/server/schema';
import {
  createStudentLearningPlan,
  forgetStudentMemory,
  loadStudentAgentLearningState,
  saveStudentLearningProfile,
  updateStudentLearningPlan,
} from '@/lib/server/student-agent-context';

describe('student agent persistence and ownership', () => {
  let pglite: PGlite;
  let db: Queryable;

  beforeEach(async () => {
    pglite = new PGlite();
    await pglite.waitReady;
    db = {
      async query(text, params) {
        const result = await pglite.query(text, params);
        return {
          rows: result.rows as Record<string, unknown>[],
          rowCount: result.affectedRows ?? result.rows.length,
        };
      },
    };
    _resetSchemaFlag();
    await ensureAppSchema(db);
  });

  afterEach(async () => {
    await pglite.close();
    _resetSchemaFlag();
  });

  it('creates all student-agent tables and keeps long-term memory learner-scoped', async () => {
    await saveStudentLearningProfile(
      'acct:student-a',
      {
        learningGoal: '掌握漏洞分析',
        level: 'intermediate',
        preferences: { explanationStyle: 'examples', sessionMinutes: 35 },
      },
      ['我喜欢先看示例'],
      db,
    );
    await saveStudentLearningProfile(
      'acct:student-b',
      { learningGoal: '掌握密码学', level: 'beginner' },
      ['我喜欢图示'],
      db,
    );

    const forgotten = await forgetStudentMemory('acct:student-a', '我喜欢先看示例', db);
    const studentB = await loadStudentAgentLearningState('acct:student-b', {}, db);

    expect(forgotten.learningGoal).toBe('掌握漏洞分析');
    expect(forgotten.memory).toEqual([]);
    expect(studentB.profile.memory).toEqual(['我喜欢图示']);
    expect(studentB.profile.learningGoal).toBe('掌握密码学');
  });

  it('allows only the owning learner to update a persisted learning plan', async () => {
    await db.query(
      `INSERT INTO student_agent_threads
       (id, learner_key, title, active_context, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      ['thread-a', 'acct:student-a', '复习计划', JSON.stringify({}), 'active', Date.now()],
    );
    const plan = await createStudentLearningPlan(
      'acct:student-a',
      'thread-a',
      {
        title: '今日漏洞复习',
        objective: '完成一次原理解释和情境迁移',
        steps: [
          {
            id: 'step-1',
            title: '解释原理',
            detail: '写出输入、边界与控制流之间的关系',
            status: 'pending',
            estimatedMinutes: 15,
          },
        ],
        sourceContext: {},
      },
      db,
    );

    const denied = await updateStudentLearningPlan('acct:student-b', plan.id, 'step-1', true, db);
    const completed = await updateStudentLearningPlan(
      'acct:student-a',
      plan.id,
      'step-1',
      true,
      db,
    );

    expect(denied).toBeNull();
    expect(completed?.status).toBe('completed');
    expect(completed?.steps[0]?.status).toBe('completed');
  });
});
