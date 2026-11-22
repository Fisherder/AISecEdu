import type { NextRequest } from 'next/server';
import {
  ordinaryClassroomChatHeader,
  ordinaryClassroomChatRoute,
  ordinaryClassroomDialogueVersion,
  ordinaryClassroomDialogueVersionHeader,
} from '@/lib/chat/ordinary-classroom-contract';
import { apiError } from '@/lib/server/api-response';
import { createClassroomDialogue } from '@/lib/server/agent-harness/classroom-turn';
import type { resolveOrdinaryClassroomChat } from '@/lib/server/ordinary-classroom-chat';
import { ordinaryClassroomChat } from '@/lib/orchestration/ordinary-classroom-chat';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { streamChatEvents } from './stream';

type OrdinaryAuthority = Extract<
  Awaited<ReturnType<typeof resolveOrdinaryClassroomChat>>,
  { kind: 'ordinary' }
>;

export function streamOrdinaryClassroomChat(
  req: NextRequest,
  body: StatelessChatRequest,
  authority: OrdinaryAuthority,
): Response {
  if (req.headers.get(ordinaryClassroomDialogueVersionHeader) !== ordinaryClassroomDialogueVersion) {
    return apiError('INVALID_REQUEST', 409, '课堂对话已更新，请刷新页面后重试。');
  }
  const runDialogue = createClassroomDialogue();
  if (!runDialogue) return apiError('UPSTREAM_ERROR', 503, '课堂对话服务尚未配置。');

  return streamChatEvents(
    (signal) => ordinaryClassroomChat(body, authority.context, authority.capturedSession, signal, runDialogue),
    req.signal,
    165_000,
    {
      [ordinaryClassroomChatHeader]: ordinaryClassroomChatRoute,
      [ordinaryClassroomDialogueVersionHeader]: ordinaryClassroomDialogueVersion,
    },
  );
}
