import type { Message } from './types';

export interface ConversationFile {
  id: string;
  jobId: string;
  filename: string;
  format: string;
  size: number;
}

const fileFormats: Record<string, string> = {
  docx: 'Word 文档',
  md: 'Markdown',
  txt: '纯文本',
  html: '网页',
  csv: 'CSV 表格',
  json: 'JSON',
  ipynb: 'Jupyter 笔记本',
};

export const fileFormatLabel = (format: string) => fileFormats[format] || format.toUpperCase();

export function asConversationFile(value: unknown): ConversationFile | undefined {
  if (!value || typeof value !== 'object') return;
  const { id, jobId, filename, format, size } = value as Partial<ConversationFile>;
  if (typeof id !== 'string' || !/^file_[a-f0-9]{32}$/.test(id) ||
      typeof jobId !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(jobId) ||
      typeof filename !== 'string' || !filename.trim() ||
      typeof format !== 'string' || !Object.hasOwn(fileFormats, format)) return;
  return { id, jobId, filename, format, size: typeof size === 'number' && size > 0 ? size : 0 };
}

export function conversationFiles(messages: Message[] = []) {
  const files = new Map<string, ConversationFile>();
  for (const message of messages) {
    const items = message.metadata?.files;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const file = asConversationFile(item);
      if (file) files.set(file.id, file);
    }
  }
  return [...files.values()].reverse();
}

export const filePath = (file: ConversationFile) =>
  `/jobs/${encodeURIComponent(file.jobId)}/files/${encodeURIComponent(file.id)}`;

export const fileUrl = (file: ConversationFile) => `/pwncollege_api/v1/teaching${filePath(file)}`;

export function fileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
