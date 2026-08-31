import { isLessonArtifactType, type LessonArtifactType } from '@/lib/types/lesson';
import type {
  TeachingPackagePlan,
  TeachingPlanInput,
  TeachingPlanItem,
  TeachingPlanSource,
} from '@/lib/types/teaching-plan';

const MAX_ITEMS = 8;
const DEFAULT_AUDIENCE = '按需求描述中的学习者基础组织教学';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function cleanStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => cleanString(entry, '', maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function clampMinutes(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(90, Math.max(3, Math.round(value)));
}

function defaultMinutes(type: LessonArtifactType): number {
  switch (type) {
    case 'slide':
    case 'diagram':
    case 'visualization3d':
      return 10;
    case 'quiz':
    case 'game':
      return 8;
    case 'code':
    case 'procedural-skill':
      return 18;
    case 'simulation':
      return 15;
    case 'vulnerable-lab':
      return 30;
    case 'debate':
      return 25;
  }
}

function defaultQuality(type: LessonArtifactType): 'fast' | 'rich' {
  return ['vulnerable-lab', 'simulation', 'visualization3d'].includes(type) ? 'rich' : 'fast';
}

/**
 * Runtime-validation boundary for untrusted planner model output. Invalid
 * entries are dropped instead of being forwarded to the generation API.
 */
export function normalizeTeachingPlan(
  raw: unknown,
  input: TeachingPlanInput,
  source: TeachingPlanSource = 'ai',
): TeachingPackagePlan | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;

  const items: TeachingPlanItem[] = [];
  for (const candidate of raw.items.slice(0, MAX_ITEMS)) {
    if (!isRecord(candidate) || !isLessonArtifactType(candidate.type)) continue;
    const type = candidate.type;
    const title = cleanString(candidate.title, '', 120);
    if (!title) continue;
    items.push({
      id: `plan-${items.length + 1}-${type}`,
      type,
      title,
      purpose: cleanString(candidate.purpose, `帮助学生掌握“${input.topic}”`, 400),
      reason: cleanString(candidate.reason, `该形式适合本环节的教学目标`, 400),
      keyPoints: cleanStringArray(candidate.keyPoints, 8, 160),
      estimatedMinutes: clampMinutes(candidate.estimatedMinutes, defaultMinutes(type)),
      quality:
        candidate.quality === 'rich' || candidate.quality === 'fast'
          ? candidate.quality
          : defaultQuality(type),
    });
  }
  if (items.length === 0) return null;

  const learningObjectives = cleanStringArray(raw.learningObjectives, 8, 240);
  const safetyNotes = cleanStringArray(raw.safetyNotes, 6, 300);
  return {
    title: cleanString(raw.title, input.topic, 120),
    summary: cleanString(raw.summary, `围绕“${input.topic}”组织的智能教学包`, 500),
    audience: cleanString(raw.audience, DEFAULT_AUDIENCE, 240),
    learningObjectives:
      learningObjectives.length > 0
        ? learningObjectives
        : [`理解${input.topic}的关键概念`, `能够把所学应用到具体情境`],
    decisionSummary: cleanString(
      raw.decisionSummary,
      '依据教学目标、知识复杂度和实践要求选择内容形式，并按认知递进顺序组织。',
      600,
    ),
    safetyNotes,
    totalMinutes: items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    items,
    source,
  };
}

interface FallbackDefinition {
  type: LessonArtifactType;
  title: string;
  purpose: string;
  reason: string;
  keyPoints: string[];
}

function requestedTypeSignals(text: string): Set<LessonArtifactType> {
  const types = new Set<LessonArtifactType>();
  const signal = (type: LessonArtifactType, pattern: RegExp) => {
    if (pattern.test(text)) types.add(type);
  };
  signal('slide', /课件|幻灯|ppt|讲义|概念讲解/i);
  signal('quiz', /习题|练习题|题库|测验|测试|考核|问答/i);
  signal('diagram', /图示|图解|流程图|架构图|拓扑|攻击链|威胁模型|时序图/i);
  signal('simulation', /仿真|模拟实验|动态演示|沙盘/i);
  signal('code', /代码|编程|编码|程序实现|代码审计|修复代码/i);
  signal('procedural-skill', /操作指南|检查清单|处置流程|流程演练|步骤训练/i);
  signal('game', /游戏|闯关|竞赛|积分挑战/i);
  signal('visualization3d', /3d|三维|立体模型/i);
  signal('vulnerable-lab', /靶场|靶标|攻防实验|漏洞实验|渗透实验|实操环境/i);
  signal('debate', /辩论|正反方|立场讨论|圆桌讨论|争议讨论/i);
  return types;
}

