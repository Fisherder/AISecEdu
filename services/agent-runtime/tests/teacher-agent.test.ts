import { describe, expect, it } from 'vitest';
import path from 'path';
import { listAgentSkills, loadAgentSkills } from '@/lib/server/agent-skills';
import {
  enforceTeacherGenerationOptions,
  enforceTeacherQuestionBatchContract,
  fallbackTeacherAgentDeliverables,
  fallbackTeacherGenerationOptions,
  missingTeacherAgentDeliverableFormats,
  normalizeTeacherGenerationOptions,
  normalizeTeacherAgentPlan,
  normalizeTeacherAgentResult,
  requiredTeacherAgentDeliverableFormats,
  requestedQuestionCount,
  teacherAgentDeliverableQualityIssue,
  teacherAgentDeliverableClosureSystem,
  teacherAgentExecutionSystem,
  teacherAgentPlanningSystem,
} from '@/lib/server/teacher-agent';

process.env.AISECEDU_AGENT_SKILLS_DIR = path.resolve(process.cwd(), '../../agent_skills');

describe('teacher agent skills', () => {
  it('discovers vendored and project teaching skills with progressive disclosure', () => {
    const catalog = listAgentSkills();
    const names = catalog.map((skill) => skill.name);
    expect(names).toHaveLength(19);
    expect(names).not.toContain('openmaic');
    expect(names).toContain('pdf');
    expect(names).toContain('jupyter-notebook');
    expect(names).toContain('course-material-analysis');
    expect(names).toContain('lesson-plan-file');
    expect(names).toContain('ctf-flag-challenge');
    expect(names).toContain('downloadable-file-delivery');
    expect(names).toContain('backwards-design-unit-planner');
    expect(names).toContain('assessment-validity-checker');
    expect(names).toContain('udl-lesson-auditor');

    const planningPrompt = teacherAgentPlanningSystem(catalog);
    expect(planningPrompt).toContain('lesson-plan-file');
    expect(planningPrompt).not.toContain('# Lesson plan file');

    const selected = loadAgentSkills(['lesson-plan-file', 'downloadable-file-delivery']);
    const executionPrompt = teacherAgentExecutionSystem(selected);
    expect(executionPrompt).toContain('# Lesson plan file');
    expect(executionPrompt).toContain('# Downloadable file delivery');
    expect(executionPrompt).toContain('context.agentLoop.trace');
    expect(executionPrompt).toContain('status=verified');
    expect(executionPrompt).toContain('不得从自然语言关键词推断确认');
    expect(executionPrompt).toContain('一次 assignment.generate');
    expect(executionPrompt).toContain('questionCount=3');
    expect(executionPrompt).toContain('中文数词、全角数字或阿拉伯数字');
    expect(executionPrompt).toContain('绝不能静默少生成');
    expect(executionPrompt).toContain('动态 Flag');
    expect(executionPrompt).toContain('不得虚构动态 Flag');
    expect(executionPrompt).toContain('CTF 实践题必须拥有独立隔离环境与动态 Flag');
    expect(executionPrompt).toContain('constraints.exerciseMode=SIMULATION');
    expect(executionPrompt).toContain('每道题各自成为一个任务');
    expect(executionPrompt).toContain('challengeCount=5');
    expect(executionPrompt).toContain('challenge.revise(draftIds, instruction)');
    expect(executionPrompt).toContain('复用、改编或新建策略由后端');
    expect(executionPrompt).toContain('不得输出、询问或向教师解释内部 L1/L2/L3');
    expect(executionPrompt).not.toContain('challenge.generate(moduleIndex, brief, level?');
    expect(executionPrompt).toContain('供教师预览、编辑、讲解并发布到课堂');
    expect(executionPrompt).toContain('slide-deck（页面式课件）');
    expect(executionPrompt).toContain('不得自造 courseware、slides、demo 等同义类型');
    expect(executionPrompt).toContain('先选方案、后正式生成');
    expect(executionPrompt).toContain('恰好包含 3 个实质不同的方案');
    expect(executionPrompt).toContain('完整 rewrittenPrompt');
    expect(executionPrompt).toContain('默认 12–15 个完整教学页面');
    expect(executionPrompt).toContain('优先 14 页');
    expect(executionPrompt).toContain('不得用通用默认覆盖');
    expect(executionPrompt).toContain('assignment.publish(assignmentId)');
    expect(executionPrompt).toContain('“验证并发布”必须只调用 artifact.request_publish');
    expect(executionPrompt).toContain('明确要求打开或查看页面时导航');
    expect(executionPrompt).toContain('不得让教师理解或补填内部 ID');
    expect(executionPrompt).toContain('platformFacts.assignments.recent');
    expect(executionPrompt).toContain('material.apply_chapters(materialId, chapterIndexes)');
    expect(executionPrompt).toContain(
      'material.add_to_module(materialId, referenceId, moduleIndex, name?)',
    );
    expect(executionPrompt).toContain('platformFacts.pendingAttachments');
    expect(executionPrompt).toContain('不得改成生成课件、创建章节或 material.apply_chapters');
    expect(executionPrompt).toContain('不要把它降级为若干 module.create');
    expect(executionPrompt).toContain('分析、总结和建议可以直接完成');
    expect(executionPrompt).toContain('点击后原样写入输入框');
    expect(executionPrompt).toContain('严格使用“帮我 + 动作 + 明确对象/结果”的结构');
    expect(executionPrompt).toContain('禁止使用“如果需要我”“如需我”“我可以”“我也可以”');
    expect(executionPrompt).toContain('禁止 Markdown 代码围栏、空 body、空 document');
    expect(executionPrompt).toContain('classroom.request_start(sessionId)');
    expect(executionPrompt.lastIndexOf('只输出合法 JSON')).toBeGreaterThan(
      executionPrompt.indexOf('# Lesson plan file'),
    );
  });

  it('keeps the model-selected plan instead of applying an intent classifier', () => {
    const catalog = listAgentSkills();
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '分析指定 PDF，并交付一份可下载的教案文件。',
        selectedSkills: [
          'course-material-analysis',
          'lesson-plan-file',
          'downloadable-file-delivery',
          'not-installed',
        ],
        plan: ['读取材料证据', '完成分析', '生成 DOCX 文件'],
        generationTarget: null,
      },
      catalog,
    );
    expect(plan.selectedSkills).toEqual([
      'course-material-analysis',
      'lesson-plan-file',
      'downloadable-file-delivery',
    ]);
    expect(plan.plan).toHaveLength(3);
    expect(plan.generationTarget).toBeNull();
  });

  it('always loads the production skill implied by the semantic generation target', () => {
    const catalog = listAgentSkills();
    const cases = [
      ['slide-deck', 'candidate.generate', 'teaching-slide-deck'],
      ['ctf-challenge', 'challenge.generate', 'ctf-flag-challenge'],
      ['simulation', 'candidate.generate', 'cyber-lab-simulation'],
      ['attack-defense-scene', 'candidate.generate', 'cyber-lab-simulation'],
      ['debate', 'candidate.generate', 'backwards-design-unit-planner'],
      ['roleplay', 'candidate.generate', 'backwards-design-unit-planner'],
    ] as const;

    for (const [artifactType, targetTool, skill] of cases) {
      const plan = normalizeTeacherAgentPlan(
        {
          understanding: `生成 ${artifactType}`,
          selectedSkills: ['backwards-design-unit-planner'],
          plan: ['设计并验证产物'],
          generationTarget: { targetTool, artifactType, reason: '教师要求正式生成' },
        },
        catalog,
      );
      expect(plan.selectedSkills[0]).toBe(skill);
      expect(plan.selectedSkills).toContain('backwards-design-unit-planner');
    }
  });

  it('keeps explicit AI debate and roleplay activities as distinct native artifacts', () => {
    const debatePrompt =
      '为当前章节设计一次漏洞披露边界 AI 交互与辩论，包含角色立场、三轮交锋和评价量规。';
    const driftedPlan = normalizeTeacherAgentPlan(
      {
        understanding: '生成 AI 辩论活动',
        selectedSkills: ['backwards-design-unit-planner'],
        plan: ['准备候选方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'simulation',
          reason: '模型误判为模拟',
        },
      },
      listAgentSkills(),
    );
    const correctedDebate = enforceTeacherGenerationOptions(debatePrompt, driftedPlan, {});
    const debateOptions = correctedDebate.generationOptions as {
      artifactType: string;
      options: Array<{ rewrittenPrompt: string }>;
    };
    expect(debateOptions.artifactType).toBe('debate');
    expect(debateOptions.options).toHaveLength(3);
    expect(debateOptions.options.every((option) => option.rewrittenPrompt.includes('辩论'))).toBe(
      true,
    );

    const recoveredFromDocumentDrift = enforceTeacherGenerationOptions(debatePrompt, null, {
      answer: '已生成可下载的辩论内容稿。',
      deliverables: [{ filename: '辩论内容稿.docx', format: 'docx' }],
      toolProposals: [],
    });
    expect(
      (recoveredFromDocumentDrift.generationOptions as { artifactType: string }).artifactType,
    ).toBe('debate');
    expect(recoveredFromDocumentDrift.deliverables).toEqual([]);

    const roleplayPrompt = '为当前章节生成一次应急响应角色扮演，包含三幕互动和表现评价。';
    const correctedRoleplay = enforceTeacherGenerationOptions(roleplayPrompt, driftedPlan, {});
    const roleplayOptions = correctedRoleplay.generationOptions as {
      artifactType: string;
      options: Array<{ rewrittenPrompt: string }>;
    };
    expect(roleplayOptions.artifactType).toBe('roleplay');
    expect(roleplayOptions.options).toHaveLength(3);
    expect(
      roleplayOptions.options.every((option) => option.rewrittenPrompt.includes('角色扮演')),
    ).toBe(true);
  });

  it('routes an automatically scored student simulation through three selectable challenge plans', () => {
    const prompt =
      '在当前章节生成一题可自动评分的无线网络异常模拟实训题，题目名称必须严格使用《无线接入异常诊断 8f31ad》：学生需要查看拓扑、扫描频谱、检查客户端、形成可证伪的同频干扰假设、调整信道并验证服务恢复；这是一道可完成和自动评分的情境题，不是普通展示课件。';
    const result = enforceTeacherGenerationOptions(
      prompt,
      {
        understanding: '生成学生自动评分模拟题',
        selectedSkills: ['cyber-lab-simulation'],
        plan: ['创建场景和评分任务'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'simulation',
          reason: '模型误判为教师演示',
        },
        generationScope: {
          status: 'bound',
          boundScope: {
            referenceId: 'wireless-security',
            moduleIndex: 2,
            courseName: '无线安全',
            moduleName: '异常处置',
          },
          reason: '当前章节唯一',
        },
      },
      {
        generationOptions: fallbackTeacherGenerationOptions(
          prompt,
          {
            understanding: '生成模拟演示',
            selectedSkills: [],
            plan: [],
            generationTarget: {
              targetTool: 'candidate.generate',
              artifactType: 'simulation',
              reason: '模型误判为教师演示',
            },
          },
          {},
        ),
      },
    );
    expect(result.deliverables).toEqual([]);
    expect(result.toolProposals).toEqual([]);
    const options = result.generationOptions as {
      targetTool: string;
      artifactType: string;
      boundScope: Record<string, unknown>;
      baseArguments: Record<string, unknown>;
      options: Array<{ rewrittenPrompt: string }>;
    };
    expect(options.targetTool).toBe('challenge.generate');
    expect(options.artifactType).toBe('ctf-challenge');
    expect(options.boundScope).toMatchObject({
      referenceId: 'wireless-security',
      moduleIndex: 2,
    });
    expect(options.baseArguments).toMatchObject({
      moduleIndex: 2,
      challengeCount: 1,
      constraints: {
        exerciseMode: 'SIMULATION',
        title: '无线接入异常诊断 8f31ad',
      },
    });
    expect(options.options).toHaveLength(3);
    expect(
      options.options.every(
        (option) =>
          option.rewrittenPrompt.includes('自动评分模拟题契约') &&
          option.rewrittenPrompt.includes('每道题必须成为独立任务'),
      ),
    ).toBe(true);
  });

  it('carries a uniquely resolved trusted course module into generation options', () => {
    const catalog = listAgentSkills();
    const platformFacts = {
      scope: { dojoId: null, moduleIndex: null },
      availableCourses: [
        {
          referenceId: 'software-security',
          name: '软件安全',
          modules: [
            { index: 0, name: '基础知识' },
            { index: 3, name: '缓冲区溢出' },
          ],
        },
        {
          referenceId: 'cryptography',
          name: '密码学',
          modules: [{ index: 0, name: '现代密码基础' }],
        },
      ],
    };
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '在软件安全课程的缓冲区溢出章节生成五道 CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['设计整批题目的三个候选方案'],
        generationTarget: {
          targetTool: 'challenge.generate',
          artifactType: 'ctf-challenge',
          reason: '教师要求生成原生 CTF',
        },
        generationScope: {
          status: 'bound',
          referenceId: 'software-security',
          moduleIndex: 3,
          courseName: '模型不能覆盖可信显示名',
          moduleName: '模型不能覆盖可信章节名',
          reason: '课程与章节都唯一匹配',
        },
      },
      catalog,
      platformFacts,
    );
    const enforced = enforceTeacherGenerationOptions(
      '请为课程“软件安全”的章节“缓冲区溢出”一次生成 5 道独立 CTF。',
      plan,
      {},
      platformFacts,
    );

    expect(plan.generationScope).toEqual({
      status: 'bound',
      boundScope: {
        referenceId: 'software-security',
        moduleIndex: 3,
        courseName: '软件安全',
        moduleName: '缓冲区溢出',
      },
      reason: '课程与章节都唯一匹配',
    });
    expect(enforced.generationOptions).toEqual(
      expect.objectContaining({
        boundScope: {
          referenceId: 'software-security',
          moduleIndex: 3,
          courseName: '软件安全',
          moduleName: '缓冲区溢出',
        },
        baseArguments: expect.objectContaining({ moduleIndex: 3, challengeCount: 5 }),
      }),
    );
  });

  it('rejects invented generation scope identifiers before execution', () => {
    const platformFacts = {
      availableCourses: [
        {
          referenceId: 'software-security',
          name: '软件安全',
          modules: [{ index: 0, name: '基础知识' }],
        },
      ],
    };

    expect(() =>
      normalizeTeacherAgentPlan(
        {
          understanding: '生成课件。',
          selectedSkills: [],
          plan: ['准备候选方案'],
          generationTarget: {
            targetTool: 'candidate.generate',
            artifactType: 'slide-deck',
            reason: '教师要求生成课件',
          },
          generationScope: {
            status: 'bound',
            referenceId: 'invented-course',
            moduleIndex: 99,
            reason: '模型猜测的作用域',
          },
        },
        listAgentSkills(),
        platformFacts,
      ),
    ).toThrow('invalid scope resolution');
  });

  it('asks for course scope instead of offering generation choices when scope is ambiguous', () => {
    const platformFacts = {
      scope: { dojoId: null, moduleIndex: null },
      availableCourses: [
        { referenceId: 'web-a', name: 'Web 安全', modules: [{ index: 0, name: '基础' }] },
        { referenceId: 'web-b', name: 'Web 安全', modules: [{ index: 0, name: '基础' }] },
      ],
    };
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '目标课程名称有两个可信匹配，需教师澄清。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['询问目标课程'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求生成课件',
        },
        generationScope: {
          status: 'ambiguous',
          reason: '同名课程无法唯一确定',
        },
      },
      listAgentSkills(),
      platformFacts,
    );
    const enforced = enforceTeacherGenerationOptions(
      '给 Web 安全课程生成课件。',
      plan,
      {},
      platformFacts,
    );

    expect(enforced.generationOptions).toBeUndefined();
    expect(enforced.requiresAction).toBe(false);
    expect(enforced.answer).toContain('唯一确定目标课程或章节');
  });

  it('uses the trusted thread course when the planner incorrectly marks a generic request unscoped', () => {
    const platformFacts = {
      scope: { dojoId: 42, moduleIndex: 1 },
      course: { referenceId: 'cryptography', name: '密码学' },
      availableCourses: [
        {
          referenceId: 'cryptography',
          name: '密码学',
          modules: [
            { index: 0, name: '密码基础' },
            { index: 1, name: '公钥密码' },
          ],
        },
      ],
    };
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成一份简洁的网络安全课件。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['准备三个候选方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求生成课件',
        },
        generationScope: {
          status: 'unscoped',
          reason: '模型忽略了当前会话范围',
        },
      },
      listAgentSkills(),
      platformFacts,
    );
    const enforced = enforceTeacherGenerationOptions(
      '生成一份简洁的网络安全课件。',
      plan,
      {},
      platformFacts,
    );

    expect((enforced.generationOptions as { options: unknown[] }).options).toHaveLength(3);
    expect(enforced.generationOptions).toEqual(
      expect.objectContaining({
        boundScope: {
          referenceId: 'cryptography',
          moduleIndex: 1,
          courseName: '密码学',
          moduleName: '公钥密码',
        },
      }),
    );
  });

  it('does not let a generic ambiguous planner result override the trusted thread scope', () => {
    const platformFacts = {
      scope: { dojoId: 42, moduleIndex: 0 },
      course: { referenceId: 'web-a', name: 'Web 安全' },
      availableCourses: [
        { referenceId: 'web-a', name: 'Web 安全', modules: [{ index: 0, name: '基础' }] },
        { referenceId: 'web-b', name: 'Web 安全', modules: [{ index: 0, name: '基础' }] },
      ],
    };
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '为当前章节生成课件。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['准备三个候选方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求生成课件',
        },
        generationScope: {
          status: 'ambiguous',
          reason: '模型忽略了当前会话范围',
        },
      },
      listAgentSkills(),
      platformFacts,
    );
    const enforced = enforceTeacherGenerationOptions(
      '为当前章节生成课件。',
      plan,
      {},
      platformFacts,
    );

    expect(enforced.generationOptions).toEqual(
      expect.objectContaining({
        boundScope: expect.objectContaining({ referenceId: 'web-a', moduleIndex: 0 }),
      }),
    );
  });

  it('keeps current scope protection when the teacher explicitly requests another course', () => {
    const platformFacts = {
      scope: { dojoId: 42, moduleIndex: 0 },
      course: { referenceId: 'cryptography', name: '密码学' },
      availableCourses: [
        {
          referenceId: 'cryptography',
          name: '密码学',
          modules: [{ index: 0, name: '公钥密码' }],
        },
        {
          referenceId: 'software-security',
          name: '软件安全',
          modules: [{ index: 0, name: '缓冲区溢出' }],
        },
      ],
    };
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '目标课程仍需澄清。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['询问目标课程'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求生成课件',
        },
        generationScope: {
          status: 'ambiguous',
          reason: '目标范围无法唯一确定',
        },
      },
      listAgentSkills(),
      platformFacts,
    );
    const enforced = enforceTeacherGenerationOptions(
      '给软件安全课程生成课件。',
      plan,
      {},
      platformFacts,
    );

    expect(enforced.generationOptions).toBeUndefined();
    expect(enforced.answer).toContain('唯一确定目标课程或章节');
  });

  it('normalizes exactly three detailed and distinct pre-generation options', () => {
    const normalized = normalizeTeacherGenerationOptions({
      targetTool: 'candidate.generate',
      artifactType: 'slide-deck',
      reason: '教师要求生成课件',
      options: [
        {
          title: '概念递进',
          description: '从先修知识逐层解释核心原理，并通过图示和检查问题形成完整的课堂认知路径。',
          highlights: ['逐层讲授', '即时检查'],
          rewrittenPrompt:
            '请生成一份概念递进式页面课件，保留教师全部原始要求，完整覆盖学习目标、核心概念、图示、示例、课堂检查、总结和教师使用说明，所有页面都必须有可直接授课的正文，禁止只返回目录或占位内容。',
        },
        {
          title: '案例驱动',
          description: '以真实且授权的完整案例贯穿现象、证据、原理、修复和迁移练习，强化知识应用。',
          highlights: ['同一案例贯穿', '包含修复复盘'],
          rewrittenPrompt:
            '请生成一份案例驱动式页面课件，以一个授权安全案例贯穿全部教学内容，完整呈现现象、证据、原理、错误做法、修复步骤、迁移问题和课堂反馈，保留教师原始约束并提供可直接使用的页面正文。',
        },
        {
          title: '任务挑战',
          description: '把知识组织为连续任务，让学生通过预测、讨论、判断和反馈主动完成课堂学习。',
          highlights: ['连续课堂任务', '明确学生动作'],
          rewrittenPrompt:
            '请生成一份任务挑战式页面课件，把教师要求转化为连续且可执行的课堂任务，逐页给出学生动作、教师提示、预计时间、反馈标准、知识讲解和总结迁移，内容必须完整、可授课、可核验，不得使用占位符。',
        },
      ],
    });

    expect(normalized?.options).toHaveLength(3);
    expect(normalized?.options.map((option) => option.id)).toEqual([
      'option-1',
      'option-2',
      'option-3',
    ]);
    expect(new Set(normalized?.options.map((option) => option.rewrittenPrompt)).size).toBe(3);
  });

  it('replaces premature formal generation with three safe fallback choices', () => {
    const prompt = '在当前章节生成一道弱随机数攻击 CTF，最终拿到 Flag。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成动态 Flag 验证的 CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['准备三套候选方案供教师选择'],
        generationTarget: {
          targetTool: 'challenge.generate',
          artifactType: 'ctf-challenge',
          reason: '教师要求新生成 CTF',
        },
      },
      listAgentSkills(),
    );
    const premature = {
      answer: '已经开始生成。',
      suggestions: ['继续'],
      toolProposals: [
        {
          tool: 'challenge.generate',
          arguments: { moduleIndex: 2, brief: prompt },
          reason: '生成 CTF',
        },
      ],
    };
    const fallback = fallbackTeacherGenerationOptions(prompt, plan, premature);
    const enforced = enforceTeacherGenerationOptions(prompt, plan, premature);

    expect(fallback?.options).toHaveLength(3);
    expect(fallback?.baseArguments).toEqual({ moduleIndex: 2 });
    for (const option of fallback?.options || []) {
      expect(option.rewrittenPrompt).toContain('动态 Flag');
      expect(option.rewrittenPrompt).toContain('不得以 JSON');
    }
    expect(enforced.toolProposals).toEqual([]);
    expect(enforced.generationOptions).toEqual(fallback);
    expect(enforced.answer).toContain('选择后才会开始正式生成');
  });

  it('repairs a topology-and-dual-role attack-defense request that a planner labels as simulation', () => {
    const prompt =
      '为当前章节生成一个仅在隔离环境运行的 SQL 注入攻防演示实验，至少包含两个连续可操作阶段：攻击线索/漏洞实验和防守修复/验证模拟；每个阶段都有攻击者与防守者角色、拓扑、证据面板、重置方法和安全边界。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成可操作的攻防演示。',
        selectedSkills: ['cyber-lab-simulation'],
        plan: ['准备三个生成方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'simulation',
          reason: '教师要求可操作模拟',
        },
      },
      listAgentSkills(),
    );

    const enforced = enforceTeacherGenerationOptions(prompt, plan, {});
    const options = enforced.generationOptions as {
      artifactType: string;
      options: Array<{ rewrittenPrompt: string }>;
    };

    expect(options.artifactType).toBe('attack-defense-scene');
    expect(options.options).toHaveLength(3);
    for (const option of options.options) {
      expect(option.rewrittenPrompt).toContain('attack-defense-scene');
      expect(option.rewrittenPrompt).toContain('vulnerable-lab');
      expect(option.rewrittenPrompt).toContain('防守验证 simulation');
    }
  });

  it('keeps a normal parameter simulation as simulation when no topology-and-role contract exists', () => {
    const prompt =
      '为当前章节生成 SQL 注入检测模拟练习，包含攻击强度滑杆、参数化查询开关、即时反馈、评分标准、复盘和一键重置。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成可操作模拟练习。',
        selectedSkills: ['cyber-lab-simulation'],
        plan: ['准备三个生成方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'simulation',
          reason: '教师要求参数化模拟',
        },
      },
      listAgentSkills(),
    );

    const enforced = enforceTeacherGenerationOptions(prompt, plan, {});
    expect((enforced.generationOptions as { artifactType: string }).artifactType).toBe(
      'simulation',
    );
  });

  it('recovers a previewable teacher simulation from downloadable-document drift', () => {
    const prompt =
      '为当前章节正式生成一项可在平台内预览、编辑并发布到课堂的SQL注入检测模拟练习；不要生成下载文件。至少包含两个连续可操作场景、三个判断/处置决策、即时反馈、评分标准、复盘以及一键重置。';
    const recovered = enforceTeacherGenerationOptions(prompt, null, {
      answer: '已完成并生成一份 docx 文档。',
      deliverables: [{ filename: 'SQL注入检测模拟.docx', format: 'docx' }],
      toolProposals: [],
    });
    const options = recovered.generationOptions as {
      artifactType: string;
      options: Array<{ rewrittenPrompt: string }>;
    };

    expect(options.artifactType).toBe('simulation');
    expect(options.options).toHaveLength(3);
    expect(
      options.options.every((option) => option.rewrittenPrompt.includes('可操作的模拟实训演示')),
    ).toBe(true);
    expect(recovered.deliverables).toEqual([]);
  });

  it('recovers the concise previewable simulation request used by the live teacher flow', () => {
    const prompt =
      '为当前章节生成一项可在平台内预览、编辑并发布到课堂的SQL注入检测模拟练习；不要生成下载文件；包含即时反馈、评分标准和复盘。';
    const driftedPlan = normalizeTeacherAgentPlan(
      {
        understanding: '错误地把请求理解为可编辑的 Word 教案。',
        selectedSkills: ['lesson-plan-file', 'downloadable-file-delivery'],
        plan: ['输出 Word 源稿'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '模型错误地将模拟练习改成课件文件。',
        },
      },
      listAgentSkills(),
    );
    const recovered = enforceTeacherGenerationOptions(prompt, null, {
      answer: '已按要求整理为可编辑 Word 源稿。',
      deliverables: [{ filename: 'SQL注入检测模拟.docx', format: 'docx' }],
      toolProposals: [],
    });
    const correctedDrift = enforceTeacherGenerationOptions(prompt, driftedPlan, {
      answer: '已按要求整理为可编辑 Word 源稿。',
      deliverables: [{ filename: 'SQL注入检测模拟.docx', format: 'docx' }],
      toolProposals: [],
    });

    expect((recovered.generationOptions as { artifactType: string }).artifactType).toBe(
      'simulation',
    );
    expect(recovered.deliverables).toEqual([]);
    expect((correctedDrift.generationOptions as { artifactType: string }).artifactType).toBe(
      'simulation',
    );
    expect(correctedDrift.deliverables).toEqual([]);
    expect(requiredTeacherAgentDeliverableFormats(prompt, driftedPlan)).toEqual([]);
  });

  it('preserves a request for five independent CTFs through the option boundary', () => {
    const prompt =
      '帮我为当前章节一次生成 5 道独立 CTF 实践题，分别围绕输入验证、会话权限、日志取证、配置错误和安全编码，每道题都要在隔离环境中取得动态 Flag。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '一次生成五道独立的动态 Flag CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['准备整批题目的三种组织方案'],
        generationTarget: {
          targetTool: 'challenge.generate',
          artifactType: 'ctf-challenge',
          reason: '教师要求批量生成 CTF',
        },
      },
      listAgentSkills(),
    );
    const enforced = enforceTeacherGenerationOptions(prompt, plan, {
      toolProposals: [
        {
          tool: 'challenge.generate',
          arguments: { moduleIndex: 0, brief: prompt, challengeCount: 1 },
          reason: '批量生成 CTF',
        },
      ],
    });
    const generationOptions = enforced.generationOptions as {
      baseArguments: Record<string, unknown>;
      options: Array<{ rewrittenPrompt: string }>;
    };

    expect(generationOptions.baseArguments.challengeCount).toBe(5);
    expect(generationOptions.baseArguments.moduleIndex).toBe(0);
    expect(
      (generationOptions.baseArguments.constraints as Record<string, unknown>).batchTopics,
    ).toEqual(['输入验证', '会话权限', '日志取证', '配置错误', '安全编码']);
    for (const option of generationOptions.options) {
      expect(option.rewrittenPrompt).toContain('一次启动 5 道彼此独立');
      expect(option.rewrittenPrompt).toContain('不能合并成一道含 5 个小问');
      expect(option.rewrittenPrompt).toContain(
        '1. 输入验证；2. 会话权限；3. 日志取证；4. 配置错误；5. 安全编码',
      );
    }
  });

  it('recognizes natural-language question counts without treating ordinals as batch size', () => {
    expect(requestedQuestionCount('请一次生成五个题目')).toBe(5);
    expect(requestedQuestionCount('请再出五题')).toBe(5);
    expect(requestedQuestionCount('生成５道实践题')).toBe(5);
    expect(requestedQuestionCount('这套题目一共五道')).toBe(5);
    expect(requestedQuestionCount('Create 10 questions for the quiz')).toBe(10);
    expect(requestedQuestionCount('请讲解第5题为什么选 B')).toBeNull();
    expect(requestedQuestionCount('题目难度为五级，满分 10 分')).toBeNull();
  });

  it('overrides a model-shortened assignment count with the teacher requested count', () => {
    const enforced = enforceTeacherQuestionBatchContract('请为本章一次生成五个题目。', {
      answer: '已准备题目。',
      toolProposals: [
        {
          tool: 'assignment.generate',
          arguments: { prompt: '输入验证知识检测', questionCount: 1 },
          reason: '生成章节测验',
        },
      ],
    });

    expect(enforced.toolProposals).toEqual([
      expect.objectContaining({
        tool: 'assignment.generate',
        arguments: expect.objectContaining({ questionCount: 5 }),
      }),
    ]);
    expect(enforced.answer).toContain('已锁定题量为 5 道');
  });

  it('refuses an oversized CTF batch instead of silently shrinking it', () => {
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '一次生成六道独立 CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['准备整批题目的组织方案'],
        generationTarget: {
          targetTool: 'challenge.generate',
          artifactType: 'ctf-challenge',
          reason: '教师要求批量生成 CTF',
        },
      },
      listAgentSkills(),
    );
    const enforced = enforceTeacherGenerationOptions('请一次生成六道独立 CTF 实践题。', plan, {
      toolProposals: [],
    });

    expect(enforced.generationOptions).toBeUndefined();
    expect(enforced.toolProposals).toEqual([]);
    expect(enforced.answer).toContain('当前单批上限是 5 道');
    expect(enforced.answer).toContain('本次没有提供会缩水的方案');
  });

  it('turns every fallback slide option into a long-form quality contract', () => {
    const prompt = '为当前章节生成一份 SQL 注入防御课件。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成可直接授课的 SQL 注入防御课件。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['准备三套候选方案供教师选择'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求新生成课件',
        },
      },
      listAgentSkills(),
    );
    const fallback = fallbackTeacherGenerationOptions(prompt, plan, {
      toolProposals: [
        {
          tool: 'candidate.generate',
          arguments: { prompt, artifactType: 'slide-deck' },
          reason: '生成平台课件',
        },
      ],
    });

    expect(fallback?.options).toHaveLength(3);
    for (const option of fallback?.options || []) {
      expect(option.rewrittenPrompt).toContain('默认生成 12–15 个完整教学页面');
      expect(option.rewrittenPrompt).toContain('优先 14 页');
      expect(option.rewrittenPrompt).toContain('至少使用 4 种页面结构');
      expect(option.rewrittenPrompt).toContain('每一页都提供');
      expect(option.rewrittenPrompt).toContain('至少 2 次理解检查');
    }
  });

  it('loads production references for slide, CTF, and simulation skills', () => {
    const selected = loadAgentSkills(
      ['teaching-slide-deck', 'ctf-flag-challenge', 'cyber-lab-simulation'],
      '生成课件、五道 CTF 和模拟演示',
    );
    const byName = new Map(selected.map((skill) => [skill.name, skill.instructions]));

    expect(byName.get('teaching-slide-deck')).toContain(
      '<skill-reference file="references/production-workflow.md">',
    );
    expect(byName.get('teaching-slide-deck')).toContain(
      '<skill-reference file="references/speaker-script.md">',
    );
    expect(byName.get('ctf-flag-challenge')).toContain('Instance isolation');
    expect(byName.get('ctf-flag-challenge')).toContain('Binary exploitation');
    expect(byName.get('cyber-lab-simulation')).toContain('reset repeated twice');
  });

  it('preserves an explicit teacher page count in every generated option', () => {
    const prompt = '帮我生成一份恰好 9 页的 SQL 注入防御课件。';
    const plan = normalizeTeacherAgentPlan(
      {
        understanding: '生成 9 页课件。',
        selectedSkills: ['teaching-slide-deck'],
        plan: ['提供三套方案'],
        generationTarget: {
          targetTool: 'candidate.generate',
          artifactType: 'slide-deck',
          reason: '教师要求生成课件',
        },
      },
      listAgentSkills(),
    );
    const enforced = enforceTeacherGenerationOptions(prompt, plan, {
      generationOptions: {
        targetTool: 'candidate.generate',
        artifactType: 'slide-deck',
        reason: '生成课件',
        options: [
          {
            title: '概念递进',
            description:
              '通过完整的概念链和案例进行讲授与检查，用可视化关系和及时反馈帮助学生建立稳定、可迁移的心智模型。',
            highlights: ['概念图', '理解检查'],
            rewrittenPrompt:
              '生成一份概念递进的 SQL 注入防御课件，完整覆盖学习目标、心智模型、授权案例、关系图示、理解检查、迁移任务、教师讲稿和结尾总结，所有页面必须可直接授课。禁止使用目录占位、空白页面、重复标题或无法检查的泛化表述。',
          },
          {
            title: '案例驱动',
            description:
              '以授权隔离案例连接证据、原理、修复和验证，让学生沿着统一问题情境完成推理、判断、操作、反馈和迁移。',
            highlights: ['证据链', '修复验证'],
            rewrittenPrompt:
              '生成一份案例驱动的 SQL 注入防御课件，以授权隔离案例连接现象、证据、漏洞原理、参数化修复、回归验证、理解检查和迁移练习，并配置完整教师讲稿。禁止使用目录占位、空白页面、重复标题或无法检查的泛化表述。',
          },
          {
            title: '任务挑战',
            description:
              '用连续任务组织预测、判断、操作和反馈，每一步都提供明确学生动作、可观察证据、教师提示和可核验的完成标准。',
            highlights: ['连续任务', '迁移练习'],
            rewrittenPrompt:
              '生成一份任务挑战式 SQL 注入防御课件，把学习内容组织为连续预测、证据判断、修复操作、验证反馈与迁移挑战，逐页给出学生动作、教师提示和完成标准。禁止使用目录占位、空白页面、重复标题或无法检查的泛化表述。',
          },
        ],
      },
    });

    const enforcedOptions = enforced.generationOptions as {
      options: Array<{ rewrittenPrompt: string }>;
    };
    for (const option of enforcedOptions.options) {
      expect(option.rewrittenPrompt).toContain('必须恰好生成 9 个完整教学页面');
      expect(option.rewrittenPrompt).toContain('覆盖此前任何默认页数描述');
    }
  });

  it('loads only task-relevant skill references within the selected skill', () => {
    const [flaskSkill] = loadAgentSkills(
      ['security-best-practices'],
      '请审查这个 Python Flask 教学平台的服务端安全边界',
    );
    expect(flaskSkill.instructions).toContain(
      '<skill-reference file="references/python-flask-web-server-security.md">',
    );
    expect(flaskSkill.instructions).not.toContain(
      'references/javascript-typescript-react-web-frontend-security.md',
    );

    const [notebookSkill] = loadAgentSkills(['jupyter-notebook'], '生成实验 notebook');
    expect(notebookSkill.instructions).toContain(
      '<skill-reference file="references/notebook-structure.md">',
    );
    expect(notebookSkill.instructions).toContain(
      '<skill-reference file="references/quality-checklist.md">',
    );
  });

  it('preserves real file deliverables and only allowlisted platform tools', () => {
    const result = normalizeTeacherAgentResult(
      {
        answer: '分析与教案均已完成，文件可直接下载。',
        toolProposals: [
          { tool: 'course.read', arguments: {}, reason: '读取事实' },
          { tool: 'shell.exec', arguments: { command: 'rm -rf /' }, reason: '越权工具' },
        ],
        deliverables: [
          {
            filename: '缓冲区溢出基础教案.docx',
            format: 'docx',
            document: {
              title: '缓冲区溢出基础教案',
              sections: [
                {
                  heading: '教学目标',
                  paragraphs: ['理解函数栈帧、边界检查缺失与返回地址覆盖之间的关系。'],
                },
              ],
            },
          },
        ],
      },
      new Set(['course.read']),
    );
    expect(result.toolProposals).toHaveLength(1);
    expect(result.deliverables).toHaveLength(1);
    expect((result.deliverables as Array<Record<string, unknown>>)[0].format).toBe('docx');
  });

  it('binds artifact operations to the trusted current revision instead of a predicted next one', () => {
    const result = normalizeTeacherAgentResult(
      {
        answer: '将按四项要求修改刚才生成的模拟演示。',
        toolProposals: [
          {
            tool: 'artifact.revise',
            arguments: {
              artifactId: 'artifact-current',
              expectedRevision: 3,
              instruction: '增加实时证据面板并完善重置。',
            },
            reason: '基于当前版本 2 修订产物。',
          },
        ],
      },
      new Set(['artifact.revise']),
      {
        artifacts: {
          currentConversation: [
            {
              id: 'artifact-current',
              revision: 2,
            },
          ],
        },
      },
    );
    expect(result.toolProposals).toEqual([
      {
        tool: 'artifact.revise',
        arguments: {
          artifactId: 'artifact-current',
          expectedRevision: 2,
          instruction: '增加实时证据面板并完善重置。',
        },
        reason: '基于当前版本 2 修订产物。',
      },
    ]);
  });

  it('atomically binds an uploaded material to the uniquely named trusted course and module', () => {
    const result = normalizeTeacherAgentResult(
      {
        answer: '将把刚上传的文件加入教师指定的章节资料。',
        toolProposals: [
          {
            tool: 'material.add_to_module',
            arguments: {
              materialId: 'material-uploaded',
              name: '缓冲区溢出补充资料',
            },
            reason: '教师明确指定了课程和章节。',
          },
        ],
      },
      new Set(['material.add_to_module']),
      {
        scope: { dojoId: null, moduleIndex: null },
        availableCourses: [
          {
            referenceId: 'software-security',
            name: '软件安全',
            modules: [
              { index: 0, name: '平台手动验收' },
              { index: 1, name: '逆向工程' },
            ],
          },
          {
            referenceId: 'cryptography',
            name: '密码学',
            modules: [{ index: 0, name: '现代密码基础' }],
          },
        ],
      },
      '把这份文件添加到课程“软件安全”的章节“平台手动验收”资料中。',
    );
    expect(result.toolProposals).toEqual([
      {
        tool: 'material.add_to_module',
        arguments: {
          materialId: 'material-uploaded',
          name: '缓冲区溢出补充资料',
          referenceId: 'software-security',
          moduleIndex: 0,
        },
        reason: '教师明确指定了课程和章节。',
      },
    ]);
  });

  it('turns follow-up suggestions into commands that can be sent verbatim', () => {
    const result = normalizeTeacherAgentResult(
      {
        answer: '教案已经生成。',
        suggestions: [
          '如需我同时提供适合浏览器打印为 PDF 的 HTML 版教案，我可以再生成一个 HTML 文件',
          '如确认需要把本课件三个章节候选加入课程章节，可另行执行材料章节原子化导入',
          '课程设置还可以进一步调整',
          '需要查看某道挑战题的具体完成情况或提交记录吗？',
          '是否要基于该章节布置一次作业或实训？',
          '可继续生成配套的随堂检测题或实验操作单。',
          '我也可以把该 HTML 内容整理为 DOCX 教案版本。',
          '帮我完成这项后续操作：可继续生成课堂练习。',
          '后续内容还能更丰富',
        ],
        toolProposals: [],
        deliverables: [],
      },
      new Set(),
    );
    expect(result.suggestions).toEqual([
      '帮我提供适合浏览器打印为 PDF 的 HTML 版教案。',
      '帮我把本课件三个章节候选加入课程章节。',
      '帮我调整课程设置。',
      '帮我查看某道挑战题的具体完成情况或提交记录。',
      '帮我基于该章节布置一次作业或实训。',
      '帮我生成配套的随堂检测题或实验操作单。',
      '帮我把该 HTML 内容整理为 DOCX 教案版本。',
      '帮我生成课堂练习。',
    ]);
  });

  it('turns the model-understood file outcome into an enforced delivery contract', () => {
    const plan = {
      understanding: '分析指定 PDF，并交付一份可下载的 Word 教案。',
      selectedSkills: [
        'course-material-analysis',
        'lesson-plan-file',
        'downloadable-file-delivery',
      ],
      plan: ['读取材料证据', '完成分析', '交付 DOCX'],
    };
    const formats = requiredTeacherAgentDeliverableFormats(
      '请分析材料并给出一份可直接下载的 Word 教案文件。',
      plan,
    );
    expect(formats).toEqual(['docx']);
    expect(
      missingTeacherAgentDeliverableFormats({ answer: '分析完成。', deliverables: [] }, formats),
    ).toEqual(['docx']);
    const fallback = fallbackTeacherAgentDeliverables(
      '请分析材料并给出 Word 教案。',
      '缓冲区溢出教学应从栈帧结构进入，再进行隔离环境验证。',
      plan,
      formats,
    );
    expect(fallback).toHaveLength(1);
    expect(fallback[0].format).toBe('docx');
    expect(fallback[0].document).toBeTruthy();
    const closurePrompt = teacherAgentDeliverableClosureSystem([], formats);
    expect(closurePrompt).toContain('文件交付闭环');
    expect(closurePrompt).toContain('docx');
    expect(closurePrompt).toContain('不得遗漏任何必须格式');
    expect(closurePrompt).toContain('禁止 Markdown 代码围栏、空 body、空 document');
  });

  it('rejects empty HTML shells and preserves substantive fenced HTML', () => {
    const empty = normalizeTeacherAgentResult(
      {
        answer: 'HTML 已生成。',
        deliverables: [
          {
            filename: '空教案.html',
            format: 'html',
            title: '缓冲区溢出教案',
            document: {},
          },
          {
            filename: '空壳.html',
            format: 'html',
            content:
              '<!doctype html><html><head><style>body{font-size:16px}</style></head><body></body></html>',
          },
        ],
      },
      new Set(),
    );
    expect(empty.deliverables).toEqual([]);
    expect(missingTeacherAgentDeliverableFormats(empty, ['html'])).toEqual(['html']);

    const complete = normalizeTeacherAgentResult(
      {
        answer: 'HTML 已生成。',
        deliverables: [
          {
            filename: '完整教案.html',
            format: 'html',
            content:
              '```html\n<!doctype html><html><body><h1>缓冲区溢出基础</h1><p>围绕栈帧、边界检查和返回地址覆盖组织完整课堂教学。</p></body></html>\n```',
          },
        ],
      },
      new Set(),
    );
    const deliverable = (complete.deliverables as Array<Record<string, unknown>>)[0];
    expect(deliverable.content).toMatch(/^<!doctype html>/i);
    expect(deliverable.content).not.toContain('```');
    expect(teacherAgentDeliverableQualityIssue(deliverable)).toBeNull();
    expect(missingTeacherAgentDeliverableFormats(complete, ['html'])).toEqual([]);
  });

  it('does not mistake an input file analysis request for an output-file request', () => {
    expect(
      requiredTeacherAgentDeliverableFormats('请分析我上传的 PDF 文件并直接给出结论。', {
        understanding: '分析现有 PDF 并在聊天中回答。',
        selectedSkills: ['course-material-analysis', 'pdf'],
        plan: ['读取证据', '给出结论'],
      }),
    ).toEqual([]);
  });

  it('uses every trusted material chapter when the teacher explicitly asks for all of them', () => {
    const normalized = normalizeTeacherAgentResult(
      {
        answer: '我已准备好把全部章节送交教师确认。',
        toolProposals: [
          {
            tool: 'material.apply_chapters',
            arguments: { materialId: 'material_sql', chapterIndexes: [0] },
            reason: '教师要求加入全部分析章节。',
          },
        ],
      },
      new Set(['material.apply_chapters']),
      {
        materials: {
          recent: [
            {
              id: 'material_sql',
              chapterCandidates: [{ index: 0 }, { index: 1 }, { index: 2 }],
            },
          ],
        },
      },
      '把刚才课件分析出的所有章节加入当前课程',
    );

    expect(normalized.toolProposals).toEqual([
      {
        tool: 'material.apply_chapters',
        arguments: { materialId: 'material_sql', chapterIndexes: [0, 1, 2] },
        reason: '教师要求加入全部分析章节。',
      },
    ]);
  });

  it('rejects a claimed platform action that has no executable tool or file', () => {
    expect(() =>
      normalizeTeacherAgentResult(
        {
          answer: '我现在提交验证并发布操作，完成后再通知你。',
          toolProposals: [],
          deliverables: [],
        },
        new Set(['artifact.request_publish']),
      ),
    ).toThrow('promises a platform action');

    expect(() =>
      normalizeTeacherAgentResult(
        {
          answer: '结论：该材料适合拆成两个循序渐进的章节。',
          toolProposals: [],
          deliverables: [],
        },
        new Set(['material.apply_chapters']),
      ),
    ).not.toThrow();
  });
});
