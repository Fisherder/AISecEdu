import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { resolveAgentRuntimeDataDir } from '@/lib/server/data-root';
import { upgradeLegacyCodeWidgetHtml } from '@/lib/generation/widget-workflow';
import { aiseceduRequest, isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

const DATA_DIR = resolveAgentRuntimeDataDir();
export const CLASSROOMS_DIR = path.join(DATA_DIR, 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(DATA_DIR, 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function upgradeLegacyClassroomCodeWidgets(data: PersistedClassroomData): boolean {
  let upgraded = false;
  for (const scene of data.scenes) {
    if (scene.type !== 'interactive') continue;
    const content = scene.content as unknown as Record<string, unknown>;
    if (content.widgetType !== 'code' || typeof content.html !== 'string') continue;
    const html = upgradeLegacyCodeWidgetHtml(content.html);
    if (html === content.html) continue;
    scene.content = { ...content, html } as typeof scene.content;
    upgraded = true;
  }
  return upgraded;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  if (isAISecEduIntegrated()) {
    try {
      const data = await aiseceduRequest<{ classroom: PersistedClassroomData }>(
        `/pwncollege_api/v1/teaching/runtime/classrooms/${encodeURIComponent(id)}`,
      );
      return data.classroom;
    } catch (error) {
      if ((error as Error & { status?: number }).status === 404) return null;
      throw error;
    }
  }
  const filePath = path.join(CLASSROOMS_DIR, `${id}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const classroom = JSON.parse(content) as PersistedClassroomData;
    if (upgradeLegacyClassroomCodeWidgets(classroom)) {
      await writeJsonFileAtomic(filePath, classroom);
    }
    return classroom;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  if (isAISecEduIntegrated()) {
    const result = await aiseceduRequest<{ classroom: PersistedClassroomData }>(
      `/pwncollege_api/v1/teaching/runtime/classrooms/${encodeURIComponent(data.id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(classroomData),
      },
    );
    return {
      ...result.classroom,
      url: `${baseUrl.replace(/\/$/, '')}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/classroom/${data.id}`,
    };
  }

  await ensureClassroomsDir();
  const filePath = path.join(CLASSROOMS_DIR, `${data.id}.json`);
  await writeJsonFileAtomic(filePath, classroomData);

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
