/**
 * Cybersecurity outline eval — deterministic (no LLM-judge).
 *
 * Bypasses the UI and calls generateSceneOutlinesFromRequirements directly
 * with the security subject profile + curriculum context. For each test case
 * it checks:
 *   1. Curriculum alignment — generated outline titles/descriptions/keyPoints
 *      mention the expected course knowledge-point keywords.
 *   2. Scene-type diversity — at least one non-slide scene (quiz/code/diagram/
 *      procedural-skill/pbl), since the security pedagogy steers toward them.
 *
 * Usage:
 *   EVAL_CYBER_MODEL=deepseek:deepseek-v4-flash \
 *   EVAL_CYBER_API_KEY=sk-... \
 *   EVAL_CYBER_BASE_URL=https://api.deepseek.com/v1 \
 *   pnpm tsx eval/cybersecurity/runner.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { generateSceneOutlinesFromRequirements } from '@/lib/generation/outline-generator';
import { buildCurriculumContext } from '@/lib/curriculum';
import type { AICallFn } from '@/lib/generation/pipeline-types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(
  readFileSync(join(__dirname, 'test-cases.json'), 'utf-8'),
) as Array<{ courseId: string; topic: string; expectedKeywords: string[] }>;

function parseModel(spec: string): { model: string; baseUrl?: string } {
  const [provider, ...rest] = spec.split(':');
  const model = rest.join(':');
  if (provider !== 'deepseek' && provider !== 'openai') {
    throw new Error(`EVAL_CYBER_MODEL: only deepseek:/openai: supported, got ${spec}`);
  }
  return { model, baseUrl: process.env.EVAL_CYBER_BASE_URL };
}

async function main() {
  const spec = process.env.EVAL_CYBER_MODEL;
  const apiKey = process.env.EVAL_CYBER_API_KEY;
  if (!spec || !apiKey) {
    console.error('Set EVAL_CYBER_MODEL (e.g. deepseek:deepseek-v4-flash) and EVAL_CYBER_API_KEY');
    process.exit(1);
  }
  const { model, baseUrl } = parseModel(spec);
  const provider = createOpenAI({ apiKey, baseURL: baseUrl });

  const aiCall: AICallFn = async (system, user) => {
    const r = await generateText({ model: provider(model), system, prompt: user });
    return r.text;
  };

  let passed = 0;
  for (const [i, c] of CASES.entries()) {
    const curriculumContext = buildCurriculumContext(c.courseId);
    const result = await generateSceneOutlinesFromRequirements(
      { requirement: `为《${c.courseId}》课程的「${c.topic}」生成一节互动课堂`, subjectProfile: 'cybersecurity', courseId: c.courseId },
      undefined,
      undefined,
      aiCall,
      { subjectProfile: true, curriculumContext },
    );
    if (!result.success || !result.data) {
      console.log(`[${i + 1}] ${c.courseId}·${c.topic} → FAIL (generation error: ${result.error})`);
      continue;
    }
    const outlines = result.data.outlines;
    const haystack = outlines
      .map((o) => `${o.title} ${o.description} ${(o.keyPoints || []).join(' ')}`)
      .join(' ');
    const hits = c.expectedKeywords.filter((k) => haystack.includes(k));
    const types = new Set(outlines.map((o) => o.type));
    const nonSlide = [...types].filter((t) => t !== 'slide');
    const aligned = hits.length >= Math.ceil(c.expectedKeywords.length / 2);
    const diverse = nonSlide.length >= 1;
    const ok = aligned && diverse;
    if (ok) passed++;
    console.log(
      `[${i + 1}] ${c.courseId}·${c.topic} → ${ok ? 'PASS' : 'FAIL'}  ` +
        `keywords ${hits.length}/${c.expectedKeywords.length} (${hits.join(',')})  ` +
        `types=[${[...types].join(',')}]  scenes=${outlines.length}`,
    );
  }
  console.log(`\n${passed}/${CASES.length} cases passed`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
