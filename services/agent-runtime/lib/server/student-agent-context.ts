import { nanoid } from 'nanoid';
import type { LearnerInsight } from '@/lib/security/learning-analytics';
import { getDb, type Queryable } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { loadStudentLearningContext } from '@/lib/server/student-learning-context';

export interface StudentAgentContextSelection {
  courseId?: string;
  lessonId?: string;
  taskId?: string;
}

export interface StudentAgentCourse {
  id: string;
  title: string;
  description: string;
  courseCode: string;
  lessons: Array<{
    id: string;
    title: string;
    classroomId: string | null;
    order: number;
  }>;
}

export interface StudentAgentTask {
  id: string;
  title: string;
  instructions: string;
  courseId: string;
  courseTitle: string;
  lessonId: string;
  classroomId: string;
  dueAt: number | null;
  progress: number;
}

export interface StudentAgentPackage {
  id: string;
  title: string;
  goal: string;
  classroomId: string | null;
  status: string;
  createdAt: number;
}

export interface StudentLearningProfile {
  learningGoal: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  preferences: {
    explanationStyle?: string;
    challengeLevel?: string;
    sessionMinutes?: number;
  };
  memory: string[];
  updatedAt: number | null;
}

export interface StudentLearningPlanStep {
  id: string;
  title: string;
  detail: string;
  status: 'pending' | 'in-progress' | 'completed';
  estimatedMinutes?: number;
}

export interface StudentLearningPlan {
  id: string;
  threadId: string | null;
  title: string;
  objective: string;
  status: 'active' | 'completed' | 'archived';
  steps: StudentLearningPlanStep[];
  sourceContext: StudentAgentContextSelection;
  createdAt: number;
  updatedAt: number;
}

export interface StudentAgentLearningState {
  profile: StudentLearningProfile;
  insight: LearnerInsight;
  evidenceEventCount: number;
  courses: StudentAgentCourse[];
  tasks: StudentAgentTask[];
  packages: StudentAgentPackage[];
  plans: StudentLearningPlan[];
  activeContext: StudentAgentContextSelection;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function strings(value: unknown, limit = 30): string[] {
  return arrayValue(value)
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' ').slice(0, 180))
    .filter(Boolean)
    .slice(-limit);
}

function profileFromRow(row?: Record<string, unknown>): StudentLearningProfile {
  const preferences = objectValue(row?.preferences);
  const level = row?.level;
  return {
    learningGoal: typeof row?.learning_goal === 'string' ? row.learning_goal : '',
    level:
      level === 'intermediate' || level === 'advanced' || level === 'beginner' ? level : 'beginner',
    preferences: {
      explanationStyle:
        typeof preferences.explanationStyle === 'string'
          ? preferences.explanationStyle.slice(0, 80)
          : undefined,
      challengeLevel:
        typeof preferences.challengeLevel === 'string'
          ? preferences.challengeLevel.slice(0, 80)
          : undefined,
      sessionMinutes:
        typeof preferences.sessionMinutes === 'number'
          ? Math.max(10, Math.min(120, Math.round(preferences.sessionMinutes)))
          : undefined,
    },
    memory: strings(row?.memory),
    updatedAt: typeof row?.updated_at === 'number' ? row.updated_at : null,
  };
}

