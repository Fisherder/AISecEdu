import type { Draft } from './types';

export function readLocal<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(name: string, value: unknown) {
  try {
    localStorage.setItem(name, JSON.stringify(value));
  } catch {
    /* Private browsing and full storage must not interrupt a running task. */
  }
}
export const blankDraft = (): Draft => ({
  learningPattern: '',
  text: '',
  mode: 'auto',
  delivery: 'after-current',
  sources: [],
  skills: [],
  artifactType: 'auto',
});
export class WorkspaceStorage {
  constructor(private owner: string) {}
  name(thread: string | null, kind = 'draft') {
    return `aisecedu:workbench:v3:${this.owner}:${thread || 'new'}:${kind}`;
  }
  draft(thread: string | null, selectedPattern = ''): Draft {
    const saved = readLocal<Partial<Draft>>(this.name(thread), {});
    return {
      ...blankDraft(),
      ...saved,
      learningPattern: (saved.learningPattern ?? selectedPattern) === 'process-inquiry' ? 'process-inquiry' : '',
      mode: 'auto',
      sources: Array.isArray(saved.sources) ? saved.sources : [],
      skills: Array.isArray(saved.skills) ? saved.skills : [],
    };
  }
  save(thread: string | null, draft: Draft) {
    writeLocal(this.name(thread), draft);
  }
  value<T>(kind: string, fallback: T) {
    return readLocal(this.name(null, kind), fallback);
  }
  set(kind: string, value: unknown) {
    writeLocal(this.name(null, kind), value);
  }
}
