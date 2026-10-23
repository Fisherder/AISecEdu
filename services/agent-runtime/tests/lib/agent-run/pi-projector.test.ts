import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { createPiAgentRunProjector } from '@/lib/agent-run/pi-projector';

const partial = {
  role: 'assistant',
  content: [],
  api: 'unknown',
  provider: 'unknown',
  model: 'test',
  usage: {},
  stopReason: 'stop',
  timestamp: 0,
} as unknown as AssistantMessage;

describe('pi agent run projector', () => {
  it('projects genuine reasoning deltas and tool lifecycle events', () => {
    const projector = createPiAgentRunProjector('run-pi', '编辑页面');
    const source: AgentEvent[] = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'message_update',
        message: partial,
        assistantMessageEvent: { type: 'thinking_start', contentIndex: 0, partial },
      },
      {
        type: 'message_update',
        message: partial,
        assistantMessageEvent: {
          type: 'thinking_delta',
          contentIndex: 0,
          delta: '检查当前页面',
          partial,
        },
      },
      {
        type: 'message_update',
        message: partial,
        assistantMessageEvent: {
          type: 'thinking_end',
          contentIndex: 0,
          content: '检查当前页面',
          partial,
        },
      },
      {
        type: 'tool_execution_start',
        toolCallId: 'call-1',
        toolName: 'read_scene_content',
        args: { sceneId: 'scene-1' },
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'call-1',
        toolName: 'read_scene_content',
        result: { content: [{ type: 'text', text: 'scene loaded' }], details: {} },
        isError: false,
      },
      { type: 'turn_end', message: partial, toolResults: [] },
      { type: 'agent_end', messages: [partial] },
    ];

    const events = source.flatMap((event) => projector.project(event).map((entry) => entry.event));
    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'turn.started',
      'item.started',
      'item.delta',
      'item.completed',
      'item.started',
      'item.completed',
      'turn.completed',
      'run.completed',
    ]);
    expect(events.find((event) => event.type === 'item.delta')).toMatchObject({
      delta: '检查当前页面',
      channel: 'content',
    });
    expect(
      events.find((event) => event.type === 'item.started' && event.item.kind === 'tool'),
    ).toMatchObject({
      item: { title: 'read scene content', input: { sceneId: 'scene-1' } },
    });
  });

  it('renders command tools with terminal metadata and exit status', () => {
    const projector = createPiAgentRunProjector('run-command', '运行命令');
    const source: AgentEvent[] = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      {
        type: 'tool_execution_start',
        toolCallId: 'command-1',
        toolName: 'exec_command',
        args: { cmd: 'npm test', cwd: '/workspace' },
      },
      {
        type: 'tool_execution_end',
        toolCallId: 'command-1',
        toolName: 'exec_command',
        result: {
          content: [{ type: 'text', text: '42 tests passed' }],
          details: { exitCode: 0 },
        },
        isError: false,
      },
    ];

    const events = source.flatMap((event) => projector.project(event).map((entry) => entry.event));
    expect(
      events.find((event) => event.type === 'item.started' && event.item.kind === 'command'),
    ).toMatchObject({
      item: {
        command: 'npm test',
        cwd: '/workspace',
        input: { cmd: 'npm test', cwd: '/workspace' },
      },
    });
    expect(events.find((event) => event.type === 'item.completed')).toMatchObject({
      exitCode: 0,
      output: '42 tests passed',
      status: 'completed',
    });
  });
});
