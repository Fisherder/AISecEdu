'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const PUBLIC_PATHS = ['/teacher/login'];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const publicPath = PUBLIC_PATHS.includes(pathname);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<{ username: string; role: string; displayName?: string } | null>(
    null,
  );

  useEffect(() => {
    if (publicPath) return;
    let cancelled = false;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.user && (d.user.role === 'teacher' || d.user.role === 'admin')) {
          setUser(d.user);
          setAuthed(true);
        } else if (d?.user?.role === 'student') {
          router.push('/student');
        } else {
          router.push('/teacher/login');
        }
      })
      .catch(() => {
        if (!cancelled) router.push('/teacher/login');
      });
    return () => {
      cancelled = true;
    };
  }, [publicPath, router]);

  if (publicPath) return <>{children}</>;
  if (authed === null)
    return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui' }}>加载中…</div>;

  const navItems = [
    { href: '/teacher', label: '⌂ 教学驾驶舱', exact: true },
    { href: '/teacher/prep', label: '✦ AI 教学设计' },
    { href: '/teacher/courses', label: '▤ 课程空间' },
    { href: '/teacher/agents', label: '◎ 智能体中枢' },
    { href: '/teacher/casting', label: '◉ 课堂选角' },
    { href: '/teacher/sandbox', label: '⌘ 对抗沙箱' },
    { href: '/teacher/analytics', label: '⌁ 学情洞察' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'system-ui, "PingFang SC", sans-serif',
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: '#1e293b',
          borderRight: '1px solid #334155',
          padding: '20px 0',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #334155' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', color: '#22d3ee', marginBottom: 6 }}>
            玄甲
          </div>
          <h1 style={{ fontSize: 15, margin: 0, color: '#e2e8f0' }}>网安教学智能体平台</h1>
          <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
            玄甲全局智能体 · 内部运行界面
          </p>
        </div>
        <nav style={{ padding: '12px 0' }}>
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block',
                  padding: '10px 20px',
                  color: active ? '#60a5fa' : '#94a3b8',
                  background: active ? 'rgba(59,130,246,0.1)' : 'transparent',
                  borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                  textDecoration: 'none',
                  fontSize: 14,
                  transition: 'all 0.15s',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding: '20px', borderTop: '1px solid #334155', marginTop: 'auto' }}>
          {user && (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <div>👤 {user.displayName || user.username}</div>
              <div style={{ marginTop: 4 }}>角色: {user.role}</div>
              <button
                onClick={() => {
                  fetch('/api/auth/logout', { method: 'POST' }).then(() =>
                    router.push('/teacher/login'),
                  );
                }}
                style={{
                  marginTop: 8,
                  background: '#334155',
                  color: '#94a3b8',
                  border: 0,
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                退出
              </button>
            </div>
          )}
        </div>
      </aside>
      {/* Main */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}
