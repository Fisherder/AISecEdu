import { studyProductLabels } from '@/lib/server/self-study';
import { nanoid } from 'nanoid';
import { NextRequest, type NextResponse } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { rethrowStudentTurnAbort } from '@/lib/server/student-request-abort';
import { resolvePrincipal, type Principal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import {
  createStudentSelfStudyPackage,
  isSelfStudyText,
  SelfStudyGenerationError,
} from '@/lib/server/self-study-generation';
import {
  decideStudentAgentMessage,
  studentRequestCancelled,
  type StudentAgentHistoryMessage,
} from '@/lib/server/student-agent';
import {
  createStudentLearningPlan,
  loadStudentAgentLearningState,
  saveStudentLearningProfile,
  type StudentAgentContextSelection,
  type StudentAgentLearningState,
} from '@/lib/server/student-agent-context';

export const maxDuration = 300;

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

function contextValue(value: unknown): StudentAgentContextSelection {
  const item = objectValue(value);
  return {
    courseId: typeof item.courseId === 'string' ? item.courseId.slice(0, 120) : undefined,
    lessonId: typeof item.lessonId === 'string' ? item.lessonId.slice(0, 120) : undefined,
    taskId: typeof item.taskId === 'string' ? item.taskId.slice(0, 120) : undefined,
  };
}

function messageView(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    role: row.role === 'user' ? ('user' as const) : ('assistant' as const),
    kind: String(row.kind ?? 'message'),
    content: String(row.content ?? ''),
    metadata: objectValue(row.metadata),
    createdAt: Number(row.created_at ?? 0),
  };
}

function threadView(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title ?? '新学习对话'),
    status: String(row.status ?? 'active'),
    activeContext: contextValue(row.active_context),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

function linksForState(state: StudentAgentLearningState) {
  const links: Array<{ label: string; href: string; kind: string }> = [];
  const task = state.activeContext.taskId
    ? state.tasks.find((item) => item.id === state.activeContext.taskId)
    : undefined;
  if (task) {
    links.push({
      label: `继续任务：${task.title}`,
      href: `/classroom/${task.classroomId}`,
      kind: 'task',
    });
  }
  const lesson = state.activeContext.lessonId
    ? state.courses
        .flatMap((item) => item.lessons)
        .find((item) => item.id === state.activeContext.lessonId)
    : undefined;
  if (lesson?.classroomId && !links.some((item) => item.href.endsWith(lesson.classroomId!))) {
    links.push({
      label: `进入课堂：${lesson.title}`,
      href: `/classroom/${lesson.classroomId}`,
      kind: 'classroom',
    });
  }
  if (
    state.insight.nextAction.classroomId &&
    !links.some((item) => item.href.endsWith(state.insight.nextAction.classroomId!))
  ) {
    links.push({
      label: state.insight.nextAction.title,
      href: `/classroom/${state.insight.nextAction.classroomId}`,
      kind: 'next-action',
    });
  }
  if (links.length === 0) {
    links.push({ label: '浏览我的课程', href: '/student/courses', kind: 'courses' });
  }
  return links.slice(0, 4);
}

function studyPackageReply(status: string, explanation: string, request: string) {
  const claimsOutcome = /(?:已(?:经)?|刚刚|成功)\s*(?:生成|创建|制作|完成|发布|启动|保存)|(?:生成|创建|制作|发布|启动|保存)(?:成功|完成|失败|完毕)/u;
  if (!isSelfStudyText(request) || !isSelfStudyText(explanation) || claimsOutcome.test(explanation)) return status;
  return `${status}\n\n${explanation}`;
}

