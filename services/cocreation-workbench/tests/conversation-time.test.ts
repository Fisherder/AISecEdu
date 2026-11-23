import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationDate, conversationTimeLabel, messageClock, startsTimeGroup } from '../src/core/conversation-time.ts';

test('labels recent days and only shows hours and minutes on the message footer', () => {
  const now = new Date(2026, 10, 23, 20, 30);
  const sent = new Date(2026, 10, 23, 20, 24);
  assert.equal(conversationTimeLabel(sent, now), '今天 20:24');
  assert.equal(conversationTimeLabel(sent, new Date(2026, 10, 24, 4)), '昨天 20:24');
  assert.equal(messageClock(sent), '20:24');
  assert.equal(conversationDate('invalid'), undefined);
});

test('separates days and idle gaps using the previous reply completion time', () => {
  const previous = new Date(2026, 10, 23, 20, 0);
  assert.equal(startsTimeGroup(previous), true);
  assert.equal(startsTimeGroup(new Date(2026, 10, 23, 20, 29), previous), false);
  assert.equal(startsTimeGroup(new Date(2026, 10, 23, 20, 30), previous), true);
  assert.equal(startsTimeGroup(new Date(2026, 10, 23, 21, 0), previous,
    new Date(2026, 10, 23, 20, 59)), false);
  assert.equal(startsTimeGroup(new Date(2026, 10, 24, 0, 0), new Date(2026, 10, 23, 23, 59)), true);
});
