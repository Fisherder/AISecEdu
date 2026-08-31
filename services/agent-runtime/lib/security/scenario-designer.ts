/**
 * Scenario Designer — bridges vague user input to concrete generation specs.
 *
 * Given a rough topic, uses the LLM to propose 2-3 detailed, hands-on
 * scenario designs. The user picks one, and its `description` field is
 * used directly for artifact generation.
 */
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { buildSecurityKnowledgeContext } from './context-builder';
import { buildTemplateContext } from './template-matcher';
import { resolveModel } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import type { AICallFn } from '@/lib/generation/pipeline-types';

const log = createLogger('ScenarioDesigner');

export interface ScenarioProposal {
  title: string;
  type: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  summary: string;
  scenario: string;
  keyElements: string[];
  description: string;
}

/**
 * Design 2-3 concrete scenario proposals from a rough topic.
 * Returns structured proposals the user can choose from.
 */
export async function designScenarios(topic: string, description?: string): Promise<ScenarioProposal[]> {
  const { model, modelInfo } = await resolveModel({ stage: 'generate-classroom' });
  const aiCall: AICallFn = async (system, user) => {
    const r = await callLLM(
      { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxOutputTokens: modelInfo?.outputWindow },
      'generate-classroom',
    );
    return r.text;
  };

  // Build context (KB + templates) to ground the proposals in proven patterns
  const securityKnowledge = await buildSecurityKnowledgeContext(topic, description);
  const templateHints = buildTemplateContext(topic, description);

  const prompts = buildPrompt(PROMPT_IDS.SCENARIO_DESIGN, {
    topic,
    description: description || '',
    securityKnowledge,
    templateHints,
    subjectProfile: true,
  });

  if (!prompts) {
    log.error('scenario-design prompt not found');
    return [];
  }

  const raw = await aiCall(prompts.system, prompts.user);

  // Parse JSON array from response
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];

  try {
    const proposals = JSON.parse(text.slice(start, end + 1)) as ScenarioProposal[];
    return proposals.filter((p) => p.title && p.description);
  } catch {
    log.error('Failed to parse scenario proposals');
    return [];
  }
}
