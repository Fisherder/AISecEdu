import { existsSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { classroomPortraitUrl } from '@/lib/constants/classroom-portraits';
import {
  integratedSessionApiAllowed,
  integratedSessionPageAllowed,
  isModelBilledIntegratedApi,
  middleware,
} from '../../middleware';

describe('玄甲 integrated browser API policy', () => {
  test.each([
    ['/api/integration/aisecedu/self-workspace', 'GET'],
    ['/api/integration/aisecedu/self-workspace/generate', 'POST'],
    ['/api/lessons/artifact_123', 'GET'],
    ['/api/classroom', 'GET'],
    ['/api/chat', 'POST'],
    ['/api/debates/artifact_123', 'GET'],
    ['/api/debates/artifact_123', 'POST'],
    ['/api/chat/pi', 'POST'],
    ['/api/pbl/chat', 'POST'],
    ['/api/pbl/v2/instructor', 'POST'],
    ['/api/quiz-grade', 'POST'],
    ['/api/generate/tts', 'POST'],
  ])('allows scoped runtime request %s %s', (path, method) => {
    expect(integratedSessionApiAllowed(path, method)).toBe(true);
  });

  test.each([
    ['/api/lessons', 'POST'],
    ['/api/lessons/artifact_123', 'PATCH'],
    ['/api/classroom', 'POST'],
    ['/api/generate/image', 'POST'],
    ['/api/generate-classroom', 'POST'],
    ['/api/agent/edit', 'POST'],
    ['/api/storage/upload', 'POST'],
    ['/api/provider/probe-models', 'POST'],
    ['/api/usage', 'GET'],
    ['/api/debates/artifact_123', 'DELETE'],
  ])('blocks gateway bypass %s %s', (path, method) => {
    expect(integratedSessionApiAllowed(path, method)).toBe(false);
  });

  test.each([
    '/api/chat',
    '/api/chat/pi',
    '/api/debates/artifact_123',
    '/api/pbl/chat',
    '/api/pbl/v2/instructor',
    '/api/quiz-grade',
  ])('marks model-billed student API %s for quota preflight', (path) => {
    expect(isModelBilledIntegratedApi(path)).toBe(true);
  });

  test.each(['/api/classroom', '/api/lessons/artifact_123', '/api/generate/tts'])(
    'does not apply model-token preflight to %s',
    (path) => expect(isModelBilledIntegratedApi(path)).toBe(false),
  );

  test.each([
    ['/prep/artifact_123', 'teacher'],
    ['/classroom/session_123', 'teacher'],
    ['/security-learn', 'student'],
    ['/prep/artifact_123', 'student'],
    ['/classroom/study_artifact_123', 'student'],
    ['/classroom/session_123', 'student'],
  ] as const)('allows scoped integrated page %s for %s', (path, role) => {
    expect(integratedSessionPageAllowed(path, role)).toBe(true);
  });

  test.each([
    ['/prep', 'teacher'],
    ['/generation-preview', 'teacher'],
    ['/security-learn', 'teacher'],
    ['/prep', 'student'],
    ['/settings', 'student'],
    ['/eval/whiteboard', 'student'],
  ] as const)('blocks standalone product page %s for %s', (path, role) => {
    expect(integratedSessionPageAllowed(path, role)).toBe(false);
  });
});

describe('bundled classroom portraits', () => {
  const portraits = ['teacher.png', 'assist.png', 'clown.png', 'user.png'];

  afterEach(() => vi.unstubAllEnvs());

  test.each([
    ['true', '/agent-runtime'],
    ['false', ''],
  ])('serves the bundled portraits with integration=%s and base=%s', async (integrated, basePath) => {
    vi.stubEnv('AISECEDU_INTEGRATED', integrated);
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);
    for (const portrait of portraits) {
      const path = '/avatars/' + portrait;
      expect(existsSync('public' + path)).toBe(true);
      const url = classroomPortraitUrl(path);
      expect(url).toBe(basePath + path);
      for (const method of ['GET', 'HEAD']) {
        const response = await middleware(new NextRequest('http://runtime.test' + url, { method }));
        expect(response.headers.get('x-middleware-next')).toBe('1');
      }
    }
    expect(classroomPortraitUrl('/agent-runtime/avatars/user.png')).toBe('/agent-runtime/avatars/user.png');
    expect(classroomPortraitUrl('/uploads/user.png')).toBe('/uploads/user.png');
    expect(classroomPortraitUrl('https://example.test/avatars/user.png')).toBe('https://example.test/avatars/user.png');
    expect(classroomPortraitUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  test.each([
    ['/avatars/teacher.png', 'POST'],
    ['/avatars/unknown.png', 'GET'],
    ['/avatars/teacher.png/other', 'GET'],
    ['/avatars/extra/teacher.png', 'HEAD'],
    ['/api/private', 'GET'],
  ])('keeps %s %s subject to integrated authorization', async (path, method) => {
    vi.stubEnv('AISECEDU_INTEGRATED', 'true');
    vi.stubEnv('AISECEDU_PUBLIC_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/agent-runtime');
    const response = await middleware(
      new NextRequest('http://runtime.test/agent-runtime' + path, { method }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.has('x-middleware-next')).toBe(false);
  });
});
