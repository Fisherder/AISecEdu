'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function safeNext(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/student';
}

export default function StudentLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!username.trim() || !password || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { username: username.trim(), password }
            : {
                username: username.trim(),
                password,
                displayName: displayName.trim() || username.trim(),
                role: 'student',
              },
        ),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '登录失败');
      if (data.user?.role !== 'student') {
        router.push('/teacher');
        return;
      }
      const nextPath = safeNext(new URLSearchParams(window.location.search).get('next'));
      router.push(nextPath);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '网络错误');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 flex items-center justify-center px-5 font-sans">
      <div className="w-full max-w-md rounded-3xl border border-cyan-400/15 bg-slate-900/85 p-8 shadow-2xl shadow-cyan-950/40 backdrop-blur">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
            玄甲
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">网安智能学习中心</h1>
          <p className="mt-2 text-sm text-slate-400">
            课堂、实验、能力证据与下一步学习建议集中在这里。
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-950/70 p-1">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-lg px-3 py-2 text-sm transition ${mode === item ? 'bg-cyan-500 text-slate-950 font-medium' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {item === 'login' ? '登录' : '学生注册'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="用户名"
            autoComplete="username"
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
          />
          {mode === 'register' && (
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="姓名或昵称（可选）"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
            />
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button
          type="button"
          disabled={busy || !username.trim() || !password}
          onClick={() => void submit()}
          className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '请稍候…' : mode === 'login' ? '进入学习中心' : '注册并开始学习'}
        </button>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <Link href="/" className="hover:text-cyan-300">
            返回玄甲
          </Link>
          <Link href="/teacher/login" className="hover:text-cyan-300">
            教师入口
          </Link>
        </div>
      </div>
    </div>
  );
}
