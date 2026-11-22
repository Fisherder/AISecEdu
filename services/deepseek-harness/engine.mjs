import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import LlmRuntime, {
  createAssistantMessage, createSystemMessage, createUserMessage,
} from '@deepseek-ai/dsh-llm';
import * as DeepSeekProvider from '@deepseek-ai/dsh-llm-deepseek-api-key';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

const provider = 'deepseek-official';

function textBlock(text) {
  return [{ type: 'text', text }];
}

function userMessage(content, images = []) {
  return createUserMessage({
    content: [...textBlock(content), ...images.map(attachment => ({ type: 'image', attachment }))],
    source: { kind: 'user' },
  });
}

function installHistory(session, { system, history, model }) {
  const surface = { surfaceOp: 'append' };
  session.append('system/message', {
    turn: 0, step: 0, message: createSystemMessage(system),
  }, surface);

  for (const { role, content } of history) {
    if (role === 'user') {
      session.append('user/message', userMessage(content), surface);
    } else {
      session.append('assistant/message', {
        turn: 0,
        step: 0,
        message: createAssistantMessage({ content: textBlock(content), source: { provider, model } }),
        stream: [],
      }, surface);
    }
  }
}

function formatUsage(usage) {
  if (usage === undefined || usage.totalTokens === 0) return undefined;
  const prompt = usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const completion = usage.outputTokens;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    cache_read_input_tokens: usage.cacheReadTokens,
    cache_creation_input_tokens: usage.cacheWriteTokens,
    reasoning_tokens: usage.reasoningTokens,
  };
}

export async function createEngine({ model, baseURL, attachmentDir }) {
  const ctx = new Context();
  try {
    await ctx.plugin(LlmRuntime);
    if (attachmentDir) {
      const { default: LocalAttachments } = await import('@deepseek-ai/dsh-attachment-local');
      await ctx.plugin(LocalAttachments, {
        dshHome: attachmentDir, maxImageBytes: 2 * 1024 * 1024, maxImagesPerMessage: 2,
        maxMessageImageBytes: 4 * 1024 * 1024, maxImagePixels: 8_000_000, maxImageDimension: 4096,
        normalizedImageMaxPixels: 2_000_000, normalizedImageMaxDimension: 2048,
        normalizedImageMaxBytes: 1024 * 1024, imageCompressionConcurrency: 1,
      });
    }
    await ctx.plugin(SessionStore);
    await ctx.plugin(SessionProjectionRegistry);
    await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
    await ctx.plugin(ToolRuntime);
    await ctx.plugin({
      name: 'deny-tools',
      inject: ['tools'],
      apply(scope) {
        scope.tools.setExecutor({
          describe() {
            return { schemas: [], knownNames: [] };
          },
          async execute() {
            throw new Error('Tools are disabled');
          },
        });
      },
    });
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(AgentLoop, { agents: [] });
    await ctx.plugin(DeepSeekProvider, {
      baseURL,
      models: [{ id: model, inputModalities: attachmentDir ? ['text', 'image'] : ['text'] }],
    });
    if (ctx.agents === undefined || ctx.agentLoop === undefined || ctx.llm === undefined) {
      throw new Error('Harness composition did not start');
    }
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }

  return {
    close: () => ctx.fiber.dispose(),
    async imageTurn(messages, signal, images) {
      const directory = await mkdtemp(join(tmpdir(), 'teaching-images-'));
      let isolated;
      try {
        isolated = await createEngine({ model, baseURL, attachmentDir: directory });
        return await isolated.turn(messages, signal, images);
      } finally {
        try {
          await isolated?.close();
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
    async turn(messages, signal, images = []) {
      signal.throwIfAborted();
      const attachments = images.length ? await ctx.attachments.saveImages(images) : [];
      const system = messages[0].role === 'system' ? messages[0].content : '';
      const history = messages.slice(messages[0].role === 'system' ? 1 : 0, -1);
      let assistant;
      let finish;
      let unsubscribe;

      const handle = await ctx.agents.create({
        sessionId: SessionId(randomUUID()),
        agentOptions: { provider, model },
        signal,
        setup(scope, agent) {
          scope.systemPrompt.section({
            name: 'request-system', order: 0, interpolate: false, text: system,
          });
          installHistory(agent.session, { system, history, model });
          unsubscribe = scope.on('session/event', (session, event) => {
            if (session !== agent.session) return;
            if (event.type === 'assistant/message') assistant = event.data;
            if (event.type === 'turn/end') finish = event.data.reason.kind;
          });
        },
      });

      function cancel() {
        handle.agent.cancel({ kind: 'user' });
      }

      try {
        signal.addEventListener('abort', cancel, { once: true });
        signal.throwIfAborted();
        handle.agent.followup(userMessage(messages.at(-1).content, attachments));
        await handle.agent.whenIdle();
        signal.throwIfAborted();
        if (finish !== 'completed' || assistant === undefined) throw new Error('Model turn failed');
        const { message, usage } = assistant;
        const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
        if (!text.trim()) throw new Error('Model returned no text');
        // The official loop records the requested model in source, even when the
        // provider returns a different model identifier for an alias.
        return { text, model: message.source.model, usage: formatUsage(usage) };
      } finally {
        signal.removeEventListener('abort', cancel);
        unsubscribe?.();
        await handle.dispose();
      }
    },
  };
}
