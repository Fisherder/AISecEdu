import { expect, test } from '@playwright/test';

const serviceToken = 'e2e-student-runtime-service-token';

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'X-AISecEdu-Service-Token': serviceToken });
});

const authUser = (role: 'teacher' | 'student') => ({
  success: true,
  user: {
    id: `${role}-e2e`,
    username: `${role}-e2e`,
    role,
    displayName: role === 'teacher' ? '闭环测试教师' : '闭环测试学生',
  },
});

test('teacher assigns a published classroom and sees cohort task state', async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: authUser('teacher') }));
  await page.route('**/api/courses/course-e2e', (route) =>
    route.fulfill({
      json: {
        success: true,
        course: { id: 'course-e2e', title: '软件安全', description: '课程', course_code: 'SEC-01' },
        lessons: [
          {
            id: 'lesson-e2e',
            title: 'SQL 注入课堂',
            published_classroom_id: 'classroom-e2e',
            sort_order: 0,
          },
        ],
        students: [
          { learner_key: 'acct:student-e2e', display_name: '闭环测试学生', enrolled_at: 1 },
        ],
      },
    }),
  );
  await page.route('**/api/lessons', (route) =>
    route.fulfill({
      json: { success: true, lessons: [{ id: 'lesson-e2e', title: 'SQL 注入课堂' }] },
    }),
  );
  await page.route('**/api/teacher/tasks**', async (route) => {
    if (route.request().method() === 'POST') {
      createdBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: { success: true, id: 'task-e2e' } });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        tasks: createdBody
          ? [
              {
                id: 'task-e2e',
                title: createdBody.title,
                instructions: createdBody.instructions,
                lessonId: 'lesson-e2e',
                lessonTitle: 'SQL 注入课堂',
                classroomId: 'classroom-e2e',
                dueAt: null,
                status: 'active',
                completionRule: { requireAllScenes: true, minQuizScore: 60 },
                summary: {
                  learnerCount: 1,
                  notStartedCount: 1,
                  inProgressCount: 0,
                  completedCount: 0,
                  overdueCount: 0,
                },
                students: [
                  {
                    learnerKey: 'acct:student-e2e',
                    displayName: '闭环测试学生',
                    progress: {
                      state: 'not-started',
                      completionRate: 0,
                      completedScenes: 0,
                      totalScenes: 2,
                      averageQuizScore: null,
                      overdue: false,
                    },
                  },
                ],
              },
            ]
          : [],
      },
    });
  });

  await page.goto('/teacher/courses/course-e2e');
  await expect(page.getByRole('heading', { name: '软件安全' })).toBeVisible();
  await page.getByRole('combobox', { name: '选择已发布课堂' }).selectOption('lesson-e2e');
  await page.getByPlaceholder('任务标题（留空则沿用课堂标题）').fill('完成 SQL 注入防御练习');
  await page
    .getByPlaceholder('给学生的任务说明、重点或交付要求（可选）')
    .fill('完成两个场景并通过测验。');
  await page.getByLabel('测验要求').selectOption('60');
  await page.getByRole('button', { name: '布置任务' }).click();

  await expect.poll(() => createdBody).not.toBeNull();
  expect(createdBody).toMatchObject({
    courseId: 'course-e2e',
    lessonId: 'lesson-e2e',
    minQuizScore: 60,
  });
  await expect(page.getByText('完成 SQL 注入防御练习')).toBeVisible();
  await expect(page.getByText('0/1 人完成')).toBeVisible();
});

test('student task state refreshes from classroom evidence', async ({ page }) => {
  let completed = false;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: authUser('student') }));
  await page.route('**/api/student/tasks', (route) =>
    route.fulfill({
      json: {
        success: true,
        tasks: [
          {
            id: 'task-e2e',
            title: '完成 SQL 注入防御练习',
            instructions: '完成两个场景。',
            courseTitle: '软件安全',
            lessonTitle: 'SQL 注入课堂',
            classroomId: 'classroom-e2e',
            dueAt: null,
            completionRule: { requireAllScenes: true, minQuizScore: 60 },
            progress: completed
              ? {
                  state: 'completed',
                  completionRate: 1,
                  completedScenes: 2,
                  totalScenes: 2,
                  averageQuizScore: 80,
                  overdue: false,
                }
              : {
                  state: 'not-started',
                  completionRate: 0,
                  completedScenes: 0,
                  totalScenes: 2,
                  averageQuizScore: null,
                  overdue: false,
                },
          },
        ],
      },
    }),
  );
  await page.route('**/api/student/tasks/task-e2e', async (route) => {
    completed = true;
    await route.fulfill({
      json: { success: true, taskId: 'task-e2e', classroomId: 'classroom-e2e' },
    });
  });

  await page.goto('/student/tasks');
  await expect(page.getByRole('heading', { name: '我的学习任务' })).toBeVisible();
  await expect(page.getByText('未开始', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '检查' }).click();
  await expect(page.getByText('已完成', { exact: true })).toBeVisible();
  await expect(page.getByText('80 分')).toBeVisible();
});

