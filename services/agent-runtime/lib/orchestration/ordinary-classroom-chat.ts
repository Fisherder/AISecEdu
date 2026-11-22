import { randomUUID } from 'node:crypto';
import type { AISecEduRequestSession } from '@/lib/server/aisecedu-integration';
import type {
  ClassroomDialogueHistoryEntry,
  ClassroomDialogueRole,
  createClassroomDialogue,
} from '@/lib/server/agent-harness/classroom-turn';
import type { OrdinaryClassroomChatContext } from '@/lib/server/ordinary-classroom-chat';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';

const classroomRoles = [
  {
    id: 'default-1', role: 'teacher', name: 'AI teacher', avatar: '/avatars/teacher.png',
    color: '#3b82f6',
  },
  {
    id: 'default-2', role: 'assistant', name: 'AI助教', avatar: '/avatars/assist.png',
    color: '#10b981',
  },
  {
    id: 'default-3', role: 'student', name: '显眼包', avatar: '/avatars/clown.png',
    color: '#f59e0b',
  },
] as const satisfies ReadonlyArray<{
  id: string; role: ClassroomDialogueRole; name: string; avatar: string; color: string;
}>;

type ClassroomRole = (typeof classroomRoles)[number];

function chatHistory(
  messages: StatelessChatRequest['messages'],
  agents: readonly ClassroomRole[],
): ClassroomDialogueHistoryEntry[] {
  const history: ClassroomDialogueHistoryEntry[] = [];
  for (const message of messages.slice(-48)) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue;
    const ordinal = agents.findIndex(({ id }) => id === message.metadata?.agentId) + 1;
    const speaker = message.role === 'user' ? 'user' : ordinal;
    if (speaker === 0 || !Array.isArray(message.parts)) continue;

    let text = '';
    for (const part of message.parts) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue;
      text += (text ? '\n' : '') + part.text.slice(0, 900 - text.length);
      if (text.length >= 900) break;
    }
    text = text.toWellFormed().replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, '').trim();
    if (text) history.push({ speaker, text });
  }
  return history.slice(-12);
}

export async function* ordinaryClassroomChat(
  request: Pick<StatelessChatRequest, 'messages' | 'config'>,
  context: OrdinaryClassroomChatContext,
  capturedSession: AISecEduRequestSession,
  signal: AbortSignal,
  runDialogue: NonNullable<ReturnType<typeof createClassroomDialogue>>,
): AsyncGenerator<StatelessEvent> {
  const selected = classroomRoles.filter(({ id }) => request.config.agentIds.includes(id));
  const agents = selected.length ? selected : [classroomRoles[0]];
  const input = {
    roles: agents.map(({ role }) => role),
    history: chatHistory(request.messages, agents),
    topic: Array.from(context.topic.trim().toWellFormed()).slice(0, 240).join(''),
    slideText: Array.from(context.slideText.trim().toWellFormed()).slice(0, 6000).join(''),
  };

  yield { type: 'thinking', data: { stage: 'director' } };
  let totalAgents = 0;
  let lastAgentId: string | undefined;
  for await (const event of runDialogue(input, signal, capturedSession)) {
    signal.throwIfAborted();
    if (event.type === 'done') {
      const cueUserReceived = event.next === 'user';
      if (cueUserReceived) yield { type: 'cue_user', data: { fromAgentId: lastAgentId } };
      yield {
        type: 'done',
        data: { totalActions: 0, totalAgents, agentHadContent: totalAgents > 0, cueUserReceived },
      };
      return;
    }

    const agent = agents[event.speaker - 1];
    const agentId = agent.id;
    const messageId = randomUUID();
    yield { type: 'thinking', data: { stage: 'agent_loading', agentId } };
    yield {
      type: 'agent_start',
      data: {
        messageId,
        agentId,
        agentName: agent.name,
        agentAvatar: agent.avatar,
        agentColor: agent.color,
      },
    };
    yield { type: 'text_delta', data: { content: event.text, messageId } };
    yield { type: 'agent_end', data: { messageId, agentId } };
    lastAgentId = agentId;
    totalAgents++;
  }
}
