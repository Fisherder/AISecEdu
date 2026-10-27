export type Data = Record<string, any>;
export type Mode = 'auto';
export type Panel = 'artifacts' | 'activity' | 'context';
export interface Message {
  id: number;
  role: string;
  content: string;
  created?: string;
  metadata: Data;
  cards?: Data[];
}
export interface PendingTurn {
  jobId: string;
  status: string;
  content: string;
  revision: number;
  delivery: string;
  acknowledgedAtBoundary?: boolean;
}
export interface Thread {
  id: string;
  title: string;
  status: string;
  pinned?: boolean;
  dojoId?: number | null;
  moduleIndex?: number | null;
  phase?: string;
  context?: Data;
  updated?: string;
  latestMessage?: string;
  messages?: Message[];
  pendingTurns?: PendingTurn[];
  harnessJobs?: Job[];
  lastEventSequence?: number;
}
export interface Job {
  id: string;
  threadId?: string;
  kind: string;
  status: string;
  title?: string;
  stage?: string;
  message?: string;
  error?: string;
  progress?: number;
  created?: string;
  updated?: string;
  executionId?: string;
  harnessRootJobId?: string;
  result?: Data;
  [key: string]: any;
}
export interface Artifact {
  id: string;
  title: string;
  type: string;
  status: string;
  currentRevision: number;
  revision?: Data;
  revisions?: Data[];
  capabilities?: Data;
  dojoId?: number | null;
  moduleIndex?: number | null;
  updated?: string;
  [key: string]: any;
}
export interface ActivityItem {
  id: string;
  jobId: string;
  runId: string;
  kind: string;
  title: string;
  status: string;
  content?: string;
  input?: any;
  output?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  startedAt?: number;
  completedAt?: number;
  usage?: Data;
}
export interface Draft {
  learningPattern: '' | 'process-inquiry';
  text: string;
  mode: Mode;
  delivery: 'after-current' | 'next-step';
  sources: { id: string; name: string; type: string }[];
  skills: string[];
  artifactType: string;
}
export interface Upload {
  id: string;
  name: string;
  state: 'uploading' | 'error';
  error?: string;
}
export interface WorkspaceState {
  booting: boolean;
  loadingThread: boolean;
  busy: boolean;
  online: boolean;
  threads: Thread[];
  thread: Thread | null;
  context: Data;
  jobs: Job[];
  events: Record<string, Data[]>;
  selectedJob: string | null;
  artifacts: Artifact[];
  openArtifacts: string[];
  selectedArtifact: string | null;
  artifactDetails: Record<string, Artifact>;
  previews: Record<string, string>;
  materials: Data[];
  skills: Data[];
  draft: Draft;
  uploads: Upload[];
  panel: Panel;
  panelOpen: boolean;
  sidebarOpen: boolean;
  taskCenter: boolean;
  modal: 'search' | 'settings' | 'sources' | 'skills' | null;
  error: string | null;
  notice: string | null;
  threadFilter: string;
  archived: boolean;
}
export const terminal = (job: Job) => ['SUCCEEDED', 'FAILED', 'CANCELED'].includes(job.status);
export const statusLabels: Record<string, string> = {
  WAITING_INPUT: '待回答',
  QUEUED: '等待执行',
  RUNNING: '执行中',
  CANCEL_REQUESTED: '正在停止',
  SUCCEEDED: '已完成',
  FAILED: '未完成',
  CANCELED: '已停止',
  NEEDS_REVIEW: '待审阅',
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  GENERATING: '生成中',
  completed: '已完成',
  running: '执行中',
  failed: '未完成',
  cancelled: '已停止',
  incomplete: '记录不完整',
};
export const typeLabels: Record<string, string> = {
  'learning-flow': '流程探究式学习',
  simulation: '交互演示',
  'slide-deck': '课件',
  'question-set': '实践题',
  'lesson-plan': '教案',
  'attack-defense-scene': '攻防演示',
  debate: 'AI 辩论',
  assessment: '评分方案',
  'learning-path': '学习路径',
  'agent.chat': '智能体任务',
  'artifact.revise': '局部修改',
  'candidate.generate': '生成内容',
};
export function dateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value.endsWith('Z') || /[+-]\d\d:\d\d$/.test(value) ? value : value + 'Z');
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
