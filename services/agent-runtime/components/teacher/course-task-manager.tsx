'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface LessonOption {
  id: string;
  title: string;
  published_classroom_id: string | null;
}

interface TaskStudent {
  learnerKey: string;
  displayName: string;
  progress: {
    state: 'not-started' | 'in-progress' | 'completed';
    completionRate: number;
    completedScenes: number;
    totalScenes: number;
    averageQuizScore: number | null;
    overdue: boolean;
  };
}

interface TeacherTask {
  id: string;
  title: string;
  instructions: string;
  lessonId: string;
  lessonTitle: string;
  classroomId: string;
  dueAt: number | null;
  completionRule: { requireAllScenes: boolean; minQuizScore: number | null };
  summary: {
    learnerCount: number;
    notStartedCount: number;
    inProgressCount: number;
    completedCount: number;
    overdueCount: number;
  };
  students: TaskStudent[];
}

const STATE_META = {
  'not-started': { label: '未开始', color: '#94a3b8' },
  'in-progress': { label: '进行中', color: '#38bdf8' },
  completed: { label: '已完成', color: '#34d399' },
} as const;

export function CourseTaskManager({
  courseId,
  lessons,
}: {
  courseId: string;
  lessons: LessonOption[];
}) {
  const publishedLessons = useMemo(
    () => lessons.filter((lesson) => lesson.published_classroom_id),
    [lessons],
  );
  const [tasks, setTasks] = useState<TeacherTask[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [minQuizScore, setMinQuizScore] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/teacher/tasks?courseId=${encodeURIComponent(courseId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '任务加载失败');
      setTasks(payload.tasks ?? []);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '任务加载失败');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createTask() {
    if (!lessonId) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/teacher/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId,
          lessonId,
          title: title || undefined,
          instructions,
          dueAt: dueAt ? new Date(dueAt).getTime() : null,
          minQuizScore: minQuizScore ? Number(minQuizScore) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.details || payload.error || '布置失败');
      setLessonId('');
      setTitle('');
      setInstructions('');
      setDueAt('');
      setMinQuizScore('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '布置失败');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(task: TeacherTask) {
    if (!window.confirm(`确认删除任务“${task.title}”？学生端将不再显示该任务。`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/teacher/tasks/${task.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '删除失败');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'end',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 9,
        }}
      >
        <div>
          <h3 style={{ fontSize: 15, margin: 0 }}>✅ 学习任务（{tasks.length}）</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 5 }}>
            把已发布课堂布置给全体选课学生，完成度由真实学习证据自动计算。
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} style={ghostButton}>
          刷新学情
        </button>
      </div>

      <div
        style={{
          background: '#162033',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: 14,
        }}
      >
        {publishedLessons.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 12 }}>
            请先发布至少一个课程内容，再布置学习任务。
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px,1fr) minmax(180px,1fr) 180px 130px',
                gap: 8,
              }}
            >
              <select
                aria-label="选择已发布课堂"
                value={lessonId}
                onChange={(event) => setLessonId(event.target.value)}
                style={inputStyle}
              >
                <option value="">选择已发布课堂…</option>
                {publishedLessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="任务标题（留空则沿用课堂标题）"
                style={inputStyle}
              />
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                aria-label="截止时间"
                style={inputStyle}
              />
              <select
                value={minQuizScore}
                onChange={(event) => setMinQuizScore(event.target.value)}
                style={inputStyle}
                aria-label="测验要求"
              >
                <option value="">只需完成内容</option>
                <option value="60">测验均分 ≥ 60</option>
                <option value="70">测验均分 ≥ 70</option>
                <option value="80">测验均分 ≥ 80</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="给学生的任务说明、重点或交付要求（可选）"
                rows={2}
                style={{ ...inputStyle, flex: 1, resize: 'vertical' }}
              />
              <button
                type="button"
                onClick={() => void createTask()}
                disabled={!lessonId || busy}
                style={{ ...primaryButton, opacity: !lessonId || busy ? 0.5 : 1 }}
              >
                {busy ? '处理中…' : '布置任务'}
              </button>
            </div>
          </>
        )}
        {error && (
          <div role="alert" style={{ color: '#fb7185', fontSize: 11, marginTop: 9 }}>
            {error}
          </div>
        )}
      </div>

      {loading ? (
        <div style={emptyStyle}>正在汇总任务学情…</div>
      ) : tasks.length === 0 ? (
        <div style={emptyStyle}>还没有布置学习任务</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {tasks.map((task) => {
            const open = expanded === task.id;
            const completion =
              task.summary.learnerCount > 0
                ? Math.round((task.summary.completedCount / task.summary.learnerCount) * 100)
                : 0;
            return (
              <div
                key={task.id}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : task.id)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div style={{ color: '#e2e8f0', fontSize: 13 }}>{task.title}</div>
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
                      {task.lessonTitle} ·{' '}
                      {task.dueAt ? `截止 ${new Date(task.dueAt).toLocaleString()}` : '长期有效'}
                      {task.completionRule.minQuizScore != null
                        ? ` · 测验均分 ≥ ${task.completionRule.minQuizScore}`
                        : ''}
                    </div>
                  </button>
                  <div style={{ minWidth: 155 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: '#94a3b8',
                        fontSize: 10,
                      }}
                    >
                      <span>
                        {task.summary.completedCount}/{task.summary.learnerCount} 人完成
                      </span>
                      <span>{completion}%</span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        background: '#0f172a',
                        borderRadius: 999,
                        overflow: 'hidden',
                        marginTop: 5,
                      }}
                    >
                      <div
                        style={{ width: `${completion}%`, height: '100%', background: '#34d399' }}
                      />
                    </div>
                  </div>
                  {task.summary.overdueCount > 0 && (
                    <span style={{ color: '#fb7185', fontSize: 10 }}>
                      {task.summary.overdueCount} 人逾期
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteTask(task)}
                    disabled={busy}
                    style={{ ...ghostButton, color: '#f87171' }}
                  >
                    删除
                  </button>
                </div>
                {open && (
                  <div style={{ borderTop: '1px solid #334155', padding: '4px 14px 12px' }}>
                    {task.instructions && (
                      <div
                        style={{
                          margin: '9px 0',
                          padding: 9,
                          background: '#0f172a',
                          borderRadius: 7,
                          color: '#94a3b8',
                          fontSize: 11,
                          lineHeight: 1.6,
                        }}
                      >
                        {task.instructions}
                      </div>
                    )}
                    {task.students.length === 0 ? (
                      <div style={{ color: '#475569', fontSize: 11, padding: 10 }}>
                        课程尚无学生
                      </div>
                    ) : (
                      task.students.map((student) => {
                        const meta = STATE_META[student.progress.state];
                        return (
                          <div
                            key={student.learnerKey}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 90px 115px 80px',
                              gap: 10,
                              padding: '8px 0',
                              borderBottom: '1px solid #29364a',
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ color: '#cbd5e1', fontSize: 11 }}>
                              {student.displayName}
                            </span>
                            <span style={{ color: meta.color, fontSize: 10 }}>
                              {student.progress.overdue ? '已逾期 · ' : ''}
                              {meta.label}
                            </span>
                            <span style={{ color: '#64748b', fontSize: 10 }}>
                              {student.progress.completedScenes}/{student.progress.totalScenes}{' '}
                              个场景
                            </span>
                            <span style={{ color: '#64748b', fontSize: 10, textAlign: 'right' }}>
                              {student.progress.averageQuizScore == null
                                ? '暂无测验'
                                : `${student.progress.averageQuizScore} 分`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  minWidth: 0,
};
const primaryButton: React.CSSProperties = {
  background: '#22d3ee',
  color: '#082f49',
  border: 0,
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  alignSelf: 'stretch',
};
const ghostButton: React.CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: '1px solid #475569',
  borderRadius: 7,
  padding: '5px 9px',
  fontSize: 10,
  cursor: 'pointer',
};
const emptyStyle: React.CSSProperties = {
  background: '#1e293b',
  borderRadius: 8,
  padding: 16,
  color: '#475569',
  fontSize: 12,
  marginTop: 10,
  textAlign: 'center',
};
