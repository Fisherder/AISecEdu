'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TeacherLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!username.trim() || !password.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        mode === 'login'
          ? { username: username.trim(), password }
          : {
              username: username.trim(),
              password,
              displayName: displayName.trim() || username.trim(),
              role: 'teacher',
              inviteCode,
            };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) router.push('/teacher');
      else setErr(data.error || '操作失败');
    } catch {
      setErr('网络错误');
    }
    setBusy(false);
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f172a',
        fontFamily: 'system-ui, "PingFang SC", sans-serif',
      }}
    >
      <div
        style={{
          width: 360,
          background: '#1e293b',
          borderRadius: 16,
          padding: 32,
          border: '1px solid #334155',
        }}
      >
        <h1 style={{ fontSize: 20, color: '#60a5fa', margin: '0 0 4px' }}>🏫 安全教学平台</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 24px' }}>
          教师{mode === 'login' ? '登录' : '注册'}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => setMode('login')}
            style={mode === 'login' ? tabActive : tabInactive}
          >
            登录
          </button>
          <button
            onClick={() => setMode('register')}
            style={mode === 'register' ? tabActive : tabInactive}
          >
            注册
          </button>
        </div>

        <input
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {mode === 'register' && (
          <>
            <input
              placeholder="显示名称（可选）"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="教师邀请码"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              style={inputStyle}
            />
          </>
        )}

        {err && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <button
          onClick={submit}
          disabled={busy}
          style={{
            width: '100%',
            background: '#3b82f6',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '10px',
            fontSize: 14,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>

        <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 16 }}>
          教师注册需要管理员邀请码 · 学生入口请访问{' '}
          <Link href="/student/login" style={{ color: '#3b82f6' }}>
            学习中心
          </Link>
        </p>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 14,
  marginBottom: 12,
  boxSizing: 'border-box',
  outline: 'none',
};
const tabActive: React.CSSProperties = {
  flex: 1,
  background: '#3b82f6',
  color: '#fff',
  border: 0,
  borderRadius: 6,
  padding: '6px',
  fontSize: 13,
  cursor: 'pointer',
};
const tabInactive: React.CSSProperties = {
  flex: 1,
  background: '#334155',
  color: '#94a3b8',
  border: 0,
  borderRadius: 6,
  padding: '6px',
  fontSize: 13,
  cursor: 'pointer',
};