function explicitlyExcluded(text: string, type: LessonArtifactType): boolean {
  const labels: Record<LessonArtifactType, string> = {
    slide: '课件|幻灯|ppt|讲义',
    quiz: '习题|练习题|测验|测试|题库',
    diagram: '图示|图解|流程图|架构图|拓扑图',
    simulation: '仿真|模拟',
    code: '代码|编程',
    'procedural-skill': '操作指南|流程演练|检查清单',
    game: '游戏|闯关|竞赛',
    visualization3d: '3d|三维',
    'vulnerable-lab': '靶场|靶标|实验|实操',
    debate: '辩论|讨论',
  };
  return new RegExp(`(?:不要|无需|不需要|排除|禁止)[^。；,，]{0,12}(?:${labels[type]})`, 'i').test(
    text,
  );
}

function fallbackDefinition(type: LessonArtifactType, topic: string): FallbackDefinition {
  const definitions: Record<LessonArtifactType, Omit<FallbackDefinition, 'type'>> = {
    slide: {
      title: `${topic}：核心概念与案例`,
      purpose: '建立共同知识基础，讲清关键概念、风险与应用情境。',
      reason: '该需求包含需要先行解释的知识结构，课件适合完成导入和概念建模。',
      keyPoints: ['核心概念', '典型情境', '关键误区'],
    },
    quiz: {
      title: `${topic}：理解与迁移测验`,
      purpose: '检查概念理解，并通过情境题验证知识迁移。',
      reason: '形成性评价能及时暴露误区，并给教师提供后续讲解依据。',
      keyPoints: ['概念辨析', '情境判断', '反馈解析'],
    },
    diagram: {
      title: `${topic}：结构与关键链路`,
      purpose: '把组成关系、数据流或攻防链路可视化。',
      reason: '需求涉及多环节关系，用图示比纯文字更容易建立整体心智模型。',
      keyPoints: ['关键角色', '数据或控制流', '风险与防护节点'],
    },
    simulation: {
      title: `${topic}：交互仿真实验`,
      purpose: '通过参数变化和即时反馈观察系统行为。',
      reason: '动态机制需要“改变条件—观察结果”的交互方式才能充分理解。',
      keyPoints: ['变量控制', '现象观察', '结果解释'],
    },
    code: {
      title: `${topic}：代码实现与修复`,
      purpose: '通过阅读、补全或修复代码巩固工程能力。',
      reason: '教学目标包含实现或审计，代码练习能直接检验可操作能力。',
      keyPoints: ['问题定位', '安全实现', '测试验证'],
    },
    'procedural-skill': {
      title: `${topic}：步骤化操作演练`,
      purpose: '把任务拆解为可执行步骤、工具和成功标准。',
      reason: '该目标强调操作流程，步骤化训练便于练习、检查和复盘。',
      keyPoints: ['前置检查', '操作步骤', '成功标准'],
    },
    game: {
      title: `${topic}：课堂闯关挑战`,
      purpose: '用挑战、反馈和积分提高重复练习的参与度。',
      reason: '需求强调竞赛或游戏化，闯关形式适合快速巩固与课堂互动。',
      keyPoints: ['分层挑战', '即时反馈', '学习成就'],
    },
    visualization3d: {
      title: `${topic}：三维结构探索`,
      purpose: '从多个视角探索空间结构和部件关系。',
      reason: '学习对象具有明显空间结构，三维操作比二维描述更直观。',
      keyPoints: ['空间关系', '视角切换', '结构标注'],
    },
    'vulnerable-lab': {
      title: `${topic}：受控攻防实验`,
      purpose: '在授权沙箱中完成现象复现、检测、修复和回归验证。',
      reason: '该安全主题需要动手验证，受控靶场能形成“攻击理解—防御修复”闭环。',
      keyPoints: ['授权边界', '漏洞现象', '检测与修复', '回归验证'],
    },
    debate: {
      title: `${topic}：多智能体立场辩论`,
      purpose: '比较相互竞争的立场、证据和现实约束，训练论证与决策能力。',
      reason: '需求包含伦理、法律、政策或工程权衡，单向讲授不足以呈现立场冲突。',
      keyPoints: ['正方论据', '反方论据', '证据核查', '权衡结论'],
    },
  };
  return { type, ...definitions[type] };
}

