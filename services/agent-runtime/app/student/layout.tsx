'use client';

import {
  BookOpen,
  Bot,
  BrainCircuit,
  ChevronRight,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const PUBLIC_PATHS = ['/student/login'];
const NAVIGATION = [
  { href: '/student', label: '学习概览', shortLabel: '概览', icon: LayoutDashboard, exact: true },
  { href: '/student/courses', label: '我的课程', shortLabel: '课程', icon: BookOpen },
  { href: '/student/tasks', label: '学习任务', shortLabel: '任务', icon: ClipboardCheck },
  { href: '/student/self-study', label: '学习智能体', shortLabel: '智能体', icon: Bot },
  { href: '/student/review', label: '成长与评价', shortLabel: '成长', icon: BrainCircuit },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(PUBLIC_PATHS.includes(pathname));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ displayName?: string; username: string; role: string } | null>(
    null,
  );

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) return;
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (payload?.user?.role === 'student') {
          setUser(payload.user);
          setReady(true);
        } else if (payload?.user) {
          router.replace('/teacher');
        } else {
          router.replace(`/student/login?next=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {
        if (!cancelled) router.replace(`/student/login?next=${encodeURIComponent(pathname)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#06111f] text-sm text-slate-400">
        <span className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/25 border-t-cyan-300" />
        正在进入学习空间…
      </div>
    );
  }

  const immersive = pathname === '/student/self-study';

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/student/login');
  }

  return (
    <div className="min-h-screen bg-[#06111f] font-sans text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-white/[0.07] bg-[#081522] transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/[0.06] px-5">
          <Link href="/student" className="flex items-center gap-3 no-underline">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-[#06111f] shadow-lg shadow-cyan-500/10">
              <ShieldCheck size={21} strokeWidth={2.4} />
            </span>
            <span>
              <strong className="block text-sm tracking-wide text-slate-100">玄甲</strong>
              <small className="mt-0.5 block text-[10px] tracking-[0.12em] text-cyan-300">
                学生自主学习中心
              </small>
            </span>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-white/5 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭导航"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 pt-5">
          <Link
            href="/student/self-study"
            className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-semibold text-[#06111f] shadow-lg shadow-cyan-500/10"
          >
            <span className="flex items-center gap-2">
              <Bot size={17} /> 与学习智能体对话
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>

        <nav className="mt-5 flex-1 space-y-1 px-3">
          {NAVIGATION.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'}`}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 1.9} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <Link
            href="/student/profile"
            className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${pathname.startsWith('/student/profile') ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-800 text-cyan-300">
              <UserRound size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-medium text-slate-200">
                {user?.displayName || user?.username}
              </strong>
              <small className="mt-0.5 block text-[10px] text-slate-600">记忆与学习偏好</small>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-slate-500 transition hover:bg-rose-400/[0.06] hover:text-rose-300"
          >
            <LogOut size={15} />
            退出学生端
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航遮罩"
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#06111f]/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2 text-slate-400 hover:bg-white/5 lg:hidden"
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-200">
                {pageTitle(pathname)}
              </div>
              <div className="mt-0.5 hidden text-[10px] text-slate-600 sm:block">
                目标、行动与证据都归你本人所有
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/10 bg-emerald-400/[0.06] px-3 py-1.5 text-[10px] text-emerald-300 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> 学习空间已同步
            </span>
            <Link
              href="/student/profile"
              className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-400 hover:text-cyan-300"
              aria-label="学习偏好"
            >
              <UserRound size={17} />
            </Link>
          </div>
        </header>
        <main
          className={
            immersive
              ? 'h-[calc(100vh-4rem)] overflow-hidden pb-16 lg:pb-0'
              : 'mx-auto max-w-[1380px] px-4 py-6 pb-24 sm:px-6 lg:pb-8'
          }
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/[0.08] bg-[#081522]/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {NAVIGATION.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex flex-col items-center gap-1 py-2 text-[9px] ${active ? 'text-cyan-300' : 'text-slate-600'}`}
            >
              <Icon size={17} />
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function pageTitle(pathname: string) {
  if (pathname.startsWith('/student/self-study')) return '学习智能体';
  if (pathname.startsWith('/student/courses')) return '我的课程与内容';
  if (pathname.startsWith('/student/tasks')) return '教师任务';
  if (pathname.startsWith('/student/review')) return '成长与评价';
  if (pathname.startsWith('/student/profile')) return '学习偏好与记忆';
  return '学习概览';
}
