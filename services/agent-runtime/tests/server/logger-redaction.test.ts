import { afterEach, describe, expect, test, vi } from 'vitest';
import { createLogger, redactLogText } from '@/lib/logger';

describe('OpenMAIC log redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEST_PROVIDER_SECRET;
  });

  test('removes credentials, flags, private fields, and configured secrets', () => {
    process.env.TEST_PROVIDER_SECRET = 'provider-secret-sentinel';
    const emit = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logger = createLogger('security-test');

    logger.error(
      'Bearer bearer-secret pwn.college{fake-flag} https://user:db-pass@example.invalid/path',
      {
        apiKey: 'object-api-key',
        prompt: 'private course prompt',
        detail: 'provider-secret-sentinel',
      },
      new Error('token=exception-token'),
    );

    const line = String(emit.mock.calls[0]?.[0] || '');
    expect(line).toContain('[REDACTED]');
    expect(line).toContain('[REDACTED_FLAG]');
    for (const secret of [
      'bearer-secret',
      'fake-flag',
      'db-pass',
      'object-api-key',
      'private course prompt',
      'provider-secret-sentinel',
      'exception-token',
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  test('keeps non-sensitive diagnostic context', () => {
    expect(redactLogText('job=job_123 stage=render status=FAILED')).toBe(
      'job=job_123 stage=render status=FAILED',
    );
  });
});