test('student generates a personal package and receives formative review', async ({ page }) => {
  let packageCreated = false;
  let reviewCreated = false;
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: authUser('student') }));
  const learningState = {
    profile: {
      learningGoal: '掌握 Web 安全基础',
      level: 'beginner',
      preferences: { explanationStyle: 'guided', sessionMinutes: 30 },
      memory: [],
    },
    insight: {
      state: 'on-track',
      completionRate: 0.25,
      completedScenes: 1,
      totalScenes: 4,
      averageQuizScore: null,
      nextAction: { title: '完成情境判断', reason: '需要补充迁移证据' },
    },
    courses: [],
    tasks: [],
    packages: [],
    plans: [],
    activeContext: {},
  };
  await page.route('**/api/student/agent**', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      expect(body.message).toBe(
        '帮我生成一个 30 分钟、可直接进入学习的个人学习包，并结合我的薄弱点安排内容。',
      );
      packageCreated = true;
      await route.fulfill({
        status: 201,
        json: {
          success: true,
          thread: {
            id: 'thread-e2e',
            title: 'XSS 个人学习包',
            activeContext: {},
            updatedAt: Date.now(),
          },
          userMessage: {
            id: 'user-e2e',
            role: 'user',
            content: body.message,
            metadata: {},
            createdAt: Date.now(),
          },
          assistantMessage: {
            id: 'assistant-e2e',
            role: 'assistant',
            content: '已根据你的薄弱点创建一个 30 分钟个人学习包。',
            metadata: {
              action: 'generate_package',
              source: 'model',
              generatedPackage: {
                id: 'study-e2e',
                title: 'XSS 输出编码自学包',
                classroomId: 'self-classroom-e2e',
              },
              trace: [
                { label: '结合学习证据', detail: '围绕输出上下文安排内容', status: 'completed' },
              ],
            },
            createdAt: Date.now(),
          },
          learningState: {
            ...learningState,
            packages: [
              {
                id: 'study-e2e',
                title: 'XSS 输出编码自学包',
                goal: '理解 XSS 输出编码',
                classroomId: 'self-classroom-e2e',
                status: 'ready',
              },
            ],
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: { success: true, threads: [], thread: null, messages: [], learningState },
    });
  });

  await page.goto('/student/self-study');
  await page.getByRole('button', { name: '生成学习包' }).click();
  await expect(page.getByText('XSS 输出编码自学包')).toBeVisible();
  await expect(page.getByRole('link', { name: /XSS 输出编码自学包/ })).toHaveAttribute(
    'href',
    '/classroom/self-classroom-e2e',
  );
  expect(packageCreated).toBe(true);

  const review = {
    summary: '你已建立输出编码的基础证据，下一步应完成情境迁移。',
    strengths: ['能够解释基本原理。'],
    focusAreas: ['需要增加属性上下文证据。'],
    nextSteps: ['完成一组属性编码情境题。'],
    evidenceNote: '依据1个完成场景。',
    disclaimer: '本评价仅用于形成性学习反馈，不作为正式成绩。',
  };
  await page.route('**/api/student/review', async (route) => {
    if (route.request().method() === 'POST') {
      reviewCreated = true;
      await route.fulfill({ status: 201, json: { success: true, review, source: 'ai' } });
      return;
    }
    await route.fulfill({
      json: {
        success: true,
        latest: reviewCreated ? { id: 'review-e2e', review, source: 'ai', createdAt: 1 } : null,
        reviews: reviewCreated ? [{ id: 'review-e2e', review, source: 'ai', createdAt: 1 }] : [],
        currentEvidence: {
          completionRate: 0.5,
          completedScenes: 1,
          totalScenes: 2,
          averageQuizScore: null,
          quizAttemptCount: 0,
          evidenceEventCount: 1,
          capabilities: [],
        },
      },
    });
  });
  await page.goto('/student/review');
  await page.getByRole('button', { name: '生成第一次评价' }).click();
  await expect(page.getByText('你已建立输出编码的基础证据，下一步应完成情境迁移。')).toBeVisible();
  await expect(page.getByText('本评价仅用于形成性学习反馈，不作为正式成绩。')).toBeVisible();
});