function planFromRow(row: Record<string, unknown>): StudentLearningPlan {
  const steps = arrayValue(row.steps).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    const title = typeof value.title === 'string' ? value.title.trim().slice(0, 160) : '';
    if (!title) return [];
    const rawStatus = value.status;
    const status = rawStatus === 'completed' || rawStatus === 'in-progress' ? rawStatus : 'pending';
    return [
      {
        id: typeof value.id === 'string' ? value.id : `step-${index + 1}`,
        title,
        detail: typeof value.detail === 'string' ? value.detail.trim().slice(0, 320) : '',
        status,
        estimatedMinutes:
          typeof value.estimatedMinutes === 'number'
            ? Math.max(1, Math.min(240, Math.round(value.estimatedMinutes)))
            : undefined,
      } satisfies StudentLearningPlanStep,
    ];
  });
  const source = objectValue(row.source_context);
  return {
    id: String(row.id),
    threadId: typeof row.thread_id === 'string' ? row.thread_id : null,
    title: String(row.title ?? '学习计划'),
    objective: String(row.objective ?? ''),
    status: row.status === 'completed' || row.status === 'archived' ? row.status : 'active',
    steps,
    sourceContext: {
      courseId: typeof source.courseId === 'string' ? source.courseId : undefined,
      lessonId: typeof source.lessonId === 'string' ? source.lessonId : undefined,
      taskId: typeof source.taskId === 'string' ? source.taskId : undefined,
    },
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

export async function loadStudentAgentLearningState(
  learnerKey: string,
  requestedContext: StudentAgentContextSelection = {},
  providedDb?: Queryable,
): Promise<StudentAgentLearningState> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const [profileResult, courseRows, taskRows, packageRows, planRows, progressRows, evidence] =
    await Promise.all([
      db.query('SELECT * FROM student_learning_profiles WHERE learner_key = $1', [learnerKey]),
      db.query(
        `SELECT c.id AS course_id, c.title AS course_title, c.description, c.course_code,
                l.id AS lesson_id, l.title AS lesson_title, l.published_classroom_id, cl.sort_order
         FROM course_enrollments ce
         JOIN app_courses c ON c.id = ce.course_id
         LEFT JOIN course_lessons cl ON cl.course_id = c.id
         LEFT JOIN app_lessons l ON l.id = cl.lesson_id AND l.published_classroom_id IS NOT NULL
         WHERE ce.learner_key = $1
         ORDER BY ce.enrolled_at DESC, cl.sort_order`,
        [learnerKey],
      ),
      db.query(
        `SELECT t.id, t.title, t.instructions, t.course_id, c.title AS course_title,
                t.lesson_id, t.classroom_id, t.due_at
         FROM learning_tasks t
         JOIN course_enrollments ce ON ce.course_id = t.course_id AND ce.learner_key = $1
         JOIN app_courses c ON c.id = t.course_id
         WHERE t.status = 'active'
         ORDER BY t.created_at DESC`,
        [learnerKey],
      ),
      db.query(
        `SELECT id, title, goal, classroom_id, status, created_at
         FROM self_study_sessions WHERE learner_key = $1 ORDER BY created_at DESC LIMIT 20`,
        [learnerKey],
      ),
      db.query(
        `SELECT * FROM student_learning_plans
         WHERE learner_key = $1 AND status <> 'archived' ORDER BY updated_at DESC LIMIT 12`,
        [learnerKey],
      ),
      db.query(
        'SELECT classroom_id, completed_scenes FROM student_progress WHERE learner_key = $1',
        [learnerKey],
      ),
      loadStudentLearningContext(learnerKey, db),
    ]);

  const coursesById = new Map<string, StudentAgentCourse>();
  for (const row of courseRows.rows) {
    const courseId = String(row.course_id);
    let course = coursesById.get(courseId);
    if (!course) {
      course = {
        id: courseId,
        title: String(row.course_title),
        description: typeof row.description === 'string' ? row.description : '',
        courseCode: typeof row.course_code === 'string' ? row.course_code : '',
        lessons: [],
      };
      coursesById.set(courseId, course);
    }
    if (typeof row.lesson_id === 'string') {
      course.lessons.push({
        id: row.lesson_id,
        title: String(row.lesson_title),
        classroomId:
          typeof row.published_classroom_id === 'string' ? row.published_classroom_id : null,
        order: Number(row.sort_order ?? course.lessons.length),
      });
    }
  }

  const completedByClassroom = new Map(
    progressRows.rows.map((row) => [
      String(row.classroom_id),
      arrayValue(row.completed_scenes).length,
    ]),
  );
  const tasks = taskRows.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    instructions: typeof row.instructions === 'string' ? row.instructions : '',
    courseId: String(row.course_id),
    courseTitle: String(row.course_title),
    lessonId: String(row.lesson_id),
    classroomId: String(row.classroom_id),
    dueAt: typeof row.due_at === 'number' ? row.due_at : null,
    progress: completedByClassroom.get(String(row.classroom_id)) ?? 0,
  }));
  const packages = packageRows.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    goal: String(row.goal),
    classroomId: typeof row.classroom_id === 'string' ? row.classroom_id : null,
    status: String(row.status),
    createdAt: Number(row.created_at ?? 0),
  }));
  const courses = [...coursesById.values()];
  const activeContext = validateStudentAgentContext(requestedContext, courses, tasks, packages);

  return {
    profile: profileFromRow(profileResult.rows[0]),
    insight: evidence.insight,
    evidenceEventCount: evidence.evidenceEventCount,
    courses,
    tasks,
    packages,
    plans: planRows.rows.map(planFromRow),
    activeContext,
  };
}

export function validateStudentAgentContext(
  requested: StudentAgentContextSelection,
  courses: StudentAgentCourse[],
  tasks: StudentAgentTask[],
  packages: StudentAgentPackage[],
): StudentAgentContextSelection {
  const task = requested.taskId ? tasks.find((item) => item.id === requested.taskId) : undefined;
  if (task) {
    return { taskId: task.id, courseId: task.courseId, lessonId: task.lessonId };
  }
  const course = requested.courseId
    ? courses.find((item) => item.id === requested.courseId)
    : undefined;
  const lesson = requested.lessonId
    ? courses.flatMap((item) => item.lessons).find((item) => item.id === requested.lessonId)
    : undefined;
  if (lesson) {
    const owner = courses.find((item) =>
      item.lessons.some((itemLesson) => itemLesson.id === lesson.id),
    );
    return { courseId: owner?.id, lessonId: lesson.id };
  }
  if (course) return { courseId: course.id };
  if (requested.lessonId && packages.some((item) => item.id === requested.lessonId)) {
    return { lessonId: requested.lessonId };
  }
  return {};
}

