'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function JoinCoursePage() {
  const params = useParams<{ id: string }>();
  const [course, setCourse] = useState<{ title: string; description: string } | null>(null);
  const [state, setState] = useState<'loading' | 'auth' | 'enrolled' | 'error'>('loading');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const me = await fetch('/api/auth/me').then((r) => r.ok ? r.json() : null).catch(() => null);
      if (!me?.user) { setState('auth'); return; }
      try {
        const r = await fetch(`/api/courses/${params.id}`).then((r) => r.json());
        if (r.course) setCourse({ title: r.course.title, description: r.course.description });
        const er = await fetch(`/api/courses/${params.id}/enroll`, { method: 'POST' }).then((r) => r.json());
        if (er.enrolled) setState('enrolled');
        else { setErr(er.error || '选课失败'); setState('error'); }
      } catch { setErr('网络错误'); setState('error'); }
    })();
  }, [params.id]);

  if (state === 'loading') return <Center>加载中…</Center>;
  if (state === 'auth') return (
    <Center>
      <h2 style={{ fontSize: 20, color: '#e2e8f0' }}>请先登录</h2>
      <p style={{ color: '#64748b', fontSize: 13, margin: '8px 0 16px' }}>登录后即可加入课程{course ? `「${course.title}」` : ''}</p>
      <Link href={`/student/login?next=${encodeURIComponent(`/courses/${params.id}/join`)}`} style={{ background: '#3b82f6', color: '#fff', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>去学生登录</Link>
    </Center>
  );
  if (state === 'error') return <Center><p style={{ color: '#f87171' }}>{err}</p></Center>;
  return (
    <Center>
      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
      <h2 style={{ fontSize: 20, color: '#10b981', margin: 0 }}>选课成功！</h2>
      <p style={{ color: '#94a3b8', fontSize: 13, margin: '8px 0 16px' }}>你已加入{course ? `「${course.title}」` : '课程'}</p>
      <Link href="/student" style={{ background: '#3b82f6', color: '#fff', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>进入学习中心</Link>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontFamily: 'system-ui, "PingFang SC", sans-serif' }}>{children}</div>;
}
