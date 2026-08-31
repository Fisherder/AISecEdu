import { describe, expect, test } from 'vitest';
import {
  integratedSessionApiAllowed,
  integratedSessionPageAllowed,
  isModelBilledIntegratedApi,
} from '../../middleware';

describe('玄甲 integrated browser API policy', () => {
  test.each([
    ['/api/integration/aisecedu/self-workspace', 'GET'],
    ['/api/integration/aisecedu/self-workspace/generate', 'POST'],
    ['/api/lessons/artifact_123', 'GET'],
    ['/api/classroom', 'GET'],
    ['/api/chat', 'POST'],
    ['/api/chat/pi', 'POST'],
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
  ])('blocks gateway bypass %s %s', (path, method) => {
    expect(integratedSessionApiAllowed(path, method)).toBe(false);
  });

  test.each([
    '/api/chat',
    '/api/chat/pi',
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
