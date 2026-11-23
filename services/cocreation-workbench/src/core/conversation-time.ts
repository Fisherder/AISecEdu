const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
const groupIntervalMs = 30 * 60 * 1000;

export function conversationDate(value?: string) {
  if (!value) return;
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z');
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function conversationTimeLabel(date: Date, now = new Date()) {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = sameDay(date, now) ? '今天' : sameDay(date, yesterday) ? '昨天'
    : (date.getFullYear() === now.getFullYear() ? shortDate : fullDate).format(date);
  return `${day} ${clock.format(date)}`;
}

export function startsTimeGroup(date: Date, previous?: Date, completed?: Date) {
  if (!previous || !sameDay(previous, date)) return true;
  const lastActivity = completed && completed > previous ? completed : previous;
  return date.getTime() - lastActivity.getTime() >= groupIntervalMs;
}

export const messageClock = (date: Date) => clock.format(date);
