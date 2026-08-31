/** Canonical Agent Zoo and governed workflow templates for 玄甲. */

export type SecurityAgentCategory =
  | 'teaching'
  | 'adversarial'
  | 'assessment'
  | 'generation'
  | 'orchestration';

export type SecurityAgentStatus = 'ready' | 'guarded' | 'adapter-required';

export interface SecurityAgentDefinition {
  id: string;
  name: string;
  englishName: string;
  category: SecurityAgentCategory;
  responsibility: string;
  inputs: string[];
  outputs: string[];
  execution: 'llm' | 'deterministic' | 'hybrid' | 'external-runtime';
  autonomy: 'advisory' | 'supervised' | 'automatic';
  status: SecurityAgentStatus;
  guardrails: string[];
}

export interface AgentWorkflowStage {
  id: string;
  label: string;
  agentIds: string[];
  gate?: string;
  evidence?: string;
}

export interface AgentWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
  stages: AgentWorkflowStage[];
}

export const SECURITY_AGENT_CATALOG: readonly SecurityAgentDefinition[] = [
  {
    id: 'orchestrator',
    name: '教学编排官',
    englishName: 'Orchestrator',
    category: 'orchestration',
    responsibility: '拆解教学目标、选择工作流并控制智能体交接，不直接修改成绩或发布内容。',
    inputs: ['教学目标', '课程上下文', '学习者画像摘要', '策略约束'],
    outputs: ['结构化执行计划', 'Agent 任务包', '运行状态'],
    execution: 'hybrid',
    autonomy: 'supervised',
    status: 'ready',
    guardrails: ['只调用白名单工具', '高风险动作需要教师确认', '保留完整运行轨迹'],
  },
  {
    id: 'creator',
    name: '课程设计师',
    englishName: 'Creator',
    category: 'generation',
    responsibility: '把课程目标和材料转化为大纲、课件、测验与互动活动。',
    inputs: ['课程材料', '培养方案', '教学目标'],
    outputs: ['场景大纲', '课堂产物草稿'],
    execution: 'llm',
    autonomy: 'supervised',
    status: 'ready',
    guardrails: ['引用来源可追溯', '双重用途内容配防御与伦理说明', '发布前教师复核'],
  },
  {
    id: 'scenario-gen',
    name: '场景架构师',
    englishName: 'ScenarioGen',
    category: 'generation',
    responsibility: '将模糊主题细化为可教、可交互、可评价的安全场景。',
    inputs: ['主题', '受众', '时长', '材料证据'],
    outputs: ['候选场景', '教学目标', '难度与风险标记'],
    execution: 'llm',
    autonomy: 'advisory',
    status: 'ready',
    guardrails: ['不生成针对真实目标的攻击指令', '明确授权范围', '输出可由教师编辑'],
  },
  {
    id: 'topology-gen',
    name: '拓扑设计师',
    englishName: 'TopologyGen',
    category: 'generation',
    responsibility: '生成网络、协议、攻击树和威胁模型可视化。',
    inputs: ['场景结构', '资产与信任边界'],
    outputs: ['结构化拓扑', '交互图示'],
    execution: 'hybrid',
    autonomy: 'supervised',
    status: 'ready',
    guardrails: ['结构 Schema 校验', '渲染在隔离 iframe', '禁止注入外部脚本'],
  },
  {
    id: 'vuln-gen',
    name: '漏洞实验设计师',
    englishName: 'VulnGen',
    category: 'generation',
    responsibility: '设计教学用漏洞模拟与修复对照，不触达未经授权的真实系统。',
    inputs: ['漏洞类别', '学习目标', '成熟度等级'],
    outputs: ['模拟实验', '防御对照', '安全说明'],
    execution: 'llm',
    autonomy: 'supervised',
    status: 'guarded',
    guardrails: ['仅教学沙箱', '攻击与防御成对输出', '内容校验通过后才可发布'],
  },
  {
    id: 'lecturer',
    name: 'AI 安全教授',
    englishName: 'Lecturer',
    category: 'teaching',
    responsibility: '按威胁模型组织讲授，使用白板、提问和案例推进课堂。',
    inputs: ['课堂场景', '讲授动作', '实时互动'],
    outputs: ['讲解', '白板动作', '追问'],
    execution: 'llm',
    autonomy: 'automatic',
    status: 'ready',
    guardrails: ['不泄露系统提示', '不代替学生完成受评任务', '声明不确定信息'],
  },
  {
    id: 'tutor',
    name: '渐进式助教',
    englishName: 'Tutor',
    category: 'teaching',
    responsibility: '依据当前场景与学生提问给出由浅入深的提示。',
    inputs: ['学生问题', '场景上下文', '允许提示级别'],
    outputs: ['苏格拉底式追问', '分级提示', '延伸材料'],
    execution: 'llm',
    autonomy: 'automatic',
    status: 'ready',
    guardrails: ['不直接泄露答案', '只读取公开教学上下文', '学生可请求解释依据'],
  },
  {
    id: 'mentor',
    name: '成长教练',
    englishName: 'Mentor',
    category: 'teaching',
    responsibility: '基于可追溯证据解释画像并提出下一步学习建议。',
    inputs: ['能力证据', '兴趣信号', '课程目标'],
    outputs: ['学习建议', '复习路径', '反思问题'],
    execution: 'hybrid',
    autonomy: 'advisory',
    status: 'guarded',
    guardrails: ['无证据不打分', '建议与正式成绩分离', '允许教师覆盖'],
  },
  {
    id: 'simulator',
    name: '环境模拟官',
    englishName: 'Simulator',
    category: 'adversarial',
    responsibility: '在浏览器模拟器或外接靶场中启动受控教学场景。',
    inputs: ['已审批场景', '隔离策略', '资源配额'],
    outputs: ['实验会话', '环境状态', '审计事件'],
    execution: 'external-runtime',
    autonomy: 'supervised',
    status: 'adapter-required',
    guardrails: ['默认拒绝外网', '会话级隔离', '到期销毁', '不向 LLM 暴露基础设施凭据'],
  },
  {
    id: 'attack-bot',
    name: '红队对手',
    englishName: 'AttackBot',
    category: 'adversarial',
    responsibility: '在授权范围内模拟攻击策略，训练学生的检测与响应。',
    inputs: ['目标状态摘要', '允许动作集', '难度策略'],
    outputs: ['候选动作', '对抗事件'],
    execution: 'external-runtime',
    autonomy: 'supervised',
    status: 'adapter-required',
    guardrails: ['动作白名单', '目标绑定', '速率与资源限制', '执行前策略判定'],
  },
  {
    id: 'defense-bot',
    name: '蓝队对手',
    englishName: 'DefenseBot',
    category: 'adversarial',
    responsibility: '模拟检测、阻断和恢复策略，训练学生的攻击链推理。',
    inputs: ['防御遥测摘要', '允许动作集', '难度策略'],
    outputs: ['防御动作', '对抗事件'],
    execution: 'external-runtime',
    autonomy: 'supervised',
    status: 'adapter-required',
    guardrails: ['动作白名单', '不读取学生私密数据', '全部动作可回放'],
  },
  {
    id: 'strategy-advisor',
    name: '策略顾问',
    englishName: 'StrategyAdvisor',
    category: 'adversarial',
    responsibility: '旁路分析对抗局势，在允许的提示级别内提供策略反馈。',
    inputs: ['脱敏事件流', '任务目标', '提示策略'],
    outputs: ['策略提示', '风险提醒'],
    execution: 'llm',
    autonomy: 'advisory',
    status: 'guarded',
    guardrails: ['不执行命令', '不越过提示级别', '敏感内容脱敏'],
  },
  {
    id: 'annotator',
    name: '证据标注员',
    englishName: 'Annotator',
    category: 'assessment',
    responsibility: '把课堂与实验事件映射为能力证据候选。',
    inputs: ['签名事件', '场景 Rubric', '操作轨迹摘要'],
    outputs: ['证据标签', '置信度', '来源引用'],
    execution: 'hybrid',
    autonomy: 'automatic',
    status: 'guarded',
    guardrails: ['保留原始事件引用', 'LLM 标注只作候选', '低置信证据不进入评分'],
  },
  {
    id: 'solution-tester',
    name: '解法验证员',
    englishName: 'SolutionTester',
    category: 'assessment',
    responsibility: '验证生成题目是否可完成、可重置且评分事件可达。',
    inputs: ['题目包', '参考轨迹', '验证策略'],
    outputs: ['验证报告', '发布门禁结果'],
    execution: 'deterministic',
    autonomy: 'automatic',
    status: 'adapter-required',
    guardrails: ['隔离执行', '失败即阻止发布', '验证报告不可由 Creator 覆盖'],
  },
  {
    id: 'judge',
    name: '证据裁判',
    englishName: 'Judge',
    category: 'assessment',
    responsibility: '依据冻结 Rubric 汇总客观证据与教师评价，形成可申诉结果。',
    inputs: ['冻结 Rubric', '客观事件', '教师评语'],
    outputs: ['逐项结果', '证据引用', '反馈草稿'],
    execution: 'hybrid',
    autonomy: 'supervised',
    status: 'guarded',
    guardrails: ['模型文本不能直接判定通过', '评分版本不可变', '支持人工复核与申诉'],
  },
] as const;