async function requireStudent(
  req: NextRequest,
): Promise<{ response: NextResponse } | { principal: Principal }> {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    return { response: apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated') };
  }
  if (principal.role !== 'student') {
    return { response: apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required') };
  }
  return { principal };
}

export async function GET(req: NextRequest) {
  const access = await requireStudent(req);
  if ('response' in access) return access.response;
  const db = await getDb();
  await ensureAppSchema(db);
  const threadId = req.nextUrl.searchParams.get('threadId');
  const threadsResult = await db.query(
    `SELECT * FROM student_agent_threads
     WHERE learner_key = $1 AND status <> 'deleted' ORDER BY updated_at DESC LIMIT 50`,
    [access.principal.learnerKey],
  );
  const selectedRow = threadId
    ? threadsResult.rows.find((row) => row.id === threadId)
    : threadsResult.rows[0];
  const activeContext = selectedRow ? contextValue(selectedRow.active_context) : {};
  const [state, messagesResult] = await Promise.all([
    loadStudentAgentLearningState(access.principal.learnerKey, activeContext, db),
    selectedRow
      ? db.query(
          `SELECT * FROM student_agent_messages
           WHERE thread_id = $1 AND learner_key = $2 ORDER BY created_at ASC LIMIT 200`,
          [selectedRow.id, access.principal.learnerKey],
        )
      : Promise.resolve({ rows: [], rowCount: 0 }),
  ]);
  return apiSuccess({
    threads: threadsResult.rows.map(threadView),
    thread: selectedRow ? threadView(selectedRow) : null,
    messages: messagesResult.rows.map(messageView),
    learningState: state,
  });
}

export async function POST(req: NextRequest) {
  const access = await requireStudent(req);
  if ('response' in access) return access.response;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 12000) : '';
  if (!message) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, '请输入学习要求');
  }
  if (studentRequestCancelled(message)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 422, '已取消本次学习请求。');
  }
  req.signal.throwIfAborted();
  const db = await getDb();
  await ensureAppSchema(db);
  const learnerKey = access.principal.learnerKey;
  let threadId = typeof body.threadId === 'string' ? body.threadId.slice(0, 80) : '';
  let threadRow: Record<string, unknown> | undefined;
  const newThread = !threadId;
  if (threadId) {
    const result = await db.query(
      `SELECT * FROM student_agent_threads
       WHERE id = $1 AND learner_key = $2 AND status <> 'deleted'`,
      [threadId, learnerKey],
    );
    threadRow = result.rows[0];
    if (!threadRow)
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Learning thread not found');
  } else {
    threadId = `student_thread_${nanoid(12)}`;
    const now = Date.now();
    threadRow = {
      id: threadId,
      title: '新学习对话',
      active_context: {},
      status: 'active',
      created_at: now,
      updated_at: now,
    };
  }

  const requestedContext = contextValue(body.context ?? threadRow.active_context);
  const state = await loadStudentAgentLearningState(learnerKey, requestedContext, db);
  const historyResult = newThread ? { rows: [] } : await db.query(
    `SELECT role, content FROM student_agent_messages
     WHERE thread_id = $1 AND learner_key = $2 ORDER BY created_at DESC LIMIT 16`,
    [threadId, learnerKey],
  );
  const history: StudentAgentHistoryMessage[] = [...historyResult.rows]
    .reverse()
    .flatMap((row) =>
      row.role === 'user' || row.role === 'assistant'
        ? [{ role: row.role as 'user' | 'assistant', content: String(row.content) }]
        : [],
    );
  const now = Date.now();
  const userMessageId = `student_message_${nanoid(12)}`;
  const decision = await decideStudentAgentMessage(
    {
      message,
      history,
      state,
      context: state.activeContext,
    },
    { signal: req.signal },
  );
  let generatedPackage:
    | { id: string; title: string; classroomId: string; classroomUrl: string }
    | undefined;
  let reply = decision.reply;
  req.signal.throwIfAborted();
  const trace = [...decision.trace];
  if (decision.action === 'generate_package' && decision.packageRequest) {
    const product = studyProductLabels[decision.packageRequest.product ?? 'package'];
    try {
      const { id, title, classroomId, classroomUrl } = await createStudentSelfStudyPackage(
        req,
        access.principal,
        decision.packageRequest,
        message,
      );
      generatedPackage = { id, title, classroomId, classroomUrl };
      trace.push({
        label: `创建${product}`,
        detail: `《${title}》已生成，可以打开学习。`,
        status: 'completed',
      });
      reply = studyPackageReply(`${product}《${title}》已生成。请从下方打开课堂。`, decision.reply, message);
    } catch (error) {
      rethrowStudentTurnAbort(req.signal, error);
      const reason =
        error instanceof SelfStudyGenerationError
          ? error.publicMessage
          : '内容生成暂时失败，请稍后重试';
      reply = studyPackageReply(`本次${product}没有生成。学习目标已保留。${reason}。`, decision.reply, message);
    }
  }
  req.signal.throwIfAborted();
  if (newThread) {
    await db.query(
      `INSERT INTO student_agent_threads
       (id, learner_key, title, active_context, status, created_at, updated_at)
       VALUES ($1,$2,'新学习对话',$3,'active',$4,$4)`,
      [threadId, learnerKey, JSON.stringify({}), threadRow.created_at],
    );
  }
  await db.query(
    `INSERT INTO student_agent_messages
       (id, thread_id, learner_key, role, kind, content, metadata, created_at)
     VALUES ($1,$2,$3,'user','message',$4,$5,$6)`,
    [
      userMessageId,
      threadId,
      learnerKey,
      message,
      JSON.stringify({ context: state.activeContext }),
      now,
    ],
  );

  if (Object.keys(decision.profileUpdates).length > 0 || decision.memoryFacts.length > 0) {
    await saveStudentLearningProfile(learnerKey, decision.profileUpdates, decision.memoryFacts, db);
  }
  const plan = decision.plan
    ? await createStudentLearningPlan(
        learnerKey,
        threadId,
        { ...decision.plan, sourceContext: state.activeContext },
        db,
      )
    : undefined;
  const refreshedState = await loadStudentAgentLearningState(learnerKey, state.activeContext, db);
  const metadata = {
    action: decision.action,
    title: decision.title,
    source: decision.source,
    trace,
    plan,
    generatedPackage,
    modelUsage: decision.modelUsage,
    links: generatedPackage
      ? [
          {
            label: `进入《${generatedPackage.title}》`,
            href: `/classroom/${generatedPackage.classroomId}`,
            kind: 'classroom',
          },
          ...linksForState(refreshedState),
        ].slice(0, 4)
      : linksForState(refreshedState),
    remembered: decision.memoryFacts,
  };
  const assistantMessageId = `student_message_${nanoid(12)}`;
  const completedAt = Date.now();
  await db.query(
    `INSERT INTO student_agent_messages
       (id, thread_id, learner_key, role, kind, content, metadata, created_at)
     VALUES ($1,$2,$3,'assistant','result',$4,$5,$6)`,
    [assistantMessageId, threadId, learnerKey, reply, JSON.stringify(metadata), completedAt],
  );
  const firstTurn = String(threadRow.title) === '新学习对话';
  await db.query(
    `UPDATE student_agent_threads SET title = $1, active_context = $2, updated_at = $3
     WHERE id = $4 AND learner_key = $5`,
    [
      firstTurn ? decision.title.slice(0, 160) : String(threadRow.title),
      JSON.stringify(refreshedState.activeContext),
      completedAt,
      threadId,
      learnerKey,
    ],
  );
  return apiSuccess(
    {
      thread: {
        id: threadId,
        title: firstTurn ? decision.title : String(threadRow.title),
        activeContext: refreshedState.activeContext,
        updatedAt: completedAt,
      },
      userMessage: {
        id: userMessageId,
        role: 'user',
        kind: 'message',
        content: message,
        metadata: { context: refreshedState.activeContext },
        createdAt: now,
      },
      assistantMessage: {
        id: assistantMessageId,
        role: 'assistant',
        kind: 'result',
        content: reply,
        metadata,
        createdAt: completedAt,
      },
      learningState: refreshedState,
    },
    201,
  );
}

export async function DELETE(req: NextRequest) {
  const access = await requireStudent(req);
  if ('response' in access) return access.response;
  const threadId = req.nextUrl.searchParams.get('threadId');
  if (!threadId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing threadId');
  const db = await getDb();
  await ensureAppSchema(db);
  const deleted = await db.query(
    `UPDATE student_agent_threads SET status = 'deleted', updated_at = $1
     WHERE id = $2 AND learner_key = $3 RETURNING id`,
    [Date.now(), threadId, access.principal.learnerKey],
  );
  if (!deleted.rows[0])
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Learning thread not found');
  return apiSuccess({ deleted: true, threadId });
}
