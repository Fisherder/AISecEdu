import { describe, expect, it } from 'vitest';
import { translateServer } from '@/lib/i18n/server';

describe('translateServer', () => {
  it('resolves concurrent calls for the same locale and clamps unknown locales', async () => {
    const [invalidDecision, interrupted, unknownLocale] = await Promise.all([
      translateServer('en-US', 'chat.error.invalidDirectorDecision'),
      translateServer('en-US', 'chat.error.directorInterrupted'),
      translateServer('xx-UNKNOWN', 'chat.error.directorInterrupted'),
    ]);

    expect(invalidDecision).toBe('The classroom director returned an invalid decision.');
    expect(interrupted).toBe('This classroom turn ended early. You can keep asking questions.');
    expect(unknownLocale).toBe('本轮课堂对话提前结束，你可以继续提问。');
  });
});