export async function saveStudentLearningProfile(
  learnerKey: string,
  update: Partial<StudentLearningProfile>,
  memoryFacts: string[] = [],
  providedDb?: Queryable,
): Promise<StudentLearningProfile> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const currentResult = await db.query(
    'SELECT * FROM student_learning_profiles WHERE learner_key = $1',
    [learnerKey],
  );
  const current = profileFromRow(currentResult.rows[0]);
  const learningGoal =
    typeof update.learningGoal === 'string'
      ? update.learningGoal.trim().slice(0, 500)
      : current.learningGoal;
  const level =
    update.level === 'intermediate' || update.level === 'advanced' || update.level === 'beginner'
      ? update.level
      : current.level;
  const preferences = { ...current.preferences, ...(update.preferences ?? {}) };
  if (typeof preferences.sessionMinutes === 'number') {
    preferences.sessionMinutes = Math.max(
      10,
      Math.min(120, Math.round(preferences.sessionMinutes)),
    );
  }
  const baseMemory = Array.isArray(update.memory) ? strings(update.memory) : current.memory;
  const mergedMemory = strings([...baseMemory, ...memoryFacts]);
  const now = Date.now();
  await db.query(
    `INSERT INTO student_learning_profiles
       (learner_key, learning_goal, level, preferences, memory, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     ON CONFLICT (learner_key) DO UPDATE SET
       learning_goal = EXCLUDED.learning_goal,
       level = EXCLUDED.level,
       preferences = EXCLUDED.preferences,
       memory = EXCLUDED.memory,
       updated_at = EXCLUDED.updated_at`,
    [
      learnerKey,
      learningGoal || null,
      level,
      JSON.stringify(preferences),
      JSON.stringify(mergedMemory),
      now,
    ],
  );
  return { learningGoal, level, preferences, memory: mergedMemory, updatedAt: now };
}

export async function forgetStudentMemory(
  learnerKey: string,
  fact: string,
  providedDb?: Queryable,
): Promise<StudentLearningProfile> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const currentResult = await db.query(
    'SELECT * FROM student_learning_profiles WHERE learner_key = $1',
    [learnerKey],
  );
  const current = profileFromRow(currentResult.rows[0]);
  return saveStudentLearningProfile(
    learnerKey,
    { ...current, memory: current.memory.filter((item) => item !== fact) },
    [],
    db,
  );
}

export async function createStudentLearningPlan(
  learnerKey: string,
  threadId: string,
  input: {
    title: string;
    objective: string;
    steps: StudentLearningPlanStep[];
    sourceContext: StudentAgentContextSelection;
  },
  providedDb?: Queryable,
): Promise<StudentLearningPlan> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const id = `plan_${nanoid(12)}`;
  const now = Date.now();
  const steps = input.steps.slice(0, 12).map((step, index) => ({
    id: step.id || `step-${index + 1}`,
    title: step.title.trim().slice(0, 160),
    detail: step.detail.trim().slice(0, 320),
    status: step.status,
    estimatedMinutes: step.estimatedMinutes,
  }));
  await db.query(
    `INSERT INTO student_learning_plans
       (id, learner_key, thread_id, title, objective, status, steps, source_context, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$8)`,
    [
      id,
      learnerKey,
      threadId,
      input.title.trim().slice(0, 200),
      input.objective.trim().slice(0, 500),
      JSON.stringify(steps),
      JSON.stringify(input.sourceContext),
      now,
    ],
  );
  return {
    id,
    threadId,
    title: input.title.trim().slice(0, 200),
    objective: input.objective.trim().slice(0, 500),
    status: 'active',
    steps,
    sourceContext: input.sourceContext,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateStudentLearningPlan(
  learnerKey: string,
  planId: string,
  stepId: string,
  completed: boolean,
  providedDb?: Queryable,
): Promise<StudentLearningPlan | null> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const result = await db.query(
    'SELECT * FROM student_learning_plans WHERE id = $1 AND learner_key = $2',
    [planId, learnerKey],
  );
  if (!result.rows[0]) return null;
  const plan = planFromRow(result.rows[0]);
  const steps: StudentLearningPlanStep[] = plan.steps.map((step) =>
    step.id === stepId
      ? { ...step, status: completed ? ('completed' as const) : ('pending' as const) }
      : step,
  );
  const status =
    steps.length > 0 && steps.every((step) => step.status === 'completed') ? 'completed' : 'active';
  const now = Date.now();
  await db.query(
    `UPDATE student_learning_plans SET steps = $1, status = $2, updated_at = $3
     WHERE id = $4 AND learner_key = $5`,
    [JSON.stringify(steps), status, now, planId, learnerKey],
  );
  return { ...plan, steps, status, updatedAt: now };
}
