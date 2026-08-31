import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  generateSingleArtifact: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/lesson-generation', () => ({
  generateSingleArtifact: mocks.generateSingleArtifact,
}));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  aiseceduInternalOrigin: () => 'http://ctfd',
  serviceTokenForInternalCall: () => 'integration-secret',
}));

function request(body: Record<string, unknown>, token = 'integration-secret') {
  return new NextRequest('http://localhost/api/integration/jobs/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AISecEdu-Service-Token': token,
    },
    body: JSON.stringify(body),
  });
}

function body(kind = 'agent.chat') {
  return {
    jobId: 'job_acceptance',
    kind,
    scope: { ownerId: 7, dojoId: 11, moduleIndex: 2 },
    payload: { prompt: '设计一节 SQL 注入防御课', context: { phase: 'PRE_CLASS' } },
    modelRoute: {
      route: 'standard',
      provider: 'deepseek',
      actual_model: 'deepseek-v4-pro',
    },
  };
}

function completeSlideDeckOutline(count = 14) {
  const layouts = [
    'cover',
    'checkpoint',
    'concept',
    'comparison',
    'case',
    'process',
    'timeline',
    'activity',
    'code',
    'checkpoint',
    'comparison',
    'process',
    'case',
    'activity',
    'concept',
    'summary',
  ];
  return Array.from({ length: count }, (_, index) => {
    const layout =
      index === 0 ? 'cover' : index === count - 1 ? 'summary' : layouts[index] || 'concept';
    return {
      title: `SQL 注入防御第 ${index + 1} 页`,
      description: `第 ${index + 1} 页围绕参数化查询建立一项可以讲授和检查的具体理解。`,
      keyPoints: [`要点 ${index + 1}A：识别可观察证据`, `要点 ${index + 1}B：解释并验证防御结果`],
      layout,
      visualBrief: `使用 ${layout} 版式展示事实、关系和验证结果。`,
      speakerNotes: `教师先连接上一页形成的结论，再用一组具体输入、查询结构和日志结果展开第 ${index + 1} 页。强调不要把过滤字符误认为结构隔离，并要求学习者同时说明判断结论、证据来源与预期输出；确认回答完整后，过渡到下一页的验证任务。`,
    };
  });
}

function mockAgentTurn(
  execution: Record<string, unknown>,
  plan: Record<string, unknown> = {
    understanding: '完整理解教师原始请求并按结果交付。',
    selectedSkills: [],
    plan: ['结合可信上下文完成请求'],
  },
) {
  mocks.callLLM
    .mockResolvedValueOnce({
      text: JSON.stringify(plan),
      usage: { inputTokens: 20, outputTokens: 10 },
    })
    .mockResolvedValueOnce({
      text: JSON.stringify(execution),
      usage: { inputTokens: 80, outputTokens: 40 },
    });
}

