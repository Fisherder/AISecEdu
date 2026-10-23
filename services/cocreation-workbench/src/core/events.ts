import type { ActivityItem, Data } from './types';

export function mergeEvents(previous: Data[], incoming: Data[]): Data[] {
  const seen = new Set(previous.map(eventIdentity));
  const result = [...previous];
  for (const row of incoming)
    if (!seen.has(eventIdentity(row))) {
      seen.add(eventIdentity(row));
      result.push(row);
    }
  return result;
}
export function eventIdentity(row: Data): string {
  return String(
    row.id ||
      `${row.sourceJobId || row.details?.agentRun?.runId}:${row.sourceSequence ?? row.sequence ?? row.details?.agentRun?.seq}`,
  );
}
export function projectActivity(jobId: string, rows: Data[], terminal = false): ActivityItem[] {
  const byRun = new Map<string, Data[]>();
  const result: ActivityItem[] = [];
  for (const row of rows) {
    const event = row.details?.agentRun;
    if (event?.runId && event?.type) {
      const run = byRun.get(event.runId) || [];
      run.push(event);
      byRun.set(event.runId, run);
    } else if (row.message || row.label)
      result.push({
        id: eventIdentity(row),
        jobId,
        runId: '',
        kind: 'workflow',
        title: String(row.message || row.label),
        status: row.status === 'FAILED' ? 'failed' : 'completed',
      });
  }
  for (const [runId, events] of byRun) {
    const items = new Map<string, ActivityItem>();
    let ended = false;
    let endStatus = 'incomplete';
    for (const event of events.sort((a, b) => Number(a.seq) - Number(b.seq))) {
      if (event.type === 'item.started' && event.item?.id && !items.has(event.item.id)) {
        const item: ActivityItem = {
          ...event.item,
          id: `${runId}:${event.item.id}`,
          jobId,
          runId,
          status: event.item.status || 'running',
        };
        items.set(event.item.id, item);
        result.push(item);
      }
      const item = items.get(event.itemId);
      if (item && event.type === 'item.delta') {
        const channel = event.channel === 'output' ? 'output' : 'content';
        item[channel] =
          (item[channel] || '') + (typeof event.delta === 'string' ? event.delta : '');
      }
      if (item && event.type === 'item.updated') {
        for (const field of [
          'kind',
          'title',
          'subtitle',
          'content',
          'output',
          'input',
          'command',
          'cwd',
          'exitCode',
          'status',
          'usage',
          'metadata',
        ] as const)
          if (event.patch?.[field] !== undefined) (item as Data)[field] = event.patch[field];
      }
      if (item && event.type === 'item.completed')
        Object.assign(
          item,
          { status: event.status || 'completed', completedAt: event.time },
          event.output !== undefined ? { output: event.output } : {},
          event.exitCode !== undefined ? { exitCode: event.exitCode } : {},
          event.metadata !== undefined
            ? { metadata: { ...(item as Data).metadata, ...event.metadata } }
            : {},
        );
      if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
        ended = true;
        endStatus =
          event.type === 'run.failed'
            ? 'failed'
            : event.type === 'run.cancelled'
              ? 'cancelled'
              : 'incomplete';
        if (event.error || event.reason)
          result.push({
            id: `${runId}:end`,
            jobId,
            runId,
            kind: 'workflow',
            title: '执行结束',
            content: String(event.error || event.reason),
            status: endStatus,
          });
      }
    }
    if (ended || terminal)
      for (const item of items.values()) if (item.status === 'running') item.status = endStatus;
  }
  return result;
}
export function streamedAnswer(content: string): string {
  const match = /"(?:answer|message)"\s*:\s*"/.exec(content);
  if (!match) return content.trimStart().startsWith('{') ? '' : content;
  const start = match.index + match[0].length;
  let text = '',
    escape = false;
  for (let i = start; i < content.length; i++) {
    const c = content[i];
    if (escape) {
      if (c === 'u') {
        const hex = content.slice(i + 1, i + 5);
        if (hex.length < 4) break;
        if (/^[a-f0-9]{4}$/i.test(hex)) {
          text += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        }
      } else text += ({ n: '\n', r: '\r', t: '\t' } as Data)[c] ?? c;
      escape = false;
    } else if (c === '\\') escape = true;
    else if (c === '"') break;
    else text += c;
  }
  return text;
}