test('student course library and learner-controlled memory form a complete personal workspace', async ({
  page,
}) => {
  let savedGoal = '能够独立解释栈溢出根因';
  let memory = ['我更喜欢先看具体示例'];
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: authUser('student') }));
  await page.route('**/api/student/dashboard', (route) =>
    route.fulfill({
      json: {
        success: true,
        learner: { id: 'student-e2e', username: 'student-e2e', displayName: '闭环测试学生' },
        summary: {
          courseCount: 1,
          publishedLessonCount: 1,
          evidenceEventCount: 3,
          state: 'on-track',
          completionRate: 0.5,
          averageQuizScore: 80,
        },
        insight: {
          state: 'on-track',
          completionRate: 0.5,
          completedScenes: 1,
          totalScenes: 2,
          averageQuizScore: 80,
          quizAttemptCount: 1,
          capabilities: [],
          weakestCapability: null,
          nextAction: { kind: 'continue', title: '继续章节', reason: '补齐实践证据' },
          lastActiveAt: 1,
        },
        courses: [
          {
            id: 'course-e2e',
            title: '软件安全',
            description: '从原理到实践',
            courseCode: 'SEC-01',
            state: 'on-track',
            completionRate: 0.5,
            completedScenes: 1,
            totalScenes: 2,
            averageQuizScore: 80,
            lessons: [
              {
                id: 'lesson-e2e',
                title: '缓冲区溢出基础',
                classroomId: 'classroom-e2e',
                order: 1,
                state: 'on-track',
                completionRate: 0.5,
                completedScenes: 1,
                totalScenes: 2,
                averageQuizScore: 80,
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route('**/api/student/self-study', (route) =>
    route.fulfill({
      json: {
        success: true,
        sessions: [
          {
            id: 'package-e2e',
            goal: '复习边界检查',
            title: '边界检查个人学习包',
            level: 'intermediate',
            durationMinutes: 30,
            classroomId: 'personal-room-e2e',
            status: 'ready',
            progress: {
              state: 'not-started',
              completionRate: 0,
              completedScenes: 0,
              totalScenes: 2,
              averageQuizScore: null,
            },
            createdAt: 1,
          },
        ],
      },
    }),
  );
  await page.route('**/api/student/profile', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (typeof body.forgetFact === 'string') {
        memory = memory.filter((fact) => fact !== body.forgetFact);
      } else if (typeof body.learningGoal === 'string') {
        savedGoal = body.learningGoal;
      }
    }
    await route.fulfill({
      json: {
        success: true,
        profile: {
          learningGoal: savedGoal,
          level: 'intermediate',
          preferences: {
            explanationStyle: 'guided',
            challengeLevel: 'adaptive',
            sessionMinutes: 30,
          },
          memory,
          updatedAt: Date.now(),
        },
        plans: [],
      },
    });
  });

  await page.goto('/student/courses');
  await expect(page.getByRole('heading', { name: '我的课程与学习内容' })).toBeVisible();
  await expect(page.getByText('软件安全', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /缓冲区溢出基础/ })).toHaveAttribute(
    'href',
    '/classroom/classroom-e2e',
  );
  await expect(page.getByText('边界检查个人学习包')).toBeVisible();
  await expect(page.getByRole('link', { name: '进入学习包' })).toHaveAttribute(
    'href',
    '/classroom/personal-room-e2e',
  );

  await page.goto('/student/profile');
  await expect(page.getByRole('heading', { name: '学习偏好与智能体记忆' })).toBeVisible();
  await expect(page.getByText('我更喜欢先看具体示例')).toBeVisible();
  await page.getByLabel('长期学习目标').fill('能够独立完成漏洞分析并解释证据');
  await page.getByRole('button', { name: '保存学习偏好' }).click();
  await expect(page.getByText('学习偏好已保存，下一轮对话会自动使用。')).toBeVisible();
  expect(savedGoal).toBe('能够独立完成漏洞分析并解释证据');
  await page.getByRole('button', { name: '忘记：我更喜欢先看具体示例' }).click();
  await expect(page.getByText('我更喜欢先看具体示例')).toHaveCount(0);
});