describe('玄甲 durable job integration route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.callLLM.mockReset();
    mocks.generateSingleArtifact.mockReset();
    mocks.resolveModel.mockReset();
    mocks.resolveModel.mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-pro',
      modelString: 'deepseek:deepseek-v4-pro',
      model: { id: 'deepseek-v4-pro' },
      modelInfo: { outputWindow: 16_000 },
      thinkingConfig: { effort: 'high' },
    });
  });

  it('rejects a request without the shared service credential', async () => {
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(body(), 'wrong-secret'));
    expect(response.status).toBe(401);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('analyzes PDF text returned by the current flat extraction envelope', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        analysis: {
          summary: '课程资料介绍最小权限与网络安全实践。',
          functionalPoints: ['最小权限'],
          knowledgeGraph: { nodes: [], edges: [] },
          chapterCandidates: [
            { title: '最小权限', objectives: ['解释最小权限原则'], sourceLocators: [] },
          ],
        },
      }),
      usage: { inputTokens: 60, outputTokens: 80 },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('%PDF-1.7 course material', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              text: 'Network security course material: apply least privilege in practice.',
              images: [],
              metadata: { pageCount: 1, parser: 'unpdf' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    try {
      const requestBody = {
        ...body('material.analyze'),
        payload: {
          materialId: 'material_acceptance',
          revisionId: 'revision_acceptance',
          filename: 'network-security-course.pdf',
          mimeType: 'application/pdf',
          storageKey: '7/11/network-security-course.pdf',
        },
      };
      const { POST } = await import('@/app/api/integration/jobs/execute/route');
      const response = await POST(request(requestBody));
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.result.analysis.functionalPoints).toEqual(['最小权限']);
      expect(result.result.chunks).toEqual([
        expect.objectContaining({
          content: 'Network security course material: apply least privilege in practice.',
        }),
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('reads every segment of a long teacher material before marking analysis complete', async () => {
    const source = `${'A'.repeat(125_000)}MIDDLE-EVIDENCE${'B'.repeat(125_000)}FINAL-EVIDENCE`;
    mocks.callLLM.mockImplementation(async (input, label) => {
      if (label === 'aisecedu-material-analysis-synthesis') {
        return {
          text: JSON.stringify({
            analysis: {
              summary: '综合了开头、中段和末尾的课程事实。',
              functionalPoints: ['MIDDLE-EVIDENCE', 'FINAL-EVIDENCE'],
              knowledgeGraph: { nodes: [], edges: [] },
              chapterCandidates: [
                {
                  title: '输入边界与风险识别',
                  description: '从不可信输入建立可观察的安全风险与边界。',
                  objectives: ['识别会改变查询结构的输入风险'],
                },
                {
                  title: '参数化查询与最小权限',
                  description: '通过结构隔离和权限约束阻断注入路径。',
                  objectives: ['解释参数绑定如何保持代码与数据边界'],
                },
                {
                  title: '日志证据与回归验证',
                  description: '利用日志和正反样例复核修复是否有效。',
                  objectives: ['设计一次可复现的防御回归验证'],
                },
              ],
            },
          }),
          usage: { inputTokens: 40, outputTokens: 20 },
        };
      }
      return {
        text: JSON.stringify({
          analysis: {
            summary: String(input.prompt).includes('FINAL-EVIDENCE')
              ? '末段包含 FINAL-EVIDENCE。'
              : '当前连续分段已完整阅读。',
            functionalPoints: [],
            knowledgeGraph: { nodes: [], edges: [] },
            chapterCandidates: [],
          },
        }),
        usage: { inputTokens: 30, outputTokens: 10 },
      };
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(source, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );

    try {
      const { POST } = await import('@/app/api/integration/jobs/execute/route');
      const response = await POST(
        request({
          ...body('material.analyze'),
          payload: {
            materialId: 'material_long',
            revisionId: 'revision_long',
            filename: 'long-course.txt',
            mimeType: 'text/plain',
          },
        }),
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.result.analysis.coverage).toEqual(
        expect.objectContaining({
          analysisVersion: 'complete-map-reduce-v1',
          complete: true,
          extractedCharacters: source.length,
          analyzedCharacters: source.length,
          segmentCount: 3,
        }),
      );
      expect(result.result.analysis.sectionSummaries).toHaveLength(3);
      expect(result.result.analysis.sectionSummaries[2].summary).toContain('FINAL-EVIDENCE');
      expect(mocks.callLLM).toHaveBeenCalledTimes(4);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('repairs an under-specified long-material chapter outline before returning it to the course', async () => {
    const source = 'SQL 注入防御材料。'.repeat(15_000);
    mocks.callLLM.mockImplementation(async (_input, label) => {
      if (label === 'aisecedu-material-analysis-synthesis') {
        return {
          text: JSON.stringify({
            analysis: {
              summary: '初始综合分析已覆盖全部材料。',
              functionalPoints: ['参数化查询', '最小权限'],
              knowledgeGraph: { nodes: [], edges: [] },
              chapterCandidates: [
                { title: '章节 1', objectives: [] },
                { title: '章节 1', objectives: [] },
              ],
            },
          }),
          usage: { inputTokens: 40, outputTokens: 20 },
        };
      }
      if (label === 'aisecedu-material-chapter-outline-repair') {
        return {
          text: JSON.stringify({
            analysis: {
              chapterCandidates: [
                {
                  title: '注入风险与输入边界',
                  description: '从输入如何改变查询结构建立风险识别与安全边界。',
                  objectives: ['识别不可信输入改变查询结构的证据'],
                  sourceLocators: [{ start: 0, end: 120 }],
                },
                {
                  title: '参数化查询与权限收敛',
                  description: '通过预编译、绑定参数和最小权限阻断攻击路径。',
                  objectives: ['解释参数绑定如何隔离代码与数据'],
                  sourceLocators: [{ start: 121, end: 240 }],
                },
                {
                  title: '日志复核与安全回归',
                  description: '用正常与恶意样例及日志证据验证修复结果。',
                  objectives: ['设计一次可追溯的防御回归验证'],
                  sourceLocators: [{ start: 241, end: 360 }],
                },
              ],
            },
          }),
          usage: { inputTokens: 30, outputTokens: 40 },
        };
      }
      return {
        text: JSON.stringify({
          analysis: {
            summary: '当前连续分段已完整阅读。',
            functionalPoints: ['参数化查询'],
            knowledgeGraph: { nodes: [], edges: [] },
            chapterCandidates: [],
          },
        }),
        usage: { inputTokens: 30, outputTokens: 10 },
      };
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(source, { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );

    try {
      const { POST } = await import('@/app/api/integration/jobs/execute/route');
      const response = await POST(
        request({
          ...body('material.analyze'),
          payload: {
            materialId: 'material_outline_repair',
            revisionId: 'revision_outline_repair',
            filename: 'sql-injection-defense.txt',
            mimeType: 'text/plain',
          },
        }),
      );
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(
        result.result.analysis.chapterCandidates.map((item: { title: string }) => item.title),
      ).toEqual(['注入风险与输入边界', '参数化查询与权限收敛', '日志复核与安全回归']);
      expect(
        mocks.callLLM.mock.calls.some(
          ([, label]) => label === 'aisecedu-material-chapter-outline-repair',
        ),
      ).toBe(true);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('fails loudly when a required complex-scene model is not resolved', async () => {
    mocks.resolveModel.mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      modelString: 'deepseek:deepseek-v4-flash',
      model: { id: 'deepseek-v4-flash' },
      modelInfo: { outputWindow: 16_000 },
    });
    const base = body('candidate.generate');
    const payload = {
      ...base,
      modelRoute: { ...base.modelRoute, required_model: 'deepseek-v4-pro' },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(payload));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('generates exactly one draft for a well-scoped single-output request', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: 'SQL 注入防御教案',
            summary: '一份可直接编辑的明确草稿。',
            strategy: 'guided-practice',
            differences: [],
            recommendation: '直接进入详情调整。',
            content: {
              type: 'lesson-plan',
              objectives: ['识别参数化查询的作用'],
              outline: ['原理', '演示', '训练'],
              activities: ['代码审查'],
              assessment: ['出口测验'],
              experience: { slides: [] },
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '为当前章节生成一份 SQL 注入防御教案，包含目标、30 分钟教学步骤和出口测验',
        artifactType: 'lesson-plan',
        candidateCount: 1,
        generationMode: 'single',
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.candidates).toHaveLength(1);
    expect(mocks.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('数组必须恰好包含 1 项'),
      }),
      'aisecedu-integration-job',
      expect.anything(),
      expect.anything(),
    );
  });

  it('requires every teacher material to be grounded in a generated candidate', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: '材料驱动的 SQL 注入防御教案',
            summary: '严格承接教师资料。',
            strategy: 'source-grounded-practice',
            differences: [],
            recommendation: '用于当前课程。',
            content: {
              type: 'lesson-plan',
              objectives: ['解释参数化查询'],
              outline: ['材料概念', '证据演示', '迁移练习'],
              activities: ['代码审查'],
              assessment: ['出口测验'],
              experience: { slides: [] },
              sourceGrounding: [
                {
                  materialId: 'material_sql',
                  uses: ['沿用资料中的参数化查询示例和术语'],
                  sourceLocators: [{ ordinal: 1 }],
                },
              ],
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '根据教师资料生成一份 SQL 注入防御教案',
        artifactType: 'lesson-plan',
        candidateCount: 1,
        materialContext: {
          expectedMaterialCount: 1,
          includedMaterialCount: 1,
          complete: true,
          materialIds: ['material_sql'],
        },
        sourceMaterials: [
          {
            id: 'material_sql',
            title: 'SQL 注入防御',
            coverage: { complete: true },
            analysis: { summary: '使用参数化查询阻止输入改变 SQL 结构。' },
            excerpts: [{ ordinal: 1, content: '参数化查询示例' }],
          },
        ],
        materialDossier: {
          coverage: {
            expectedMaterialCount: 1,
            includedMaterialCount: 1,
            complete: true,
            materialIds: ['material_sql'],
          },
          materials: [
            {
              id: 'material_sql',
              title: 'SQL 注入防御',
              analysis: { summary: '使用参数化查询阻止输入改变 SQL 结构。' },
              coverage: { complete: true },
              excerpts: [{ ordinal: 1, content: '参数化查询示例' }],
            },
          ],
        },
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.candidates[0].content.sourceGrounding[0].materialId).toBe('material_sql');
    expect(mocks.callLLM.mock.calls[0][0].system).toContain('逐份覆盖');
    expect(mocks.callLLM.mock.calls[0][0].prompt).toContain('参数化查询阻止输入改变 SQL 结构');
  });

  it('blocks generation when any teacher material is not completely analyzed', async () => {
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('candidate.generate'),
        payload: {
          prompt: '生成课件',
          artifactType: 'slide-deck',
          candidateCount: 1,
          materialContext: {
            expectedMaterialCount: 2,
            includedMaterialCount: 1,
            complete: false,
            materialIds: ['ready', 'pending'],
          },
          sourceMaterials: [{ id: 'ready', coverage: { complete: true } }],
        },
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('blocks generation when the complete material dossier was not delivered to the model', async () => {
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('candidate.generate'),
        payload: {
          prompt: '生成课件',
          artifactType: 'slide-deck',
          candidateCount: 1,
          materialContext: {
            expectedMaterialCount: 1,
            includedMaterialCount: 1,
            complete: true,
            materialIds: ['material_sql'],
          },
          sourceMaterials: [
            {
              id: 'material_sql',
              title: 'SQL 注入防御',
              coverage: { complete: true },
              analysis: { summary: '使用参数化查询阻止输入改变 SQL 结构。' },
            },
          ],
        },
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false });
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('recovers an empty outline from renderable global-agent slides', async () => {
    const slides = completeSlideDeckOutline();
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: 'SQL 注入防御课件',
            summary: '模型给出了完整幻灯片，但遗漏了顶层大纲数组。',
            strategy: 'demonstration-first',
            differences: [],
            recommendation: '进入详情继续编辑。',
            content: {
              type: 'slide-deck',
              objectives: ['解释参数化查询的防御原理'],
              outline: [],
              activities: ['对比安全与不安全查询'],
              assessment: ['出口测验'],
              experience: {
                slides,
                designSystem: '统一的深蓝与青色安全教学视觉系统',
              },
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '为当前章节生成一份 SQL 注入防御课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.candidates[0].content.outline).toHaveLength(14);
    expect(result.result.candidates[0].content.pageCountPolicy).toMatchObject({
      min: 12,
      max: 15,
      preferred: 14,
      explicit: false,
    });
    expect(result.result.candidates[0].content.outline[0]).toEqual(
      expect.objectContaining({ title: 'SQL 注入防御第 1 页', layout: 'cover' }),
    );
    const retryOptions = mocks.callLLM.mock.calls[0][2] as {
      validate: (text: string) => boolean;
    };
    const generated = await mocks.callLLM.mock.results[0].value;
    expect(retryOptions.validate(generated.text)).toBe(true);
  });

  it('keeps an explicitly requested slide count in the candidate contract', async () => {
    const slides = completeSlideDeckOutline(14);
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: '9 页 SQL 注入防御课件',
            summary: '按教师指定页数完成的紧凑课件。',
            strategy: 'compact-case-driven',
            differences: ['恰好 9 页', '保留完整案例与检查'],
            recommendation: '适合一次紧凑课堂。',
            content: {
              type: 'slide-deck',
              objectives: ['解释参数化查询的防御原理'],
              outline: slides,
              activities: ['修复前后证据对比'],
              assessment: ['两次理解检查'],
              experience: { slides, designSystem: '统一安全教学视觉' },
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '帮我生成一份恰好 9 页的 SQL 注入防御课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.candidates[0].content.outline).toHaveLength(9);
    expect(result.result.candidates[0].content.pageCountPolicy).toMatchObject({
      min: 9,
      max: 9,
      preferred: 9,
      explicit: true,
      source: 'exact',
    });
    expect(mocks.callLLM.mock.calls[0][0].system).toContain('必须恰好生成 9 个');
  });

  it('expands a title-only slide outline into detailed teachable pages', async () => {
    const titles = Array.from({ length: 14 }, (_, index) => `SQL 注入防御主题 ${index + 1}`);
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: 'SQL 注入防御课件',
            summary: '模型只返回了标题数组。',
            strategy: 'concept-to-practice',
            differences: [],
            recommendation: '恢复为完整页面后继续编辑。',
            content: {
              type: 'slide-deck',
              objectives: ['解释参数化查询的防御原理'],
              outline: titles,
              activities: ['修复前后证据对比'],
              assessment: ['两次理解检查'],
              experience: { designSystem: '统一安全教学视觉' },
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '生成一份 SQL 注入防御课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();
    const outline = result.result.candidates[0].content.outline;

    expect(response.status).toBe(200);
    expect(outline).toHaveLength(14);
    expect(outline[0]).toEqual(
      expect.objectContaining({
        title: titles[0],
        layout: 'cover',
        description: expect.any(String),
        keyPoints: expect.any(Array),
        visualBrief: expect.any(String),
        speakerNotes: expect.any(String),
      }),
    );
    expect(outline[13]).toEqual(expect.objectContaining({ layout: 'summary' }));
  });

  it('accepts a focused cover page without weakening substantive page validation', async () => {
    const slides = completeSlideDeckOutline();
    slides[0].keyPoints = ['用一个授权案例建立本课问题意识'];
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: 'SQL 注入防御课件',
            summary: '封面简洁、正文完整的课堂课件。',
            strategy: 'case-driven',
            differences: [],
            recommendation: '直接进入详情继续编辑。',
            content: {
              type: 'slide-deck',
              objectives: ['解释参数化查询的防御原理'],
              outline: slides,
              activities: ['修复前后证据对比'],
              assessment: ['两次理解检查'],
              experience: { slides, designSystem: '统一安全教学视觉' },
            },
          },
        ],
      }),
      usage: { inputTokens: 80, outputTokens: 100 },
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '生成一份 SQL 注入防御课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.callLLM.mock.calls[0][0].output).toEqual(
      expect.objectContaining({ name: 'json' }),
    );
    expect(mocks.callLLM.mock.calls[0][2]).toEqual(expect.objectContaining({ retries: 2 }));
    expect(mocks.callLLM.mock.calls[0][3]).toEqual({ mode: 'disabled', enabled: false });
    const structuredOutput = mocks.callLLM.mock.calls[0][0].output as {
      parseCompleteOutput: (input: { text: string }) => Promise<Record<string, unknown>>;
    };
    await expect(
      structuredOutput.parseCompleteOutput({
        text: '```json\n{"candidates": [],}\n```',
      }),
    ).resolves.toEqual({ candidates: [] });
    expect(result.result.candidates[0].content.outline[0]).toMatchObject({
      layout: 'cover',
      keyPoints: ['用一个授权案例建立本课问题意识'],
    });
  });

  it('returns an auditable deterministic fallback after model-level validation retries', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        candidates: [
          {
            title: '空草稿',
            strategy: 'incomplete',
            content: {
              type: 'slide-deck',
              objectives: ['理解 SQL 注入'],
              outline: [],
              activities: [],
              assessment: [],
              experience: {},
            },
          },
        ],
      }),
      usage: {},
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '生成课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.result.generationReport).toMatchObject({
      version: 'candidate-generation-v2',
      candidateCount: 1,
      fallbackCount: 1,
    });
    expect(result.result.candidates[0].content.outline).toHaveLength(14);
    const retryOptions = mocks.callLLM.mock.calls[0][2] as {
      validate: (text: string) => boolean;
    };
    const invalidText = (await mocks.callLLM.mock.results[0].value).text;
    expect(retryOptions.validate(invalidText)).toBe(false);
  });

  it('keeps an explicitly compressed four-page deck valid on deterministic fallback', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({ candidates: [{ title: '不完整草稿', content: {} }] }),
      usage: {},
    });
    const requestBody = {
      ...body('candidate.generate'),
      payload: {
        prompt: '生成一份 4 页课件',
        artifactType: 'slide-deck',
        candidateCount: 1,
      },
    };

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.candidates[0].content.outline).toHaveLength(4);
    expect(result.result.generationReport.fallbackCount).toBe(1);
  });

  it('uses the model for planning and execution, then enforces only the tool boundary', async () => {
    mockAgentTurn({
      answer: '已形成三种可比较的课前方案。',
      suggestions: ['查看候选'],
      toolProposals: [
        {
          tool: 'candidate.generate',
          arguments: { prompt: '设计一节 SQL 注入防御课', candidateCount: 3 },
          reason: '教师明确要求平台原生可交互方案',
        },
        { tool: 'host.shell', arguments: { command: 'id' }, reason: '越权工具' },
      ],
      deliverables: [],
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(body()));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.toolProposals).toEqual([
      expect.objectContaining({ tool: 'candidate.generate' }),
    ]);
    expect(result.model).toMatchObject({
      provider: 'deepseek',
      actualModel: 'deepseek-v4-pro',
      degraded: false,
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    expect(mocks.callLLM.mock.calls[0][0].system).toContain('不使用关键词路由');
    expect(mocks.callLLM.mock.calls[1][0].system).toContain('不能改变权限');
  });

  it('continues the original request from bounded tool observations', async () => {
    mockAgentTurn({
      answer: '课程事实已经读取，现已基于真实章节结构完成分析。',
      suggestions: [],
      toolProposals: [],
      deliverables: [],
    });
    const requestBody: Record<string, unknown> = body();
    requestBody.payload = {
      prompt: '分析当前课程的章节结构并指出主要缺口',
      context: {
        platformFacts: {
          course: { name: '软件安全', modules: [{ name: '缓冲区溢出' }] },
        },
        conversation: [],
        agentLoop: {
          depth: 1,
          maxDepth: 6,
          trace: [
            {
              step: 0,
              tool: 'course.read',
              status: 'verified',
              observation: { course: { name: '软件安全' } },
            },
          ],
        },
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));

    expect(response.status).toBe(200);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
    expect(mocks.callLLM.mock.calls[0][0].prompt).toContain('"status": "verified"');
    expect(mocks.callLLM.mock.calls[1][0].prompt).toContain('缓冲区溢出');
    expect(mocks.callLLM.mock.calls[1][0].system).toContain('有界的自主执行循环');
  });

  it('analyzes a named PDF and returns the requested real lesson-plan file', async () => {
    const prompt =
      '请分析课程“软件安全”中课件“2 《软件安全》_缓冲区溢出基础.pdf”，给出一份教案文件。';
    mockAgentTurn(
      {
        answer: '已完成材料分析，并整理成可下载的 Word 教案。',
        suggestions: [],
        toolProposals: [],
        deliverables: [
          {
            filename: '缓冲区溢出基础教案.docx',
            format: 'docx',
            title: '缓冲区溢出基础教案',
            document: {
              title: '缓冲区溢出基础教案',
              sections: [
                {
                  heading: '材料分析与教学目标',
                  paragraphs: ['围绕栈帧、边界检查缺失和返回地址覆盖组织教学。'],
                },
              ],
            },
          },
        ],
      },
      {
        understanding: '分析指定 PDF 的内容，并把分析转化为一份可下载的教案文件。',
        selectedSkills: [
          'course-material-analysis',
          'lesson-plan-file',
          'downloadable-file-delivery',
        ],
        plan: ['读取材料证据', '完成课程分析', '生成 DOCX 教案'],
      },
    );
    const requestBody = {
      ...body(),
      payload: {
        prompt,
        context: {
          platformFacts: {
            course: { name: '软件安全' },
            materials: {
              recent: [
                {
                  id: 'material_buffer_overflow',
                  filename: '2 《软件安全》_缓冲区溢出基础.pdf',
                  analysisStatus: 'READY',
                },
              ],
            },
          },
        },
        sourceMaterials: [
          {
            id: 'material_buffer_overflow',
            title: '缓冲区溢出基础',
            excerpts: [{ sourceLocator: 'page:1', content: '栈帧与返回地址覆盖。' }],
          },
        ],
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.answer).toContain('可下载');
    expect(result.result.toolProposals).toEqual([]);
    expect(result.result.deliverables).toEqual([
      expect.objectContaining({ filename: '缓冲区溢出基础教案.docx', format: 'docx' }),
    ]);
    expect(result.result.selectedSkills).toEqual([
      'course-material-analysis',
      'lesson-plan-file',
      'downloadable-file-delivery',
    ]);
    expect(mocks.callLLM.mock.calls[0][0].prompt).toContain(prompt);
    expect(mocks.callLLM.mock.calls[1][0].prompt).toContain(prompt);
    expect(mocks.callLLM.mock.calls[1][0].system).toContain('# Lesson plan file');
    expect(result.model.actualModel).toBe('deepseek-v4-pro');
    expect(result.model.executionMode).toBeUndefined();
  });

  it('repairs a model answer that understood the Word request but omitted the file', async () => {
    const prompt = '请分析缓冲区溢出材料，并给出一份可直接下载的 Word 教案文件。';
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          understanding: '分析材料并交付一份 Word 教案。',
          selectedSkills: [
            'course-material-analysis',
            'lesson-plan-file',
            'downloadable-file-delivery',
          ],
          plan: ['分析材料', '生成 DOCX 教案'],
        }),
        usage: { inputTokens: 20, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '材料以栈帧、边界检查和返回地址覆盖为主线。',
          suggestions: [],
          toolProposals: [],
          deliverables: [],
        }),
        usage: { inputTokens: 80, outputTokens: 40 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '分析完成，并已整理为可下载的 Word 教案。',
          suggestions: [],
          toolProposals: [],
          deliverables: [
            {
              filename: '缓冲区溢出教案.docx',
              format: 'docx',
              document: {
                title: '缓冲区溢出教案',
                sections: [
                  {
                    heading: '90 分钟教学流程',
                    paragraphs: ['概念讲解、隔离演示、Flag 实践与复盘。'],
                  },
                ],
              },
            },
          ],
        }),
        usage: { inputTokens: 50, outputTokens: 60 },
      });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt,
          context: { platformFacts: { course: { name: '软件安全' } } },
          sourceMaterials: [
            {
              title: '缓冲区溢出基础',
              excerpts: [{ sourceLocator: 'page:1', content: '栈帧与返回地址覆盖。' }],
            },
          ],
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.deliverables).toEqual([
      expect.objectContaining({ filename: '缓冲区溢出教案.docx', format: 'docx' }),
    ]);
    expect(result.result.deliveryClosure).toEqual({
      requiredFormats: ['docx'],
      completed: true,
      fallback: false,
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
    expect(mocks.callLLM.mock.calls[2][1]).toBe('aisecedu-agent-deliverable-closure');
    expect(mocks.callLLM.mock.calls[2][0].system).toContain('文件交付闭环');
  });

  it('repairs an HTML deliverable whose model payload is only an empty document', async () => {
    const prompt = '帮我提供适合浏览器打印为 PDF 的 HTML 版教案。';
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          understanding: '把当前缓冲区溢出教案整理为完整可打印的 HTML 文件。',
          selectedSkills: ['lesson-plan-file', 'downloadable-file-delivery'],
          plan: ['保留教案正文', '生成完整 HTML', '检查打印版式与文件正文'],
        }),
        usage: { inputTokens: 20, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '已生成浏览器打印版教案。',
          suggestions: [],
          toolProposals: [],
          deliverables: [
            {
              filename: '缓冲区溢出教案.html',
              format: 'html',
              title: '缓冲区溢出教案',
              document: {},
            },
          ],
        }),
        usage: { inputTokens: 80, outputTokens: 40 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '已重新生成并检查完整的浏览器打印版教案。',
          suggestions: [],
          toolProposals: [],
          deliverables: [
            {
              filename: '缓冲区溢出教案.html',
              format: 'html',
              title: '缓冲区溢出教案',
              content:
                '```html\n<!doctype html><html><body><h1>缓冲区溢出基础</h1><h2>教学目标</h2><p>理解栈帧、边界检查缺失和返回地址覆盖之间的关系。</p></body></html>\n```',
            },
          ],
        }),
        usage: { inputTokens: 50, outputTokens: 80 },
      });

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt,
          context: { platformFacts: { course: { name: '软件安全' } } },
        },
      }),
    );
    const result = await response.json();
    const deliverable = result.result.deliverables[0];

    expect(response.status).toBe(200);
    expect(deliverable.format).toBe('html');
    expect(deliverable.content).toMatch(/^<!doctype html>/i);
    expect(deliverable.content).toContain('理解栈帧');
    expect(deliverable.content).not.toContain('```');
    expect(result.result.deliveryClosure).toEqual({
      requiredFormats: ['html'],
      completed: true,
      fallback: false,
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
  });

  it('falls back to a substantive printable HTML file when model repair is unavailable', async () => {
    const prompt = '帮我提供适合浏览器打印为 PDF 的 HTML 版教案。';
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          understanding: '交付完整可打印的 HTML 教案。',
          selectedSkills: ['lesson-plan-file', 'downloadable-file-delivery'],
          plan: ['整理现有分析', '生成 HTML 文件', '检查正文'],
        }),
        usage: { inputTokens: 20, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '教案围绕栈帧结构、边界检查缺失、返回地址覆盖和隔离实验展开。',
          suggestions: [],
          toolProposals: [],
          deliverables: [{ filename: '空教案.html', format: 'html', document: {} }],
        }),
        usage: { inputTokens: 80, outputTokens: 40 },
      })
      .mockRejectedValueOnce(new Error('model repair unavailable'));

    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request({ ...body(), payload: { prompt, context: {} } }));
    const result = await response.json();
    const deliverable = result.result.deliverables[0];

    expect(response.status).toBe(200);
    expect(deliverable.format).toBe('html');
    expect(deliverable.content).toMatch(/^<!doctype html>/i);
    expect(deliverable.content).toContain('栈帧结构');
    expect(deliverable.content).toContain('教师原始要求');
    expect(deliverable.content).toContain(prompt);
    expect(result.result.deliveryClosure).toEqual({
      requiredFormats: ['html'],
      completed: true,
      fallback: true,
    });
  });

  it('does not let a stale client intent override the model understanding', async () => {
    const prompt = '分析这份课件的知识结构并给出改进建议，不要创建新内容。';
    mockAgentTurn(
      {
        answer: '这份课件的概念链完整，但先修知识与实践检查点之间缺少显式映射。',
        suggestions: [],
        toolProposals: [],
        deliverables: [],
      },
      {
        understanding: '只分析已有课件并提出建议，不生成或修改内容。',
        selectedSkills: ['course-material-analysis'],
        plan: ['依据现有材料完成分析'],
      },
    );
    const requestBody = {
      ...body(),
      payload: {
        prompt,
        intent: 'generate',
        context: { platformFacts: { course: { name: '软件安全' } } },
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.answer).toContain('缺少显式映射');
    expect(result.result.toolProposals).toEqual([]);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  it('lets the model select a flag-based native CTF tool and skill', async () => {
    const prompt = '在密钥交换基础章节生成一道弱随机数攻击 CTF，学生通过拿到 Flag 完成。';
    mockAgentTurn(
      {
        answer: '将创建隔离、可运行并以动态 Flag 验证的原生 CTF 实践题。',
        suggestions: [],
        toolProposals: [
          {
            tool: 'challenge.generate',
            arguments: { moduleIndex: 3, brief: prompt },
            reason: '教师要求原生 CTF 与 Flag 判题',
          },
        ],
        deliverables: [],
      },
      {
        understanding: '创建以 Flag 为唯一完成标准的弱随机数 CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['设计隔离环境与动态 Flag', '调用原生挑战生成工具'],
      },
    );
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt,
          context: {
            platformFacts: {
              course: { modules: [{ index: 3, name: '密钥交换基础' }] },
            },
          },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.toolProposals).toEqual([]);
    expect(result.result.generationOptions).toEqual(
      expect.objectContaining({
        targetTool: 'challenge.generate',
        artifactType: 'ctf-challenge',
        baseArguments: { moduleIndex: 3 },
        options: expect.any(Array),
      }),
    );
    expect(result.result.generationOptions.options).toHaveLength(3);
    expect(
      new Set(
        result.result.generationOptions.options.map(
          (option: { rewrittenPrompt: string }) => option.rewrittenPrompt,
        ),
      ).size,
    ).toBe(3);
    result.result.generationOptions.options.forEach((option: { rewrittenPrompt: string }) => {
      expect(option.rewrittenPrompt).toContain('动态 Flag');
    });
    expect(result.result.selectedSkills).toEqual(['ctf-flag-challenge']);
    expect(mocks.callLLM.mock.calls[1][0].system).toContain('solution.json');
  });

  it('keeps five natural-language CTF questions when the model proposes only one', async () => {
    const prompt =
      '请为当前章节一次生成五个 CTF 题目，每道题都使用独立隔离环境并取得独立动态 Flag。';
    mockAgentTurn(
      {
        answer: '准备生成 CTF。',
        suggestions: [],
        toolProposals: [
          {
            tool: 'challenge.generate',
            arguments: { moduleIndex: 3, brief: prompt, challengeCount: 1 },
            reason: '教师要求生成 CTF',
          },
        ],
        deliverables: [],
      },
      {
        understanding: '一次生成五道彼此独立的 CTF。',
        selectedSkills: ['ctf-flag-challenge'],
        plan: ['准备整批题目的三个方案'],
        generationTarget: {
          targetTool: 'challenge.generate',
          artifactType: 'ctf-challenge',
          reason: '教师要求批量生成 CTF',
        },
      },
    );
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt,
          context: {
            platformFacts: {
              course: { modules: [{ index: 3, name: '当前章节' }] },
            },
          },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.toolProposals).toEqual([]);
    expect(result.result.generationOptions.baseArguments).toEqual(
      expect.objectContaining({ moduleIndex: 3, challengeCount: 5 }),
    );
    expect(result.result.answer).toContain('已锁定一次生成 5 道彼此独立');
    expect(result.result.answer).not.toContain('选择的是整批策略');
    expect(result.result.answer).not.toContain('误当成五套方案');
    result.result.generationOptions.options.forEach((option: { rewrittenPrompt: string }) => {
      expect(option.rewrittenPrompt).toContain('一次启动 5 道彼此独立');
      expect(option.rewrittenPrompt).toContain('不能合并成一道含 5 个小问');
    });
  });

  it('keeps one batch revision tool call for five recent CTF drafts', async () => {
    const draftIds = ['draft_one', 'draft_two', 'draft_three', 'draft_four', 'draft_five'];
    const instruction = '逐题增加三级提示、动态 Flag 提交条件、环境重置说明和防御修复反思题。';
    mockAgentTurn({
      answer: '现在会把四点要求并行应用到刚才生成的五道题，并分别重新验证。',
      suggestions: [],
      toolProposals: [
        {
          tool: 'challenge.revise',
          arguments: { draftIds, instruction },
          reason: '教师要求统一修改最近一次批量生成的五道 CTF',
        },
      ],
      deliverables: [],
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt: `统一修改刚才生成的 5 道 CTF：${instruction}`,
          context: {
            platformFacts: {
              nativeAuthoring: {
                recentDrafts: draftIds.map((id) => ({ id, validationStatus: 'PASS' })),
              },
            },
          },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.requiresAction).toBe(true);
    expect(result.result.toolProposals).toEqual([
      expect.objectContaining({
        tool: 'challenge.revise',
        arguments: { draftIds, instruction },
      }),
    ]);
  });

  it('keeps unsupported external operations honest without inventing a tool', async () => {
    mockAgentTurn({
      answer: '当前没有邮件发送工具，因此我不能声称邮件已经发出；我可以先帮你起草正文。',
      suggestions: ['起草邮件'],
      toolProposals: [{ tool: 'email.send', arguments: { to: 'all' }, reason: '系统未提供的工具' }],
      deliverables: [],
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: { prompt: '帮我向全班家长发送一封邮件', context: { platformFacts: {} } },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.answer).toContain('不能声称邮件已经发出');
    expect(result.result.toolProposals).toEqual([]);
  });

  it('preserves a model-selected sequence of course and simulation operations', async () => {
    const prompt = '新建一个密码学课程，并且出几道仿真模拟题。';
    mockAgentTurn({
      answer: '需要先创建课程及承载章节，再生成交互仿真。',
      suggestions: [],
      toolProposals: [
        {
          tool: 'course.create',
          arguments: {
            name: '密码学',
            slug: 'cryptography',
            access: 'private',
            initialModuleName: '仿真实验',
            initialModuleId: 'simulation-labs',
          },
          reason: '建立目标课程与章节',
        },
        {
          tool: 'candidate.generate',
          arguments: { prompt, artifactType: 'simulation', candidateCount: 2 },
          reason: '生成教师要求的交互仿真方案',
        },
      ],
      deliverables: [],
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request({ ...body(), payload: { prompt, context: {} } }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.toolProposals.map((item: { tool: string }) => item.tool)).toEqual([
      'course.create',
    ]);
    expect(result.result.generationOptions).toEqual(
      expect.objectContaining({
        targetTool: 'candidate.generate',
        artifactType: 'simulation',
        options: expect.any(Array),
      }),
    );
    expect(result.result.generationOptions.options).toHaveLength(3);
  });

  it('continues from the raw request when the optional planning pass is malformed', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({ text: '{"selectedSkills":[]}', usage: {} })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          answer: '我仍然根据教师原始请求完成了直接分析。',
          suggestions: [],
          toolProposals: [],
          deliverables: [],
        }),
        usage: {},
      });
    const originalPrompt = '比较当前课程的两个教学路径并说明取舍。';
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({ ...body(), payload: { prompt: originalPrompt, context: { platformFacts: {} } } }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.answer).toContain('直接分析');
    expect(mocks.callLLM.mock.calls[1][0].prompt).toContain(originalPrompt);
  });

  it('applies a simple slide addition locally without asking the model to rewrite full content', async () => {
    const currentContent = {
      schema: 'aisecedu.global-agent.artifact.v1',
      artifactType: 'slide-deck',
      renderer: 'agent-runtime-stage',
      plan: { title: 'SQL 注入防御课件', durationMinutes: 20 },
      lesson: {
        id: 'artifact_slide',
        title: 'SQL 注入防御课件',
        artifacts: [
          {
            id: 'slide_1',
            type: 'slide',
            title: '输入边界',
            outline: {
              id: 'outline_1',
              type: 'slide',
              title: '输入边界',
              description: '识别不可信输入。',
              keyPoints: ['输入验证'],
              order: 1,
            },
            content: { elements: [{ id: 'original', type: 'text', content: '<p>原始页</p>' }] },
            order: 1,
            createdAt: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    const requestBody = {
      ...body('artifact.revise'),
      payload: {
        artifactId: 'artifact_slide',
        artifactType: 'slide-deck',
        expectedRevision: 3,
        instruction: '把刚才生成的课件修改为增加一页参数化查询前后对比，并保持20分钟',
        currentContent,
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.content.lesson.artifacts).toHaveLength(2);
    expect(result.result.content.lesson.artifacts[1]).toMatchObject({
      type: 'slide',
      title: '参数化查询前后对比',
      content: {
        speakerNotes: expect.stringContaining('参数化查询前后对比'),
        remark: expect.stringContaining('参数化查询前后对比'),
      },
    });
    expect(
      result.result.content.lesson.artifacts[1].content.speakerNotes.replace(/\s+/g, '').length,
    ).toBeGreaterThanOrEqual(60);
    expect(result.result.content.plan.durationMinutes).toBe(20);
    expect(result.result.content.lesson.artifacts[0].content).toEqual(
      currentContent.lesson.artifacts[0].content,
    );
    expect(result.model.executionMode).toBe('deterministic-structured-edit');
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('uses a compact edit plan for non-trivial revisions and preserves omitted content', async () => {
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        edit: {
          title: null,
          description: null,
          durationMinutes: null,
          addSections: [],
          updateSections: [
            {
              index: 0,
              title: '不可信输入与边界',
              description: '突出信任边界。',
              keyPoints: ['来源识别', '边界验证'],
            },
          ],
          removeSectionIndexes: [],
        },
      }),
      usage: { inputTokens: 40, outputTokens: 30 },
    });
    const currentContent = {
      schema: 'aisecedu.global-agent.artifact.v1',
      artifactType: 'slide-deck',
      plan: { title: 'SQL 注入防御课件' },
      lesson: {
        id: 'artifact_slide',
        title: 'SQL 注入防御课件',
        artifacts: [
          {
            id: 'slide_1',
            type: 'slide',
            title: '输入边界',
            outline: {
              id: 'outline_1',
              type: 'slide',
              title: '输入边界',
              description: '旧说明',
              keyPoints: ['旧要点'],
              order: 1,
            },
            content: { html: '<html>DO_NOT_SEND_OR_REWRITE_THIS_HTML</html>' },
            order: 1,
            createdAt: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    const requestBody = {
      ...body('artifact.revise'),
      payload: {
        artifactId: 'artifact_slide',
        artifactType: 'slide-deck',
        expectedRevision: 3,
        instruction: '重写第1页的讲授重点，突出不可信输入的信任边界',
        currentContent,
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.content.lesson.artifacts[0]).toMatchObject({
      title: '不可信输入与边界',
      content: currentContent.lesson.artifacts[0].content,
    });
    const modelPrompt = mocks.callLLM.mock.calls[0][0].prompt as string;
    expect(modelPrompt).toContain('当前产物摘要');
    expect(modelPrompt).not.toContain('DO_NOT_SEND_OR_REWRITE_THIS_HTML');
  });

  it('keeps an explicit slide count by merging model additions into existing pages', async () => {
    const additions = ['攻防链同页对照', '参数化查询代码', '日志证据处置图', '形成性检查题'].map(
      (title) => ({
        title,
        description: `把${title}整合进现有教学叙事。`,
        keyPoints: [`${title}的事实证据`, `${title}的课堂验证`],
        speakerNotes: `先回顾上一页已经建立的判断依据，再围绕${title}补充一个具体证据和可观察结果。指出学习者最容易混淆的边界，要求其解释结论、证据与修复动作之间的关系；确认预期回应完整后，再自然过渡到下一页的应用与验证。`,
      }),
    );
    mocks.callLLM.mockResolvedValue({
      text: JSON.stringify({
        edit: {
          title: null,
          description: null,
          durationMinutes: null,
          addSections: additions,
          updateSections: [],
          removeSectionIndexes: [],
        },
      }),
      usage: { inputTokens: 50, outputTokens: 60 },
    });
    const currentContent = {
      schema: 'aisecedu.global-agent.artifact.v1',
      artifactType: 'slide-deck',
      plan: { title: 'Web 安全纵深防御' },
      lesson: {
        id: 'artifact_fourteen',
        title: 'Web 安全纵深防御',
        artifacts: Array.from({ length: 14 }, (_, index) => ({
          id: `slide_${index + 1}`,
          type: 'slide',
          title: index === 0 ? '课程导入' : index === 13 ? '总结与迁移' : `教学页面 ${index + 1}`,
          outline: {
            id: `outline_${index + 1}`,
            type: 'slide',
            title: index === 0 ? '课程导入' : index === 13 ? '总结与迁移' : `教学页面 ${index + 1}`,
            description: `第 ${index + 1} 页原始说明`,
            keyPoints: [`原始要点 ${index + 1}`],
            order: index + 1,
          },
          content: {
            elements: [{ id: `text_${index + 1}`, type: 'text', content: '原始内容' }],
            speakerNotes: `这是第 ${index + 1} 页的原始讲稿，包含衔接、具体证据、常见误区、预期回答和下一页过渡，确保教师能够直接授课并观察学习者是否真正理解。`,
          },
          order: index + 1,
          createdAt: 1,
        })),
        createdAt: 1,
        updatedAt: 1,
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.revise'),
        payload: {
          artifactId: 'artifact_fourteen',
          artifactType: 'slide-deck',
          expectedRevision: 1,
          instruction:
            '同时加入攻防链同页对照、参数化查询代码、日志证据处置图和形成性检查题，并保持总页数恰好为 14 个完整教学页。',
          currentContent,
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.content.lesson.artifacts).toHaveLength(14);
    const revisedText = JSON.stringify(result.result.content.lesson.artifacts);
    for (const addition of additions) expect(revisedText).toContain(addition.title);
    expect(result.result.content.lesson.artifacts[0].title).toBe('课程导入');
    expect(result.result.content.lesson.artifacts[13].title).toBe('总结与迁移');
    const modelSystem = mocks.callLLM.mock.calls[0][0].system as string;
    expect(modelSystem).toContain('必须恰好生成 14 个完整教学页面');
    expect(modelSystem).toContain('必须使用 updateSections');
  });

  it('regenerates simulation HTML for a natural-language revision and preserves identity', async () => {
    const newHtml = `<!doctype html><html><body><button id="reset">reset</button><div id="controls"></div><div id="evidence"></div><ol id="events"></ol><script>var range='<input type="range">';var toggle='<input type="checkbox">';window.parent.postMessage({type:'aisecedu:simulation'},'*');function receive(event){if(event.data.type==='SET_WIDGET_STATE')return;}</script><script type="application/json" id="widget-config">{"type":"simulation-scenario","controls":[],"evidenceChannels":[],"scenes":[]}</script>${'交互证据'.repeat(800)}</body></html>`;
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string; description: string }, order: number) => ({
        id: 'new_generated_id',
        type: input.type,
        title: input.title,
        outline: {
          id: 'new_outline_id',
          type: input.type,
          title: input.title,
          description: input.description,
          keyPoints: [],
          order,
        },
        content: {
          html: newHtml,
          widgetType: 'simulation',
          widgetConfig: { type: 'simulation-scenario', controls: [], evidenceChannels: [] },
        },
        order,
        createdAt: 99,
      }),
    );
    const currentContent = {
      schema: 'aisecedu.global-agent.artifact.v1',
      artifactType: 'simulation',
      plan: { title: 'SQL 注入攻防模拟' },
      lesson: {
        id: 'artifact_simulation',
        title: 'SQL 注入攻防模拟',
        artifacts: [
          {
            id: 'simulation_phase_1',
            type: 'simulation',
            title: '请求与查询变化',
            outline: {
              id: 'outline_phase_1',
              title: '请求与查询变化',
              description: '旧模拟说明',
              keyPoints: ['观察输入与查询'],
              order: 1,
            },
            content: {
              html: '<!doctype html><html><body>OLD_SIMULATION_HTML</body></html>',
              widgetType: 'simulation',
              widgetConfig: {
                type: 'simulation-scenario',
                startScene: 's1',
                scenes: [{ id: 's1', title: '旧场景', narrative: '旧证据' }],
              },
            },
            order: 1,
            createdAt: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    };
    const instruction =
      '增加攻击强度滑杆、参数化查询开关、请求与 SQL 与日志与响应四路证据，并确保重置恢复默认状态。';
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.revise'),
        payload: {
          artifactId: 'artifact_simulation',
          artifactType: 'simulation',
          expectedRevision: 2,
          instruction,
          currentContent,
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.model.executionMode).toBe('simulation-regeneration');
    expect(result.result.content.lesson.artifacts[0]).toMatchObject({
      id: 'simulation_phase_1',
      order: 1,
      createdAt: 1,
      outline: { id: 'outline_phase_1', order: 1 },
      content: { html: newHtml },
    });
    expect(result.result.content.lesson.artifacts[0].content.html).not.toContain(
      'OLD_SIMULATION_HTML',
    );
    expect(result.result.content.revisionMetadata.mode).toBe('simulation-regeneration');
    const generationInput = mocks.generateSingleArtifact.mock.calls[0][0];
    expect(mocks.generateSingleArtifact.mock.calls[0][3]).toMatchObject({
      deterministicSimulation: true,
    });
    expect(generationInput.description).toContain('攻击强度滑杆');
    expect(generationInput.description).toContain('参数化查询开关');
    expect(generationInput.description).toContain('请求与 SQL 与日志与响应四路证据');
    expect(generationInput.description).toContain('旧场景');
  });

  it('materializes every string outline item as an engine-backed simulation', async () => {
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string }, order: number) => ({
        id: `simulation_${order}`,
        type: input.type,
        title: input.title,
        outline: { ...input, id: `outline_${order}`, order },
        content: {
          html: `<main data-simulation="${order}"></main>`,
          widgetType: 'simulation',
          widgetConfig: { type: 'simulation-scenario', stateTransitions: ['ready', 'active'] },
        },
        order,
        createdAt: 1,
      }),
    );
    const requestBody = {
      ...body('artifact.materialize'),
      payload: {
        artifactId: 'artifact_simulation',
        title: 'Diffie-Hellman 中间人攻击仿真',
        artifactType: 'simulation',
        plan: {
          title: 'Diffie-Hellman 中间人攻击仿真',
          objectives: ['观察密钥协商中的状态变化'],
          outline: ['参数与参与方初始化', 'Mallory 拦截并替换公钥', '比较共享密钥并复盘'],
        },
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateSingleArtifact).toHaveBeenCalledTimes(3);
    for (const call of mocks.generateSingleArtifact.mock.calls) {
      expect(call[0]).toMatchObject({ type: 'simulation' });
      expect(call[3]).toMatchObject({ deterministicSimulation: true });
    }
    expect(result.result.content.artifactType).toBe('simulation');
    expect(result.result.content.lesson.artifacts).toHaveLength(3);
    expect(result.result.content.lesson.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'simulation',
          content: expect.objectContaining({
            html: expect.stringContaining('data-simulation'),
            widgetType: 'simulation',
            widgetConfig: expect.objectContaining({ type: 'simulation-scenario' }),
          }),
        }),
      ]),
    );
    expect(result.result.content.lesson.artifacts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'quiz' })]),
    );
  });

  it('distributes a three-question single-choice plan without changing question type', async () => {
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string }, order: number) => ({
        id: `quiz_${order}`,
        type: input.type,
        title: input.title,
        outline: { ...input, id: `outline_${order}`, order },
        content: { questions: [] },
        order,
        createdAt: 1,
      }),
    );
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.materialize'),
        payload: {
          artifactId: 'artifact_quiz',
          title: '无线异常处置自检题',
          artifactType: 'quiz',
          plan: {
            objectives: ['形成诊断假设', '验证处置效果', '完成复盘'],
            outline: ['基线', '假设', '复测'],
            assessment: ['生成三道自检单选题并提供即时反馈'],
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.generateSingleArtifact).toHaveBeenCalledTimes(3);
    for (const call of mocks.generateSingleArtifact.mock.calls) {
      expect(call[0]).toMatchObject({
        type: 'quiz',
        quizConfig: {
          questionCount: 1,
          questionTypes: ['single'],
        },
      });
    }
  });

  it('preserves an exact quiz count from the original request when the compact plan omits it', async () => {
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string }, order: number) => ({
        id: `personal_quiz_${order}`,
        type: input.type,
        title: input.title,
        outline: { ...input, id: `personal_outline_${order}`, order },
        content: { questions: [] },
        order,
        createdAt: 1,
      }),
    );
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.materialize'),
        payload: {
          artifactId: 'artifact_personal_quiz',
          title: '无线异常处置个人自检',
          artifactType: 'quiz',
          requestPrompt:
            '围绕刚才的无线异常处置生成三道个人自检单选题；每题至少给出两个可选项并提供即时解释反馈。',
          plan: {
            objectives: ['识别异常证据', '选择处置动作'],
            outline: ['异常证据识别', '处置效果复核'],
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.generateSingleArtifact).toHaveBeenCalledTimes(2);
    const configs = mocks.generateSingleArtifact.mock.calls.map((call) => call[0].quizConfig);
    expect(configs.reduce((sum, config) => sum + config.questionCount, 0)).toBe(3);
    expect(configs).toEqual([
      expect.objectContaining({ questionCount: 2, questionTypes: ['single'] }),
      expect.objectContaining({ questionCount: 1, questionTypes: ['single'] }),
    ]);
  });

  it('materializes independent simulation phases concurrently while preserving order', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string }, order: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return {
          id: `simulation_${order}`,
          type: input.type,
          title: input.title,
          outline: { ...input, id: `outline_${order}`, order },
          content: {
            html: `<main data-simulation="${order}"></main>`,
            widgetType: 'simulation',
          },
          order,
          createdAt: 1,
        };
      },
    );
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.materialize'),
        payload: {
          artifactId: 'artifact_parallel_simulation',
          title: 'SQL 注入攻防模拟实训',
          artifactType: 'simulation',
          plan: { outline: ['参数初始化', '执行攻击', '切换防御', '复盘'] },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(maxActive).toBe(4);
    expect(
      result.result.content.lesson.artifacts.map((item: { order: number }) => item.order),
    ).toEqual([1, 2, 3, 4]);
  });

  it('materializes a slide-deck outline as renderable global-agent pages', async () => {
    let active = 0;
    let maxActive = 0;
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string; description?: string }, order: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const layout = input.description?.match(/版式意图：([a-z-]+)/)?.[1] || 'concept';
        return {
          id: `slide_${order}`,
          type: input.type,
          title: input.title,
          outline: { ...input, id: `outline_${order}`, order },
          content: {
            layout,
            speakerNotes: `先连接上一页的关键结论，再讲解第 ${order} 页的具体证据与关键关系。提醒学习者识别一个常见误区，并提出过渡问题，要求回答包含判断依据和可观察结果；确认预期回应完整后，再引导进入下一页的应用或验证。`,
            remark: `先连接上一页的关键结论，再讲解第 ${order} 页的具体证据与关键关系。提醒学习者识别一个常见误区，并提出过渡问题，要求回答包含判断依据和可观察结果；确认预期回应完整后，再引导进入下一页的应用或验证。`,
            elements: Array.from({ length: 6 }, (_, index) => ({
              id: `text_${order}_${index}`,
              type: 'text',
              content: `${input.title}：这是第 ${order} 页可直接讲授的完整正文、具体证据、解释关系和验证标准。`,
            })),
          },
          order,
          createdAt: 1,
        };
      },
    );
    const requestBody = {
      ...body('artifact.materialize'),
      payload: {
        artifactId: 'artifact_slides',
        title: '现代密码学导论课件',
        artifactType: 'slide-deck',
        plan: {
          title: '现代密码学导论课件',
          objectives: ['区分对称与非对称密码'],
          outline: ['课程导入', '核心概念对比', '课堂总结'],
        },
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateSingleArtifact).toHaveBeenCalledTimes(14);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(result.result.content.lesson.artifacts).toHaveLength(14);
    expect(result.result.content.lesson.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'slide',
          content: expect.objectContaining({ elements: expect.any(Array), layout: 'cover' }),
        }),
        expect.objectContaining({
          type: 'slide',
          content: expect.objectContaining({ elements: expect.any(Array), layout: 'summary' }),
        }),
      ]),
    );
    expect(result.result.validation).toMatchObject({
      artifactCount: 14,
      quality: {
        pageCount: 14,
        substantivePages: 14,
        layoutCount: expect.any(Number),
        hasSummary: true,
      },
    });
  });

  it('materializes exactly the teacher-specified number of slides without padding', async () => {
    mocks.generateSingleArtifact.mockImplementation(
      async (input: { type: string; title: string; description?: string }, order: number) => {
        const layout = input.description?.match(/版式意图：([a-z-]+)/)?.[1] || 'concept';
        return {
          id: `exact_slide_${order}`,
          type: input.type,
          title: input.title,
          outline: { ...input, id: `exact_outline_${order}`, order },
          content: {
            layout,
            speakerNotes: `先回顾上一页的证据，再讲解第 ${order} 页的具体机制、关键关系与验证标准。指出一个常见误区和对应修正方法，随后提出可观察的检查问题并说明预期回应；确认学习者能用依据解释结论后，再过渡到下一页。`,
            remark: `先回顾上一页的证据，再讲解第 ${order} 页的具体机制、关键关系与验证标准。指出一个常见误区和对应修正方法，随后提出可观察的检查问题并说明预期回应；确认学习者能用依据解释结论后，再过渡到下一页。`,
            elements: Array.from({ length: 6 }, (_, index) => ({
              id: `exact_text_${order}_${index}`,
              type: 'text',
              content: `${input.title}：本页提供可直接授课的具体正文、完整证据、原理解释、实例和可观察的验证标准。`,
            })),
          },
          order,
          createdAt: 1,
        };
      },
    );
    const outline = completeSlideDeckOutline(6);
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body('artifact.materialize'),
        payload: {
          artifactId: 'artifact_exact_six_slides',
          title: '6 页安全课件',
          artifactType: 'slide-deck',
          plan: {
            title: '6 页安全课件',
            objectives: ['识别输入边界并验证修复'],
            outline,
            pageCountPolicy: {
              min: 6,
              max: 6,
              preferred: 6,
              explicit: true,
              source: 'exact',
            },
          },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.generateSingleArtifact).toHaveBeenCalledTimes(6);
    expect(result.result.content.lesson.artifacts).toHaveLength(6);
    expect(result.result.validation.quality).toMatchObject({
      pageCount: 6,
      substantivePages: 6,
      hasSummary: true,
    });
  });

  it('fails instead of fabricating a tool result when execution remains invalid JSON', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          understanding: '查看当前课程成员。',
          selectedSkills: [],
          plan: ['读取课程成员'],
        }),
        usage: {},
      })
      .mockResolvedValueOnce({ text: '当前模型输出暂时不可解析。', usage: {} });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt: '查看当前课程成员',
          context: { platformFacts: { course: { name: 'Web 安全' } } },
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'EXECUTION_FAILED' });
  });

  it('lets the model analyze verified progress facts directly', async () => {
    mockAgentTurn(
      {
        answer:
          '“软件安全”课程共有 3 人，1 人完成全部必修题，真实完成率为 33%；李同学需要补齐一题，王同学尚无作答。',
        suggestions: [],
        toolProposals: [],
        deliverables: [],
      },
      {
        understanding: '依据真实判题与作答事实分析软件安全课程学情。',
        selectedSkills: ['learning-evidence-analysis'],
        plan: ['核对指标口径', '分析完成与参与情况'],
      },
    );
    const requestBody = {
      ...body(),
      payload: {
        prompt: '分析一下软件安全课程的学习情况',
        context: {
          platformFacts: {
            course: { name: '软件安全', referenceId: 'software-security' },
            verifiedProgress: {
              studentCount: 3,
              verifiedCompleteCount: 1,
              requiredChallengeCount: 2,
              students: [
                { name: '张同学', verifiedCompletion: 1, attemptCount: 3 },
                { name: '李同学', verifiedCompletion: 0.5, attemptCount: 2 },
                { name: '王同学', verifiedCompletion: 0, attemptCount: 0 },
              ],
            },
          },
        },
      },
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(request(requestBody));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result.answer).toContain('真实完成率为 33%');
    expect(result.result.answer).toContain('李同学');
    expect(result.result.answer).toContain('王同学');
    expect(result.result.toolProposals).toEqual([]);
    expect(result.result.selectedSkills).toEqual(['learning-evidence-analysis']);
  });

  it('lets the model request the allowlisted course-list tool', async () => {
    mockAgentTurn({
      answer: '我会读取你有权管理的课程列表。',
      suggestions: [],
      toolProposals: [{ tool: 'course.list', arguments: {}, reason: '需要读取最新列表' }],
      deliverables: [],
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request({
        ...body(),
        payload: {
          prompt: '查看我可以管理的课程',
          context: { platformFacts: { availableCourses: [] } },
        },
      }),
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.result).toMatchObject({
      requiresAction: true,
      toolProposals: [{ tool: 'course.list', arguments: {}, reason: '需要读取最新列表' }],
    });
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });
});
