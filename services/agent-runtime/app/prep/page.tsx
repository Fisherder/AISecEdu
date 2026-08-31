'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LessonSummary } from '@/lib/types/lesson';

const INTEGRATED = process.env.NEXT_PUBLIC_AISECEDU_INTEGRATED === 'true';

export default function PrepHomePage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [title, setTitle] = useState('');
  const [cyber, setCyber] = useState(true);
  const [courses, setCourses] = useState<string[]>([]);
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch('/api/lessons').then((r) => r.json());
    setLessons(r.lessons ?? []);
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    fetch('/api/curriculum/courses')
      .then((r) => r.json())
      .then((d) => setCourses(d?.data?.courses ?? d?.courses ?? []))
      .catch(() => setCourses([]));
  }, []);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    const r = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        ...(cyber ? { subjectProfile: 'cybersecurity', ...(courseId ? { courseId } : {}) } : {}),
      }),
    }).then((r) => r.json());
    setBusy(false);
    if (r.id) router.push(`/prep/${r.id}`);
  }

  async function remove(id: string) {
    if (!confirm('删除这节备课？')) return;
    await fetch(`/api/lessons/${id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <main
      style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'system-ui, "PingFang SC", sans-serif',
      }}
    >
      <h1 style={{ fontSize: 22 }}>教师备课工作台</h1>
      {INTEGRATED && (
        <div
          style={{
            margin: '16px 0',
            padding: 12,
            borderRadius: 8,
            background: '#ecfccb',
            color: '#365314',
          }}
        >
          课程与产物由玄甲全局智能体创建；这里仅列出当前授权会话可访问的内容。
        </div>
      )}
      {!INTEGRATED && (
        <section
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            margin: '16px 0',
          }}
        >
          <h2 style={{ fontSize: 16, marginTop: 0 }}>新建备课</h2>
          <input
            placeholder="课程标题，如：现代密码学·分组密码"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={input}
          />
          <label style={{ display: 'block', margin: '10px 0', fontSize: 14 }}>
            <input type="checkbox" checked={cyber} onChange={(e) => setCyber(e.target.checked)} />{' '}
            网安学科定制（用工作流，flash 友好）
          </label>
          {cyber && courses.length > 0 && (
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={input}>
              <option value="">（不绑定具体课程）</option>
              {courses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <button onClick={create} disabled={busy || !title.trim()} style={btn}>
            {busy ? '创建中…' : '创建并打开'}
          </button>
        </section>
      )}

      <h2 style={{ fontSize: 16 }}>已保存的备课</h2>
      {lessons.length === 0 && <p style={{ color: '#94a3b8' }}>还没有备课。</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {lessons.map((l) => (
          <li key={l.id} style={row}>
            <Link
              href={`/prep/${l.id}`}
              style={{ flex: 1, color: '#2563eb', textDecoration: 'none' }}
            >
              {l.title}{' '}
              <small style={{ color: '#94a3b8' }}>
                · {l.artifactCount} 个产物{l.publishedClassroomId ? ' · 已发布' : ''}
              </small>
            </Link>
            {!INTEGRATED && (
              <button onClick={() => remove(l.id)} style={delBtn}>
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  fontSize: 14,
  marginBottom: 8,
};
const btn: React.CSSProperties = {
  background: '#3b82f6',
  color: '#fff',
  border: 0,
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  cursor: 'pointer',
};
const delBtn: React.CSSProperties = {
  background: '#fee2e2',
  color: '#b91c1c',
  border: 0,
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  marginBottom: 8,
};
