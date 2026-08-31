/**
 * Seed an isolated, deterministic Xuanjia manual-test workspace.
 *
 * Run through scripts/start-xuanjia-test.sh. Direct invocations also default
 * to .xuanjia-test-data, so this script never writes to OpenMAIC's ./data
 * directory unless OPENMAIC_DATA_DIR is explicitly overridden.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { PPTTextElement } from '@openmaic/dsl';
import type { Lesson, LessonArtifact } from '@/lib/types/lesson';
import type { Queryable } from '@/lib/server/db';
import type { Scene, Stage } from '@/lib/types/stage';
import { createDefaultSlide } from '@/lib/edit/slide-edit-elements';
import { hashPassword } from '@/lib/server/auth/password';
import { resolveAgentRuntimeDataDir } from '@/lib/server/data-root';
import { ensureAppSchema } from '@/lib/server/schema';

const COURSE_ID = 'xuanjia-demo-course';
const LESSON_ID = 'xuanjia-demo-lesson';
const CLASSROOM_ID = 'xuanjia-demo-classroom';
const TASK_ID = 'xuanjia-demo-task';
const SLIDE_SCENE_ID = 'xuanjia-demo-slide';
const QUIZ_SCENE_ID = 'xuanjia-demo-quiz';

const teacherUsername = envValue('XUANJIA_TEST_TEACHER_USERNAME', 'xuanjia_teacher');
const teacherPassword = envValue('XUANJIA_TEST_TEACHER_PASSWORD', 'XuanjiaTeacher#2026');
const studentUsername = envValue('XUANJIA_TEST_STUDENT_USERNAME', 'xuanjia_student');
const studentPassword = envValue('XUANJIA_TEST_STUDENT_PASSWORD', 'XuanjiaStudent#2026');

function envValue(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function textElement(args: {
  id: string;
  top: number;
  height: number;
  content: string;
  color?: string;
}): PPTTextElement {
  return {
    id: args.id,
    type: 'text',
    left: 72,
    top: args.top,
    width: 856,
    height: args.height,
    rotate: 0,
    content: args.content,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: args.color ?? '#dbeafe',
    lineHeight: 1.35,
    paragraphSpace: 8,
  };
}

function buildDemoContent(now: number): {
  lesson: Lesson;
  stage: Stage;
  scenes: Scene[];
} {
  const slideElements: PPTTextElement[] = [
    textElement({
      id: 'xuanjia-demo-title',
      top: 58,
      height: 100,
      color: '#67e8f9',
      content: '<p style="font-size:38px"><strong>SQL 注入：从攻击链到参数化防御</strong></p>',
    }),
    textElement({
      id: 'xuanjia-demo-objective',
      top: 170,
      height: 78,
      color: '#a5b4fc',
      content:
        '<p style="font-size:22px"><strong>学习目标：</strong>识别输入边界，解释漏洞成因，并选择可验证的修复方案。</p>',
    }),
    textElement({
      id: 'xuanjia-demo-chain',
      top: 268,
      height: 210,
      content: [
        '<p style="font-size:21px"><strong>攻击链</strong>　不可信输入 → 字符串拼接 → SQL 语义改变 → 越权读取</p>',
        '<p style="font-size:21px"><strong>核心防线</strong>　参数化查询 + 最小权限 + 统一异常处理</p>',
        '<p style="font-size:21px"><strong>验证方法</strong>　正常值、特殊字符、边界载荷与审计日志四组证据闭环</p>',
      ].join(''),
    }),
  ];

  const quizQuestions = [
    {
      id: 'xuanjia-demo-question-1',
      type: 'single' as const,
      question: '修复 SQL 注入时，最关键且可普遍复用的首选措施是什么？',
      options: [
        { value: 'A', label: '使用参数化查询，将数据与 SQL 指令分离' },
        { value: 'B', label: '只在前端限制输入长度' },
        { value: 'C', label: '隐藏数据库错误信息即可' },
        { value: 'D', label: '把所有输入都转换成大写' },
      ],
      answer: ['A'],
      analysis: '参数化查询从语义层隔离指令与数据；输入校验、最小权限和错误处理是纵深防御。',
      hasAnswer: true,
      points: 10,
    },
  ];

  const artifacts: LessonArtifact[] = [
    {
      id: 'xuanjia-demo-artifact-slide',
      type: 'slide',
      title: 'SQL 注入攻击面与纵深防御',
      outline: {
        id: 'xuanjia-demo-outline-slide',
        type: 'slide',
        title: 'SQL 注入攻击面与纵深防御',
        description: '从信任边界和数据流解释 SQL 注入，并给出可验证的修复策略。',
        keyPoints: ['不可信输入', 'SQL 语义改变', '参数化查询', '最小权限'],
        teachingObjective: '能够解释漏洞根因并设计纵深防御。',
        estimatedDuration: 240,
        order: 0,
      },
      content: {
        elements: slideElements,
        background: { type: 'solid', color: '#07111f' },
        remark: '先让学生定位信任边界，再比较字符串拼接与参数化查询的数据流差异。',
      },
      order: 0,
      createdAt: now,
    },
    {
      id: 'xuanjia-demo-artifact-quiz',
      type: 'quiz',
      title: '修复策略检查点',
      outline: {
        id: 'xuanjia-demo-outline-quiz',
        type: 'quiz',
        title: '修复策略检查点',
        description: '检查学生是否能区分根本修复与表面缓解措施。',
        keyPoints: ['参数化查询', '输入校验', '最小权限'],
        teachingObjective: '能够选择并解释 SQL 注入的首选修复措施。',
        estimatedDuration: 120,
        order: 1,
        quizConfig: { questionCount: 1, difficulty: 'easy', questionTypes: ['single'] },
      },
      content: { questions: quizQuestions },
      order: 1,
      createdAt: now,
    },
  ];

  const lesson: Lesson = {
    id: LESSON_ID,
    title: '玄甲 SQL 注入攻防实训',
    description: '面向网安课堂的最小闭环样例：概念讲解、随堂测验、学习证据与教师学情回流。',
    subjectProfile: 'cybersecurity',
    courseId: COURSE_ID,
    artifacts,
    publishedClassroomId: CLASSROOM_ID,
    createdAt: now,
    updatedAt: now,
  };

  const stage: Stage = {
    id: CLASSROOM_ID,
    name: lesson.title,
    description: lesson.description,
    languageDirective: '使用简体中文授课；强调合法授权、隔离环境和防御性验证。',
    style: '玄甲网安实训',
    createdAt: now,
    updatedAt: now,
    generatedAgentConfigs: [
      {
        id: 'xuanjia-demo-instructor',
        name: '玄甲教官',
        role: '网安实训导师',
        persona: '以证据链和安全边界为核心，引导学生先分析再验证。',
        avatar: '/avatars/teacher.png',
        color: '#22d3ee',
        priority: 10,
      },
      {
        id: 'xuanjia-demo-redteam',
        name: '红队同学',
        role: '对抗思维伙伴',
        persona: '提出攻击者视角的问题，但只讨论授权教学环境中的安全验证。',
        avatar: '/avatars/curious.png',
        color: '#fb7185',
        priority: 20,
      },
    ],
  };

  const slideCanvas = createDefaultSlide('xuanjia-demo-slide-canvas');
  slideCanvas.background = { type: 'solid', color: '#07111f' };
  slideCanvas.theme = {
    backgroundColor: '#07111f',
    themeColors: ['#22d3ee', '#818cf8', '#34d399', '#fb7185'],
    fontColor: '#dbeafe',
    fontName: 'Microsoft YaHei',
  };
  slideCanvas.elements = slideElements;

  const agentIds = ['xuanjia-demo-instructor', 'xuanjia-demo-redteam'];
  const scenes: Scene[] = [
    {
      id: SLIDE_SCENE_ID,
      stageId: CLASSROOM_ID,
      type: 'slide',
      title: 'SQL 注入攻击面与纵深防御',
      order: 0,
      content: { type: 'slide', canvas: slideCanvas },
      actions: [],
      multiAgent: { enabled: true, agentIds },
      createdAt: now,
      updatedAt: now,
      outlineId: 'xuanjia-demo-outline-slide',
    },
    {
      id: QUIZ_SCENE_ID,
      stageId: CLASSROOM_ID,
      type: 'quiz',
      title: '修复策略检查点',
      order: 1,
      content: { type: 'quiz', questions: quizQuestions },
      actions: [],
      multiAgent: { enabled: true, agentIds },
      createdAt: now,
      updatedAt: now,
      outlineId: 'xuanjia-demo-outline-quiz',
    },
  ];

  return { lesson, stage, scenes };
}

async function upsertUser(
  db: Queryable,
  args: {
    id: string;
    username: string;
    password: string;
    role: 'teacher' | 'student';
    displayName: string;
    now: number;
  },
): Promise<string> {
  const result = await db.query(
    `INSERT INTO users (id, username, password_hash, role, display_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       display_name = EXCLUDED.display_name
     RETURNING id`,
    [args.id, args.username, hashPassword(args.password), args.role, args.displayName, args.now],
  );
  const id = result.rows[0]?.id;
  if (typeof id !== 'string') throw new Error(`Failed to seed user: ${args.username}`);
  return id;
}

async function writeClassroomArtifact(
  dataDir: string,
  classroom: { stage: Stage; scenes: Scene[] },
): Promise<void> {
  const classroomsDir = path.join(dataDir, 'classrooms');
  await mkdir(classroomsDir, { recursive: true });
  const destination = path.join(classroomsDir, `${CLASSROOM_ID}.json`);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify(
      {
        id: CLASSROOM_ID,
        stage: classroom.stage,
        scenes: classroom.scenes,
        createdAt: new Date(classroom.stage.createdAt).toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );
  await rename(temporary, destination);
}

async function main(): Promise<void> {
  const dataDir = resolveAgentRuntimeDataDir(
    process.cwd(),
    process.env.OPENMAIC_DATA_DIR || '.xuanjia-test-data',
  );
  await mkdir(dataDir, { recursive: true });

  const pglite = new PGlite(path.join(dataDir, 'openmaic.pgdata'));
  await pglite.waitReady;
  const db: Queryable = {
    async query(text, params) {
      const result = await pglite.query<Record<string, unknown>>(text, params);
      return { rows: result.rows, rowCount: result.rows.length };
    },
  };

  try {
    await ensureAppSchema(db);
    const now = Date.now();
    const { lesson, stage, scenes } = buildDemoContent(now);

    await db.query('BEGIN');
    try {
      const teacherId = await upsertUser(db, {
        id: 'xuanjia-test-teacher',
        username: teacherUsername,
        password: teacherPassword,
        role: 'teacher',
        displayName: '玄甲测试教师',
        now,
      });
      const studentId = await upsertUser(db, {
        id: 'xuanjia-test-student',
        username: studentUsername,
        password: studentPassword,
        role: 'student',
        displayName: '玄甲测试学生',
        now,
      });
      const ownerKey = `acct:${teacherId}`;
      const learnerKey = `acct:${studentId}`;

      await db.query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [teacherId, studentId]);
      await db.query('DELETE FROM learning_events WHERE classroom_id = $1', [CLASSROOM_ID]);
      await db.query('DELETE FROM student_progress WHERE classroom_id = $1', [CLASSROOM_ID]);

      await db.query(
        `INSERT INTO app_courses (id, owner_key, title, description, course_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           owner_key = EXCLUDED.owner_key,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           course_code = EXCLUDED.course_code,
           updated_at = EXCLUDED.updated_at`,
        [
          COURSE_ID,
          ownerKey,
          '玄甲 SQL 注入攻防实训',
          '用于手工验收教师备课、学生学习、过程证据和学情回流的本地演示课程。',
          'XUANJIA-DEMO',
          now,
          now,
        ],
      );
      await db.query(
        `INSERT INTO app_lessons
           (id, owner_key, title, description, subject_profile, course_id, published_classroom_id, artifacts, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           owner_key = EXCLUDED.owner_key,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           subject_profile = EXCLUDED.subject_profile,
           course_id = EXCLUDED.course_id,
           published_classroom_id = EXCLUDED.published_classroom_id,
           artifacts = EXCLUDED.artifacts,
           updated_at = EXCLUDED.updated_at`,
        [
          LESSON_ID,
          ownerKey,
          lesson.title,
          lesson.description ?? null,
          lesson.subjectProfile ?? null,
          COURSE_ID,
          CLASSROOM_ID,
          JSON.stringify(lesson.artifacts),
          now,
          now,
        ],
      );
      await db.query(
        `INSERT INTO app_classrooms (id, owner_key, lesson_id, stage, scenes, visibility, created_at)
         VALUES ($1,$2,$3,$4,$5,'unlisted',$6)
         ON CONFLICT (id) DO UPDATE SET
           owner_key = EXCLUDED.owner_key,
           lesson_id = EXCLUDED.lesson_id,
           stage = EXCLUDED.stage,
           scenes = EXCLUDED.scenes,
           visibility = EXCLUDED.visibility`,
        [CLASSROOM_ID, ownerKey, LESSON_ID, JSON.stringify(stage), JSON.stringify(scenes), now],
      );

      await db.query('DELETE FROM course_lessons WHERE lesson_id = $1', [LESSON_ID]);
      await db.query(
        `INSERT INTO course_lessons (course_id, lesson_id, sort_order)
         VALUES ($1,$2,0)
         ON CONFLICT (course_id, lesson_id) DO UPDATE SET sort_order = 0`,
        [COURSE_ID, LESSON_ID],
      );
      await db.query('DELETE FROM course_enrollments WHERE course_id = $1', [COURSE_ID]);
      await db.query(
        'INSERT INTO course_enrollments (course_id, learner_key, enrolled_at) VALUES ($1,$2,$3)',
        [COURSE_ID, learnerKey, now],
      );
      await db.query('DELETE FROM classroom_enrollments WHERE classroom_id = $1', [CLASSROOM_ID]);
      await db.query(
        'INSERT INTO classroom_enrollments (classroom_id, learner_key, enrolled_at) VALUES ($1,$2,$3)',
        [CLASSROOM_ID, learnerKey, now],
      );
      await db.query('DELETE FROM learning_tasks WHERE id = $1', [TASK_ID]);
      await db.query(
        `INSERT INTO learning_tasks
           (id, owner_key, course_id, lesson_id, classroom_id, title, instructions, due_at, completion_rule, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$10)`,
        [
          TASK_ID,
          ownerKey,
          COURSE_ID,
          LESSON_ID,
          CLASSROOM_ID,
          '完成 SQL 注入攻防基础学习',
          '依次学习攻击面课件并完成修复策略测验；重点解释为什么参数化查询能从根因上阻断注入。',
          now + 7 * 24 * 60 * 60 * 1000,
          JSON.stringify({ requireAllScenes: true, minQuizScore: 60 }),
          now,
        ],
      );

      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

    await writeClassroomArtifact(dataDir, { stage, scenes });
    console.log(`玄甲测试数据已就绪：${dataDir}`);
    console.log(`演示课程：玄甲 SQL 注入攻防实训（${CLASSROOM_ID}）`);
  } finally {
    await pglite.close();
  }
}

main().catch((error) => {
  console.error('玄甲测试数据初始化失败：', error);
  process.exitCode = 1;
});
