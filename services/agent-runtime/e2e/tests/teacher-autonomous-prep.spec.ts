import { expect, test } from '@playwright/test';

test('teacher reviews and generates an AI-selected mixed teaching package', async ({ page }) => {
  const generated: Array<{ type: string; title: string }> = [];

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: {
          id: 'teacher-e2e',
          username: 'teacher-e2e',
          role: 'teacher',
          displayName: '端到端教师',
        },
      }),
    }),
  );

  await page.route('**/api/security/teaching-plan', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      topic: 'SQL 注入攻击面与纵深防御',
      courseId: '软件安全',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        plan: {
          title: 'SQL 注入攻击面与纵深防御',
          summary: '从请求链路、漏洞复现到防御验证的混合教学包。',
          audience: '已掌握 HTTP 与 SQL 基础的大二学生',
          learningObjectives: ['识别不可信输入链路', '使用参数化查询完成修复'],
          decisionSummary: '先用图示建立心智模型，再进入实验，最后以测验评价。',
          safetyNotes: ['实验仅限授权隔离环境。'],
          totalMinutes: 70,
          source: 'ai',
          items: [
            {
              id: 'plan-slide',
              type: 'slide',
              title: 'SQL 注入的根因与攻击面',
              purpose: '建立概念基础',
              reason: '学生需要统一术语',
              keyPoints: ['不可信输入', 'SQL 拼接'],
              estimatedMinutes: 12,
              quality: 'fast',
            },
            {
              id: 'plan-diagram',
              type: 'diagram',
              title: '请求到数据库的信任边界',
              purpose: '看清攻击链路',
              reason: '多层数据流适合可视化',
              keyPoints: ['浏览器', '应用', '数据库'],
              estimatedMinutes: 10,
              quality: 'fast',
            },
            {
              id: 'plan-lab',
              type: 'vulnerable-lab',
              title: '登录绕过与参数化修复实验',
              purpose: '完成攻防闭环',
              reason: '需要动手验证修复效果',
              keyPoints: ['授权边界', '检测', '修复', '回归'],
              estimatedMinutes: 35,
              quality: 'rich',
            },
            {
              id: 'plan-debate',
              type: 'debate',
              title: '生产漏洞应立即公开还是协调披露？',
              purpose: '分析披露责任',
              reason: '存在公共利益与修复窗口的真实冲突',
              keyPoints: ['用户风险', '修复窗口'],
              estimatedMinutes: 13,
              quality: 'fast',
            },
          ],
        },
      }),
    });
  });

  await page.route('**/api/lessons', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, id: 'e2e-autonomous-plan' }),
    }),
  );

  await page.route('**/api/lessons/e2e-autonomous-plan/artifacts', async (route) => {
    const body = route.request().postDataJSON() as { type: string; title: string };
    generated.push({ type: body.type, title: body.title });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, artifact: { id: `artifact-${body.type}` } }),
    });
  });

  await page.route('**/api/lessons/e2e-autonomous-plan', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        lesson: {
          id: 'e2e-autonomous-plan',
          title: 'SQL 注入攻击面与纵深防御',
          artifacts: [],
          createdAt: 1,
          updatedAt: 1,
        },
      }),
    }),
  );

  await page.goto('/teacher/prep');
  await expect(page.getByRole('heading', { name: 'AI 自主备课编排' })).toBeVisible();
  await page.getByTestId('teaching-topic-input').fill('SQL 注入攻击面与纵深防御');
  await page
    .getByTestId('teaching-description-input')
    .fill('面向大二学生，要理解攻击链并在隔离环境完成检测、修复与披露责任讨论。');
  await page.getByRole('combobox').selectOption('软件安全');
  await page.getByTestId('start-teaching-plan-button').click();

  await expect(page.getByTestId('teaching-plan-review')).toBeVisible();
  await expect(page.getByTestId('teaching-plan-source')).toHaveText('模型规划');
  await expect(page.getByTestId('plan-item-slide')).toBeVisible();
  await expect(page.getByTestId('plan-item-diagram')).toBeVisible();
  await expect(page.getByTestId('plan-item-vulnerable-lab')).toBeVisible();
  await expect(page.getByTestId('plan-item-debate')).toBeVisible();
  await expect(page.getByTestId('generate-plan-button')).toContainText('生成 4 项内容');

  await page.getByLabel('课件标题').fill('SQL 注入核心原理（教师修订）');
  await page.getByTestId('generate-plan-button').click();

  await expect(page).toHaveURL(/\/teacher\/prep\/e2e-autonomous-plan$/);
  expect(generated).toEqual([
    { type: 'slide', title: 'SQL 注入核心原理（教师修订）' },
    { type: 'diagram', title: '请求到数据库的信任边界' },
    { type: 'vulnerable-lab', title: '登录绕过与参数化修复实验' },
    { type: 'debate', title: '生产漏洞应立即公开还是协调披露？' },
  ]);
});
