'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CourseTaskManager } from '@/components/teacher/course-task-manager';

interface CourseDetail {
  id: string;
  title: string;
  description: string;
  course_code: string;
}
interface LessonLink {
  id: string;
  title: string;
  published_classroom_id: string | null;
  sort_order: number;
}
interface Student {
  learner_key: string;
  enrolled_at: number;
  username?: string;
  display_name?: string;
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [lessons, setLessons] = useState<LessonLink[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [myLessons, setMyLessons] = useState<Array<{ id: string; title: string }>>([]);
  const [addLessonId, setAddLessonId] = useState('');

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/courses/${courseId}`).then((r) => r.json());
    if (r.course) {
      setCourse(r.course as CourseDetail);
      setLessons(r.lessons ?? []);
      setStudents(r.students ?? []);
    }
    const lr = await fetch('/api/lessons').then((r) => r.json());
    setMyLessons(
      (lr.lessons ?? []).map((l: { id: string; title: string }) => ({ id: l.id, title: l.title })),
    );
  }, [courseId]);
  useEffect(() => {
    // Data is fetched asynchronously; state updates happen after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function addLesson() {
    if (!addLessonId) return;
    await fetch(`/api/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: addLessonId }),
    });
    setAddLessonId('');
    refresh();
  }

  async function removeLesson(lid: string) {
    await fetch(`/api/courses/${courseId}/lessons`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: lid }),
    });
    refresh();
  }

  if (!course) return <div>加载中…</div>;
  const enrollUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/courses/${courseId}/join`;

  return (
    <div>
      <Link href="/teacher/courses" style={{ fontSize: 13, color: '#64748b' }}>
        ← 我的课程
      </Link>
      <h1 style={{ fontSize: 20, margin: '12px 0 4px' }}>{course.title}</h1>
      {course.description && <p style={{ color: '#64748b', fontSize: 13 }}>{course.description}</p>}
      {course.course_code && (
        <span
          style={{
            fontSize: 11,
            background: '#334155',
            color: '#94c5fd',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          选课代码: {course.course_code}
        </span>
      )}

      {/* Student join link */}
      <div
        style={{
          background: 'rgba(16,185,129,0.1)',
          borderRadius: 8,
          padding: 12,
          border: '1px solid rgba(16,185,129,0.3)',
          margin: '16px 0',
        }}
      >
        <div style={{ fontSize: 13, color: '#10b981' }}>📤 学生加入链接</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          分享此链接给学生，他们点击即可加入课程：
        </div>
        <div style={{ fontSize: 12, color: '#60a5fa', marginTop: 4, wordBreak: 'break-all' }}>
          {enrollUrl}
        </div>
      </div>

      {/* Lessons in course */}
      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>📖 课程内容（{lessons.length}）</h3>
      {lessons.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            borderRadius: 8,
            padding: 16,
            color: '#475569',
            fontSize: 13,
          }}
        >
          还没有添加备课内容
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lessons.map((l) => (
            <div
              key={l.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#1e293b',
                borderRadius: 8,
                padding: '8px 12px',
                border: '1px solid #334155',
              }}
            >
              <Link
                href={`/teacher/prep/${l.id}`}
                style={{ flex: 1, color: '#e2e8f0', fontSize: 13, textDecoration: 'none' }}
              >
                {l.title}
              </Link>
              {l.published_classroom_id ? (
                <span style={{ fontSize: 10, color: '#10b981' }}>已发布</span>
              ) : (
                <span style={{ fontSize: 10, color: '#f59e0b' }}>未发布</span>
              )}
              <button
                onClick={() => removeLesson(l.id)}
                style={{
                  background: 'transparent',
                  color: '#f87171',
                  border: 0,
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add lesson */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <select
          value={addLessonId}
          onChange={(e) => setAddLessonId(e.target.value)}
          style={{ ...inp, flex: 1 }}
        >
          <option value="">选择备课添加到课程…</option>
          {myLessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <button
          onClick={addLesson}
          disabled={!addLessonId}
          style={{ ...btnPrimary, fontSize: 12, padding: '6px 12px' }}
        >
          添加
        </button>
      </div>
      <Link
        href="/teacher/prep"
        style={{ fontSize: 12, color: '#60a5fa', display: 'inline-block', marginTop: 4 }}
      >
        或创建新备课 →
      </Link>

      <CourseTaskManager courseId={courseId} lessons={lessons} />

      {/* Enrolled students */}
      <h3 style={{ fontSize: 15, margin: '20px 0 8px' }}>👥 已选课学生（{students.length}）</h3>
      {students.length === 0 ? (
        <div
          style={{
            background: '#1e293b',
            borderRadius: 8,
            padding: 16,
            color: '#475569',
            fontSize: 13,
          }}
        >
          还没有学生选课
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {students.map((s) => (
            <div
              key={s.learner_key}
              style={{
                background: '#1e293b',
                borderRadius: 6,
                padding: '6px 12px',
                border: '1px solid #334155',
                fontSize: 12,
                color: '#94a3b8',
              }}
            >
              {s.display_name || s.username || s.learner_key.replace('acct:', '学生 ')} · 选课于{' '}
              {new Date(s.enrolled_at).toLocaleDateString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '8px 10px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 13,
  outline: 'none',
};
const btnPrimary: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  cursor: 'pointer',
};
