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
import {
  materialSystemPrompt, teachingMaterialPlugin, TeachingMaterialTurnError,
} from './teaching-material.mjs';
import {
  classroomDirectorPlugin, directorSystemPrompt, ClassroomDirectorTurnError, validateDirectorTurn,
} from './classroom-director.mjs';
import {
  classroomDialoguePlugin, dialogueSystemPrompt, validateClassroomDialogue, ClassroomDialogueError,
} from './classroom-dialogue.mjs';

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

function formatMeasuredUsage(usage) {
  if (!usage || ![usage.inputTokens, usage.outputTokens].every(value =>
    Number.isSafeInteger(value) && value >= 0,
  )) return;
  const fields = formatUsage(usage);
  // The official adapter initializes absent counters to zero. This nonempty
  // input and the emitted tool call or answer necessarily consume both kinds.
  if (fields?.prompt_tokens > 0 && fields.completion_tokens > 0 && Object.values(fields).every(value =>
    value === undefined || (Number.isSafeInteger(value) && value >= 0),
  )) return fields;
}

function sumMeasuredUsage(measured) {
  if (!measured.length) return;
  const total = {};
  for (const step of measured) {
    for (const [key, value] of Object.entries(step)) {
      if (value !== undefined) total[key] = (total[key] ?? 0) + value;
    }
  }
  if (Object.values(total).every(Number.isSafeInteger)) return total;
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
    turn: runTurn,
    materialTurn(question, materials, signal) {
      return runTurn([
        { role: 'system', content: materialSystemPrompt(materials.length) },
        { role: 'user', content: question },
      ], signal, [], { materials });
    },
    directorTurn(input, signal) {
      const director = validateDirectorTurn(input);
      if (!director) throw new Error('Invalid classroom director input');
      return runTurn([
        { role: 'system', content: directorSystemPrompt },
        { role: 'user', content: JSON.stringify(director) },
      ], signal, [], { director });
    },
    classroomDialogue(input, signal, sendSpeech) {
      const dialogue = validateClassroomDialogue(input);
      if (!dialogue) throw new ClassroomDialogueError({});
      return runTurn([
        { role: 'system', content: dialogueSystemPrompt },
        { role: 'user', content: JSON.stringify(dialogue) },
      ], signal, [], { dialogue, sendSpeech });
    },
  };

  async function runTurn(messages, signal, images = [], { materials, director, dialogue, sendSpeech } = {}) {
    const materialReads = new Set();
    const decision = {};
    const discussion = { speeches: 0, next: undefined };
    const measured = [];
    let modelAttempts = 0;
    let approvedSteps = 0;
    let approvedStep;
    let assistant;
    let finish;
    let unsubscribe;
    let handle;

    function cancel() {
      handle.agent.cancel({ kind: 'user' });
    }

    function approveStep(log, call) {
      if (!log || !approvedStep || log.turn !== approvedStep.turn || log.step !== approvedStep.step ||
          call.id !== approvedStep.call.id || call.name !== approvedStep.call.name ||
          call.arguments !== approvedStep.call.arguments) return false;
      approvedStep = undefined;
      approvedSteps += 1;
      return true;
    }

    try {
      signal.throwIfAborted();
      const finalMessage = messages.at(-1);
      if (finalMessage?.role !== 'user') throw new Error('A Harness turn must end with a user message');
      if (images.length && !ctx.attachments) throw new Error('Use imageTurn to submit teaching images');
      const attachments = images.length ? await ctx.attachments.saveImages(images) : [];
      const system = messages[0].role === 'system' ? messages[0].content : '';
      const history = messages.slice(messages[0].role === 'system' ? 1 : 0, -1);

      handle = await ctx.agents.create({
        sessionId: SessionId(randomUUID()),
        agentOptions: {
          provider, model,
          ...(dialogue ? { maxTokens: 4096 } : director ? { maxTokens: 512 } : {}),
        },
        signal,
        async setup(scope, agent) {
          if (materials) await scope.plugin(teachingMaterialPlugin(materials, materialReads));
          if (director) await scope.plugin(classroomDirectorPlugin(director.roles.length, decision));
          if (dialogue) {
            await scope.plugin(classroomDialoguePlugin(dialogue.roles.length, discussion, approveStep, speech => {
              const usage = sumMeasuredUsage(measured);
              if (!usage) throw new Error('Classroom dialogue usage is unavailable');
              sendSpeech({ ...speech, model, usage });
            }));
          }
          scope.systemPrompt.section({
            name: 'request-system', order: 0, interpolate: false, text: system,
          });
          installHistory(agent.session, { system, history, model });
          unsubscribe = scope.on('session/event', (session, event) => {
            if (session !== agent.session) return;
            if (event.type === 'assistant/message') assistant = event.data;
            if (event.type === 'turn/end') finish = event.data.reason.kind;
            if ((materials || director || dialogue) &&
                (event.type === 'assistant/message' || event.type === 'assistant/attempt')) {
              modelAttempts += 1;
              const usage = event.data.usage ?? event.data.stream.findLast(record =>
                record.type === 'chunk' && record.chunk.type === 'usage',
              )?.chunk.usage;
              const snapshot = formatMeasuredUsage(usage);
              if (snapshot) measured.push(snapshot);
              if (dialogue) {
                approvedStep = undefined;
                if (event.type !== 'assistant/message' || event.data.interrupted || !snapshot) return;
                const { message, stream, turn, step } = event.data;
                const stop = stream.findLast(record => record.type === 'chunk' && record.chunk.type === 'finish');
                const calls = message.content.filter(block => block.type === 'tool-call');
                if (stop?.chunk.reason.kind === 'tool-calls' && calls.length === 1 &&
                    message.content.every(block => block.type === 'tool-call' || block.type === 'reasoning')) {
                  approvedStep = { turn, step, call: calls[0] };
                }
              }
            }
          });
        },
      });

      signal.addEventListener('abort', cancel, { once: true });
      signal.throwIfAborted();
      handle.agent.followup(userMessage(finalMessage.content, attachments));
      await handle.agent.whenIdle();
      signal.throwIfAborted();
      if (finish !== 'completed' || assistant === undefined) throw new Error('Model turn failed');
      const { message, usage, stream } = assistant;
      if (dialogue) {
        const total = sumMeasuredUsage(measured);
        if (!discussion.next || !total || approvedSteps !== modelAttempts || measured.length !== modelAttempts) {
          throw new Error('Classroom dialogue did not finish with measured native actions');
        }
        return { next: discussion.next, model: message.source.model, usage: total };
      }
      if (director) {
        const total = sumMeasuredUsage(measured);
        const stop = stream.findLast(record => record.type === 'chunk' && record.chunk.type === 'finish');
        if (decision.speaker === undefined || modelAttempts !== 1 || measured.length !== modelAttempts || !total ||
            stop?.chunk.reason.kind !== 'tool-calls' ||
            message.content.some(block => block.type !== 'reasoning' && block.type !== 'tool-call')) {
          throw new Error('Classroom director did not complete with one measured choice');
        }
        return { decision, model: message.source.model, usage: total };
      }
      const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('');
      if (!text.trim()) throw new Error('Model returned no text');
      // The official loop records the requested model in source, even when the
      // provider returns a different model identifier for an alias.
      if (!materials) return { text, model: message.source.model, usage: formatUsage(usage) };

      const total = sumMeasuredUsage(measured);
      if (!materialReads.size || modelAttempts < 2 || measured.length !== modelAttempts || !total) {
        throw new Error('Teaching material turn did not complete with measured reads');
      }
      return { text, model: message.source.model, usage: total, materialReads: [...materialReads] };
    } catch (error) {
      if (!materials && !director && !dialogue) throw error;
      const usage = sumMeasuredUsage(measured);
      const receipt = usage ? { model, usage } : {};
      if (director) throw new ClassroomDirectorTurnError(receipt);
      if (dialogue) throw new ClassroomDialogueError(receipt);
      throw new TeachingMaterialTurnError(receipt);
    } finally {
      signal.removeEventListener('abort', cancel);
      unsubscribe?.();
      await handle?.dispose();
    }
  }
}
