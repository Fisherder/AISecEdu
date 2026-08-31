/**
 * Idempotent schema creation for the security teaching module.
 *
 * Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
 * PGlite-compatible: one statement at a time.
 */
import { getDb, execSql, type Queryable } from './db';

let schemaInitialized = false;

const SCHEMA_STATEMENTS = [
  // Users
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'teacher',
    display_name TEXT,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS users_username_idx ON users (username)`,

  // Sessions
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DOUBLE PRECISION NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at)`,

  // Lessons (owner-scoped)
  `CREATE TABLE IF NOT EXISTS app_lessons (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    subject_profile TEXT,
    course_id TEXT,
    published_classroom_id TEXT,
    artifacts JSONB NOT NULL DEFAULT '[]',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS app_lessons_owner_idx ON app_lessons (owner_key, updated_at DESC)`,

  // Classrooms (owner + visibility)
  `CREATE TABLE IF NOT EXISTS app_classrooms (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    lesson_id TEXT,
    stage JSONB,
    scenes JSONB,
    visibility TEXT NOT NULL DEFAULT 'unlisted',
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS app_classrooms_owner_idx ON app_classrooms (owner_key)`,

  // Student enrollment
  `CREATE TABLE IF NOT EXISTS classroom_enrollments (
    classroom_id TEXT NOT NULL REFERENCES app_classrooms(id) ON DELETE CASCADE,
    learner_key TEXT NOT NULL,
    enrolled_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (classroom_id, learner_key)
  )`,

  // Courses (a teacher's course contains multiple lessons + enrolled students)
  `CREATE TABLE IF NOT EXISTS app_courses (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    course_code TEXT,
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS app_courses_owner_idx ON app_courses (owner_key)`,

  // Course-Lesson link (a lesson belongs to a course)
  `CREATE TABLE IF NOT EXISTS course_lessons (
    course_id TEXT NOT NULL REFERENCES app_courses(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (course_id, lesson_id)
  )`,

  // Course enrollments (students join a course)
  `CREATE TABLE IF NOT EXISTS course_enrollments (
    course_id TEXT NOT NULL REFERENCES app_courses(id) ON DELETE CASCADE,
    learner_key TEXT NOT NULL,
    enrolled_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (course_id, learner_key)
  )`,

  // Student progress (aggregation; source of truth is runtime_records)
  `CREATE TABLE IF NOT EXISTS student_progress (
    classroom_id TEXT NOT NULL,
    learner_key TEXT NOT NULL,
    lesson_id TEXT,
    last_scene_id TEXT,
    completed_scenes JSONB NOT NULL DEFAULT '[]',
    quiz_scores JSONB NOT NULL DEFAULT '{}',
    updated_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (classroom_id, learner_key)
  )`,

  // Append-only learning evidence. Aggregate progress is a projection of
  // these events; event_id makes browser retries idempotent.
  `CREATE TABLE IF NOT EXISTS learning_events (
    id TEXT PRIMARY KEY,
    classroom_id TEXT NOT NULL,
    learner_key TEXT NOT NULL,
    lesson_id TEXT,
    scene_id TEXT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'web',
    payload JSONB NOT NULL DEFAULT '{}',
    occurred_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS learning_events_learner_idx ON learning_events (learner_key, occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS learning_events_classroom_idx ON learning_events (classroom_id, occurred_at DESC)`,

  // Lightweight teacher assignments. A task points at one published lesson;
  // all students enrolled in the course receive it automatically.
  `CREATE TABLE IF NOT EXISTS learning_tasks (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    course_id TEXT NOT NULL REFERENCES app_courses(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    classroom_id TEXT NOT NULL,
    title TEXT NOT NULL,
    instructions TEXT,
    due_at DOUBLE PRECISION,
    completion_rule JSONB NOT NULL DEFAULT '{"requireAllScenes":true}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS learning_tasks_course_idx ON learning_tasks (course_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS learning_tasks_owner_idx ON learning_tasks (owner_key, created_at DESC)`,

  // One lightweight attempt/progress marker per learner and assignment. The
  // completion result itself is still derived from student_progress evidence.
  `CREATE TABLE IF NOT EXISTS learning_task_attempts (
    task_id TEXT NOT NULL REFERENCES learning_tasks(id) ON DELETE CASCADE,
    learner_key TEXT NOT NULL,
    started_at DOUBLE PRECISION,
    completed_at DOUBLE PRECISION,
    last_checked_at DOUBLE PRECISION NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (task_id, learner_key)
  )`,
  `CREATE INDEX IF NOT EXISTS learning_task_attempts_learner_idx ON learning_task_attempts (learner_key, last_checked_at DESC)`,

  // Student-owned, AI-generated learning packages. The generated lesson and
  // classroom keep using the global-agent storage and publishing pipeline.
  `CREATE TABLE IF NOT EXISTS self_study_sessions (
    id TEXT PRIMARY KEY,
    learner_key TEXT NOT NULL,
    goal TEXT NOT NULL,
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL,
    preference TEXT NOT NULL DEFAULT 'auto',
    lesson_id TEXT,
    classroom_id TEXT,
    plan JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'generating',
    error TEXT,
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS self_study_sessions_learner_idx ON self_study_sessions (learner_key, created_at DESC)`,

  // AI-written explanation of deterministic evidence. Reviews are formative
  // feedback only and are never used as a formal grade source.
  `CREATE TABLE IF NOT EXISTS ai_learning_reviews (
    id TEXT PRIMARY KEY,
    learner_key TEXT NOT NULL,
    review JSONB NOT NULL,
    evidence_snapshot JSONB NOT NULL,
    source TEXT NOT NULL,
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ai_learning_reviews_learner_idx ON ai_learning_reviews (learner_key, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS student_learning_profiles (
    learner_key TEXT PRIMARY KEY,
    learning_goal TEXT,
    level TEXT NOT NULL DEFAULT 'beginner',
    preferences JSONB NOT NULL DEFAULT '{}',
    memory JSONB NOT NULL DEFAULT '[]',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS student_agent_threads (
    id TEXT PRIMARY KEY,
    learner_key TEXT NOT NULL,
    title TEXT NOT NULL,
    active_context JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS student_agent_threads_learner_idx ON student_agent_threads (learner_key, updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS student_agent_messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES student_agent_threads(id) ON DELETE CASCADE,
    learner_key TEXT NOT NULL,
    role TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'message',
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS student_agent_messages_thread_idx ON student_agent_messages (thread_id, created_at)`,

  `CREATE TABLE IF NOT EXISTS student_learning_plans (
    id TEXT PRIMARY KEY,
    learner_key TEXT NOT NULL,
    thread_id TEXT REFERENCES student_agent_threads(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    objective TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    steps JSONB NOT NULL DEFAULT '[]',
    source_context JSONB NOT NULL DEFAULT '{}',
    created_at DOUBLE PRECISION NOT NULL,
    updated_at DOUBLE PRECISION NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS student_learning_plans_learner_idx ON student_learning_plans (learner_key, updated_at DESC)`,
];

/** Ensure all tables exist. Safe to call multiple times. */
export async function ensureAppSchema(db?: Queryable): Promise<void> {
  if (schemaInitialized) return;
  const conn = db ?? (await getDb());
  await execSql(conn, SCHEMA_STATEMENTS);
  schemaInitialized = true;
}

/** Reset the schema init flag (for tests). */
export function _resetSchemaFlag(): void {
  schemaInitialized = false;
}