/**
 * Deterministic continuity path used only when the configured planning model is
 * unavailable or returns malformed output. It still follows requirement
 * signals and explicit exclusions, so the UI remains usable offline.
 */
export function createFallbackTeachingPlan(input: TeachingPlanInput): TeachingPackagePlan {
  const topic = cleanString(input.topic, '未命名主题', 120);
  const text = `${topic}\n${input.description ?? ''}`;
  const lower = text.toLowerCase();
  const requested = requestedTypeSignals(lower);
  const exclusiveClause = text.match(/(?:只|仅)(?:需|要|生成|安排|设计|制作)?[^。；\n]*/i)?.[0];
  const exclusiveRequested = exclusiveClause
    ? requestedTypeSignals(exclusiveClause.toLowerCase())
    : new Set<LessonArtifactType>();
  const selected = new Set<LessonArtifactType>();
  const add = (type: LessonArtifactType) => {
    if (!explicitlyExcluded(text, type)) selected.add(type);
  };

  if (exclusiveRequested.size > 0) {
    exclusiveRequested.forEach(add);
  } else {
    add('slide');

    if (/架构|拓扑|协议|流程|链路|威胁模型|数据流|注入|xss|csrf|越权|中间人|攻击面/i.test(text)) {
      add('diagram');
    }
    if (/漏洞|注入|xss|csrf|越权|渗透|攻防|逆向|恶意代码|安全测试|密码分析/i.test(text)) {
      add('vulnerable-lab');
    }
    if (/伦理|法律|法规|合规|政策|责任|隐私|披露|权衡|利弊|争议|是否应该/i.test(text)) {
      add('debate');
    }
    if (/代码|编程|实现|审计|修复|开发|算法/i.test(text)) add('code');
    if (/仿真|模拟|动态演示|变量变化|演化过程|传播过程/i.test(text)) add('simulation');
    if (/处置|应急响应|操作步骤|检查清单|运维|排障/i.test(text)) add('procedural-skill');
    if (/游戏|闯关|竞赛|积分/i.test(text)) add('game');
    if (/3d|三维|空间结构/i.test(text)) add('visualization3d');

    requested.forEach(add);
    add('quiz');
  }

  if (selected.size === 0) add('slide');
  const pedagogicalOrder: readonly LessonArtifactType[] = [
    'slide',
    'diagram',
    'visualization3d',
    'simulation',
    'code',
    'procedural-skill',
    'vulnerable-lab',
    'debate',
    'game',
    'quiz',
  ];
  const ordered = pedagogicalOrder.filter((type) => selected.has(type)).slice(0, 6);
  const raw = {
    title: topic,
    summary: `围绕“${topic}”按认知理解、实践应用与学习评价组织教学内容。`,
    audience: DEFAULT_AUDIENCE,
    learningObjectives: [
      `解释${topic}的关键概念与适用边界`,
      `在具体情境中分析并应用${topic}相关知识`,
      '依据证据完成判断、实践或反思',
    ],
    decisionSummary:
      '当前使用本地教学规则完成兜底规划；内容类型由需求关键词、学习活动特征和显式排除条件共同决定。',
    safetyNotes: selected.has('vulnerable-lab')
      ? ['攻防实验仅限授权、隔离的教学环境，并同时覆盖检测、修复与复盘。']
      : [],
    items: ordered.map((type) => {
      const definition = fallbackDefinition(type, topic);
      return {
        ...definition,
        estimatedMinutes: defaultMinutes(type),
        quality: defaultQuality(type),
      };
    }),
  };
  // This cannot be null because at least one valid definition is inserted.
  return normalizeTeachingPlan(raw, input, 'fallback')!;
}