export const SECURITY_AGENT_WORKFLOWS: readonly AgentWorkflowDefinition[] = [
  {
    id: 'lesson-design',
    name: '可信备课流水线',
    description: '从课程材料到可发布互动课堂，生成与验证职责分离。',
    trigger: '教师创建备课或上传材料',
    stages: [
      { id: 'plan', label: '目标拆解', agentIds: ['orchestrator'], evidence: '课程上下文快照' },
      { id: 'design', label: '内容与场景设计', agentIds: ['creator', 'scenario-gen', 'topology-gen', 'vuln-gen'], evidence: '大纲与来源引用' },
      { id: 'verify', label: '安全与可教性校验', agentIds: ['solution-tester'], gate: '验证失败不得发布', evidence: '验证报告' },
      { id: 'approve', label: '教师审批', agentIds: ['orchestrator'], gate: '教师确认发布', evidence: '审批记录' },
    ],
  },
  {
    id: 'live-classroom',
    name: '师—生—机课堂',
    description: 'AI 讲授与渐进式答疑协作，教师保留节奏和内容控制权。',
    trigger: '教师或学生进入已发布课堂',
    stages: [
      { id: 'brief', label: '学情导入', agentIds: ['mentor', 'orchestrator'], evidence: '聚合画像摘要' },
      { id: 'teach', label: '互动讲授', agentIds: ['lecturer', 'tutor'], evidence: '场景与互动事件' },
      { id: 'reflect', label: '即时复盘', agentIds: ['mentor', 'annotator'], evidence: '反思与证据候选' },
    ],
  },
  {
    id: 'adversarial-training',
    name: '受控对抗训练',
    description: '将动态对手接入隔离环境；所有可执行动作经过策略门禁。',
    trigger: '学生启动经教师审批的对抗任务',
    stages: [
      { id: 'provision', label: '隔离环境', agentIds: ['simulator'], gate: '环境策略与授权校验', evidence: '会话身份与资源计划' },
      { id: 'engage', label: '动态对抗', agentIds: ['attack-bot', 'defense-bot', 'strategy-advisor', 'tutor'], evidence: '签名事件流' },
      { id: 'annotate', label: '过程标注', agentIds: ['annotator'], evidence: '证据引用' },
      { id: 'debrief', label: '复盘评估', agentIds: ['judge', 'mentor'], gate: '客观证据优先', evidence: '版本化评估结果' },
    ],
  },
  {
    id: 'learning-loop',
    name: '课前—课中—课后闭环',
    description: '以学习证据驱动诊断、教学、复习与下一轮推荐。',
    trigger: '课程计划或学习事件更新',
    stages: [
      { id: 'diagnose', label: '课前诊断', agentIds: ['annotator', 'mentor'], evidence: '能力证据与置信度' },
      { id: 'deliver', label: '课中教学', agentIds: ['lecturer', 'tutor', 'orchestrator'], evidence: '课堂事件' },
      { id: 'assess', label: '课后评估', agentIds: ['judge', 'mentor'], gate: '正式成绩需确定性证据或教师确认', evidence: '测验与作品证据' },
      { id: 'adapt', label: '路径更新', agentIds: ['mentor', 'orchestrator'], evidence: '推荐原因码' },
    ],
  },
] as const;

export function getAgentPlatformSummary() {
  return {
    total: SECURITY_AGENT_CATALOG.length,
    ready: SECURITY_AGENT_CATALOG.filter((agent) => agent.status === 'ready').length,
    guarded: SECURITY_AGENT_CATALOG.filter((agent) => agent.status === 'guarded').length,
    adapterRequired: SECURITY_AGENT_CATALOG.filter((agent) => agent.status === 'adapter-required').length,
    workflows: SECURITY_AGENT_WORKFLOWS.length,
    policy: {
      llmMayAdvise: true,
      llmMayPublish: false,
      llmMaySetFinalGrade: false,
      llmMayAccessInfrastructureCredentials: false,
      executableActionsRequirePolicyGate: true,
    },
  };
}
