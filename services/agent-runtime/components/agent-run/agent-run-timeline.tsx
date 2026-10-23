'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Clock3,
  Cpu,
  FileOutput,
  Loader2,
  MessageSquareText,
  Sparkles,
  TerminalSquare,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { AgentRunItem, AgentRunStatus } from '@/lib/agent-run/protocol';
import type { AgentRunState } from '@/lib/agent-run/reducer';

const KIND_ICON: Record<AgentRunItem['kind'], LucideIcon> = {
  model: Cpu,
  reasoning: Brain,
  message: MessageSquareText,
  tool: Wrench,
  command: TerminalSquare,
  workflow: Sparkles,
  artifact: FileOutput,
};

const KIND_TONE: Record<AgentRunItem['kind'], string> = {
  model: 'text-blue-500 bg-blue-500/10 ring-blue-500/20',
  reasoning: 'text-violet-500 bg-violet-500/10 ring-violet-500/20',
  message: 'text-sky-500 bg-sky-500/10 ring-sky-500/20',
  tool: 'text-cyan-500 bg-cyan-500/10 ring-cyan-500/20',
  command: 'text-amber-500 bg-amber-500/10 ring-amber-500/20',
  workflow: 'text-indigo-500 bg-indigo-500/10 ring-indigo-500/20',
  artifact: 'text-emerald-500 bg-emerald-500/10 ring-emerald-500/20',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function statusIcon(status: AgentRunStatus) {
  if (status === 'running') return <Loader2 className="size-3 animate-spin text-violet-500" />;
  if (status === 'completed') return <Check className="size-3 text-emerald-500" />;
  if (status === 'cancelled') return <CircleStop className="size-3 text-amber-500" />;
  return <X className="size-3 text-rose-500" />;
}

function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DetailBlock({
  label,
  value,
  terminal,
}: {
  label: string;
  value: unknown;
  terminal?: boolean;
}) {
  if (value == null || value === '') return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
        {label}
      </div>
      <pre
        className={cn(
          'max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[11px] leading-[1.55]',
          terminal
            ? 'bg-[#0d1117] font-mono text-[#d1d7e0] shadow-inner'
            : 'border border-border/70 bg-muted/45 font-mono text-muted-foreground',
        )}
      >
        {pretty(value)}
      </pre>
    </div>
  );
}

function RunItemRow({ item, now }: { item: AgentRunItem; now: number }) {
  const [open, setOpen] = useState(item.status === 'failed');
  const Icon = KIND_ICON[item.kind];
  const duration = item.durationMs ?? Math.max(0, (item.completedAt ?? now) - item.startedAt);
  const hasDetails = Boolean(
    item.content ||
    item.input != null ||
    item.output ||
    item.command ||
    item.cwd ||
    item.exitCode != null,
  );

  return (
    <div
      className="group relative grid grid-cols-[28px_minmax(0,1fr)] gap-2.5"
      data-agent-run-item={item.kind}
    >
      <div className="relative z-10 mt-0.5 grid size-7 place-items-center rounded-full bg-background ring-1 ring-border/80">
        <span
          className={cn('grid size-5 place-items-center rounded-full ring-1', KIND_TONE[item.kind])}
        >
          <Icon className="size-3" />
        </span>
      </div>
      <div
        className={cn(
          'min-w-0 rounded-xl border bg-background/75 shadow-sm transition-colors',
          item.status === 'running'
            ? 'border-violet-300/70 shadow-violet-500/5 dark:border-violet-500/35'
            : item.status === 'failed'
              ? 'border-rose-300/70 dark:border-rose-500/30'
              : 'border-border/70',
        )}
      >
        <button
          type="button"
          onClick={() => hasDetails && setOpen((value) => !value)}
          className={cn(
            'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left',
            hasDetails ? 'cursor-pointer' : 'cursor-default',
          )}
          aria-expanded={hasDetails ? open : undefined}
        >
          {hasDetails ? (
            open ? (
              <ChevronDown className="size-3 shrink-0 text-muted-foreground/65" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/65" />
            )
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12.5px] font-semibold text-foreground">
                {item.title}
              </span>
              {item.subtitle ? (
                <span className="hidden truncate font-mono text-[10px] text-muted-foreground/55 sm:inline">
                  {item.subtitle}
                </span>
              ) : null}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/55">
            {statusIcon(item.status)}
            {formatDuration(duration)}
          </span>
        </button>
        {open && hasDetails ? (
          <div className="space-y-3 border-t border-border/60 px-3 py-3 text-left">
            {item.command ? (
              <DetailBlock
                label={item.cwd ? `Command · ${item.cwd}` : 'Command'}
                value={`$ ${item.command}${item.output ? `\n${item.output}` : ''}`}
                terminal
              />
            ) : null}
            {item.content ? (
              <div className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted-foreground">
                {item.content}
              </div>
            ) : null}
            {!item.command ? <DetailBlock label="Input" value={item.input} /> : null}
            {!item.command ? (
              <DetailBlock label="Output" value={item.output} terminal={item.kind === 'command'} />
            ) : null}
            {item.exitCode != null ? (
              <div className="font-mono text-[10px] text-muted-foreground/60">
                exit {item.exitCode}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AgentRunTimeline({
  run,
  className,
  compact = false,
}: {
  run?: AgentRunState;
  className?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [run?.status]);

  const items = useMemo(
    () => run?.itemOrder.map((id) => run.items[id]).filter(Boolean) ?? [],
    [run],
  );
  if (!run?.runId) return null;
  const elapsed = Math.max(0, (run.completedAt ?? now) - run.startedAt);

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card/85 text-left shadow-lg shadow-slate-950/[0.04] backdrop-blur-xl',
        className,
      )}
      aria-label="Agent run timeline"
    >
      <header className="flex items-center gap-3 border-b border-border/60 bg-muted/25 px-4 py-3">
        <div className="relative grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <Sparkles className="size-4" />
          {run.status === 'running' ? (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full border-2 border-card bg-emerald-400" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">{run.label}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground/65">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3" />
              {formatDuration(elapsed)}
            </span>
            <span>·</span>
            <span>{items.length} steps</span>
            <span>·</span>
            <span className="capitalize">{run.status}</span>
          </div>
        </div>
        {statusIcon(run.status)}
      </header>

      <div
        className={cn(
          'relative space-y-2.5 overflow-y-auto px-3 py-3',
          compact ? 'max-h-72' : 'max-h-[520px]',
        )}
      >
        {items.length > 1 ? (
          <div className="pointer-events-none absolute bottom-7 left-[26px] top-7 w-px bg-gradient-to-b from-violet-300/60 via-border to-transparent dark:from-violet-500/35" />
        ) : null}
        {items.map((item) => (
          <RunItemRow key={item.id} item={item} now={now} />
        ))}
        {items.length === 0 && run.status === 'running' ? (
          <div className="flex items-center gap-2 px-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            正在建立运行上下文…
          </div>
        ) : null}
        {run.error ? (
          <div className="rounded-xl border border-rose-300/60 bg-rose-500/5 px-3 py-2 text-xs leading-relaxed text-rose-600 dark:border-rose-500/30 dark:text-rose-300">
            {run.error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
