/**
 * 玄甲 global-agent internal teaching tools — MCP Server (stdio).
 *
 * Unified MCP interface for the cybersecurity teaching system.
 * Tools cover the full pipeline: generate → validate → query → search.
 *
 * This is an internal capability adapter, not a standalone product, identity,
 * course store, or teacher-facing agent entry point. The supported teacher
 * entry remains `/teacher`; production starts capabilities through the root
 * 玄甲 stack.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'fs';

import {
  generateSingleArtifact,
  buildLessonAiCall,
  matchSecurityKnowledge,
  extractCveIds,
  buildSecurityKnowledgeContext,
  validateSecurityContent,
  matchTemplate,
  buildTemplateContext,
  type LessonArtifactType,
} from '@/lib/security/module';
import { designScenarios } from '@/lib/security/scenario-designer';

// --- load .env.local ---
try {
  for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  /* no .env.local */
}

if (process.env.MAIC_MCP_MODEL) process.env.DEFAULT_MODEL = process.env.MAIC_MCP_MODEL;

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const errText = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

/**
 * Keep MCP artifact tools usable when provider resolution is temporarily
 * unavailable.  The artifact pipeline treats a thrown model call as a
 * recoverable stage and emits a deterministic, validated teaching artifact.
 */
async function buildResilientLessonAiCall(
  quality: 'fast' | 'rich',
): Promise<Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall']> {
  try {
    return (await buildLessonAiCall(quality)).aiCall;
  } catch {
    return async () => {
      throw new Error('MCP lesson model unavailable; use deterministic artifact fallback');
    };
  }
}

const ARTIFACT_TYPES: LessonArtifactType[] = [
  'slide',
  'diagram',
  'simulation',
  'code',
  'procedural-skill',
  'quiz',
  'game',
  'visualization3d',
  'vulnerable-lab',
  'debate',
];

const server = new McpServer({ name: 'aisecedu-global-agent-tools', version: '1.0.0' });

// ── 0. design_scenarios ─────────────────────────────────────────────────
server.tool(
  'design_scenarios',
  'Design 2-3 concrete, hands-on scenario proposals from a rough topic. The user picks one, then use its description to generate. Bridges vague requests ("SQL注入") to specific interactive labs ("登录绕过：看见SQL拼接过程").',
  {
    topic: z.string().describe('Rough security topic, e.g. "SQL注入" or "缓冲区溢出"'),
    description: z.string().optional().describe('Additional context or constraints'),
  },
  async (args) => {
    try {
      const proposals = await designScenarios(args.topic, args.description);
      if (proposals.length === 0) return errText('Failed to design scenarios');
      const lines = [`Designed ${proposals.length} scenarios for "${args.topic}":\n`];
      proposals.forEach((p, i) => {
        lines.push(`【方案 ${i + 1}】${p.title} (${p.difficulty})`);
        lines.push(`  摘要: ${p.summary}`);
        lines.push(`  场景: ${p.scenario}`);
        lines.push(`  交互: ${p.keyElements.join(', ')}`);
        lines.push(`  生成描述: ${p.description.slice(0, 120)}...`);
        lines.push('');
      });
      lines.push('用户选择一个方案后，用 generate_lab 工具传入该方案的 description 字段来生成。');
      return text(lines.join('\n'));
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── 1. generate_lab ──────────────────────────────────────────────────────
server.tool(
  'generate_lab',
  'Generate an interactive security lab (vulnerable-lab type). Returns self-contained HTML with hands-on exercises: payload input, flag capture, code patching, exploit path building. Rich mode (pro) produces the highest quality.',
  {
    title: z.string().describe('Lab title, e.g. "SQL Injection Login Bypass"'),
    description: z
      .string()
      .describe('Detailed lab scenario description — be specific about what the student should DO'),
    quality: z
      .enum(['fast', 'rich'])
      .default('rich')
      .describe('fast=flash template (quick), rich=pro bespoke (best quality)'),
  },
  async (args) => {
    try {
      const aiCall = await buildResilientLessonAiCall(args.quality);
      const artifact = await generateSingleArtifact(
        { type: 'vulnerable-lab', title: args.title, description: args.description },
        1,
        aiCall,
        { subjectProfile: true, useWorkflow: false },
      );
      if (!artifact) return errText('Generation failed');
      const c = artifact.content as unknown as Record<string, unknown>;
      const html = typeof c.html === 'string' ? c.html : '';
      const validation = artifact.validation;
      const valSummary = validation
        ? `\n\n--- Validation: ${validation.passed ? '✅ PASSED' : '❌ ISSUES'} (${validation.issues.length} checks, ${validation.stats.cvesChecked} CVEs verified) ---`
        : '';
      return text(
        `[${artifact.title}] ${html.length} bytes HTML${valSummary}\n\n${html.slice(0, 2000)}${html.length > 2000 ? '\n...(truncated, full HTML generated)' : ''}`,
      );
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── 2. generate_slide ───────────────────────────────────────────────────
server.tool(
  'generate_slide',
  'Generate a security teaching slide (title + bullets). Fast mode for quick drafts.',
  {
    title: z.string(),
    keyPoints: z.array(z.string()).describe('3-5 key points'),
    description: z.string().optional(),
    quality: z.enum(['fast', 'rich']).default('fast'),
  },
  async (args) => {
    try {
      const aiCall = await buildResilientLessonAiCall(args.quality);
      const artifact = await generateSingleArtifact(
        {
          type: 'slide',
          title: args.title,
          keyPoints: args.keyPoints,
          description: args.description,
        },
        1,
        aiCall,
        { subjectProfile: true, useWorkflow: args.quality === 'fast' },
      );
      if (!artifact) return errText('Generation failed');
      return text(`Slide generated: ${artifact.title}`);
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── 3. generate_quiz ────────────────────────────────────────────────────
server.tool(
  'generate_quiz',
  'Generate a security knowledge quiz (3 questions).',
  {
    title: z.string(),
    description: z.string().optional(),
  },
  async (args) => {
    try {
      const aiCall = await buildResilientLessonAiCall('fast');
      const artifact = await generateSingleArtifact(
        { type: 'quiz', title: args.title, description: args.description },
        1,
        aiCall,
        { subjectProfile: true, useWorkflow: true },
      );
      if (!artifact) return errText('Generation failed');
      return text(`Quiz generated: ${artifact.title}`);
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── 4. query_knowledge ──────────────────────────────────────────────────
server.tool(
  'query_knowledge',
  'Query the security knowledge base (OWASP/CWE/CVE/ATT&CK/regulations/tools/crypto/protocols). Returns matched entries with descriptions. Also detects CVE IDs and fetches from NVD.',
  {
    topic: z
      .string()
      .describe('Security topic to look up, e.g. "SQL injection" or "CVE-2021-44228"'),
  },
  async (args) => {
    const local = matchSecurityKnowledge(args.topic);
    const cveIds = extractCveIds(args.topic);
    const full = await buildSecurityKnowledgeContext(args.topic);
    return text(
      full ||
        local ||
        `No knowledge base match for "${args.topic}". CVE IDs detected: ${cveIds.length || 'none'}`,
    );
  },
);

// ── 5. validate_content ─────────────────────────────────────────────────
server.tool(
  'validate_content',
  'Validate generated security HTML content. Checks CVE/CWE/CVSS accuracy, flags misleading terms (MD5 for passwords, ECB mode as secure, etc.).',
  {
    html: z.string().describe('The HTML content to validate'),
  },
  async (args) => {
    const report = await validateSecurityContent(args.html);
    const lines = [
      `Validation: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`,
      `Stats: ${report.stats.cvesChecked} CVEs checked, ${report.stats.cwesChecked} CWEs checked, ${report.stats.cvssChecked} CVSS verified`,
    ];
    for (const issue of report.issues) {
      lines.push(`  [${issue.severity}] ${issue.type}: ${issue.message}`);
    }
    return text(lines.join('\n'));
  },
);

// ── 6. list_templates ───────────────────────────────────────────────────
server.tool(
  'list_templates',
  'List available security teaching templates (10 curated high-quality examples). Optionally match a topic to find the best template.',
  {
    topic: z.string().optional().describe('If provided, returns the best matching template'),
  },
  async (args) => {
    const index = JSON.parse(readFileSync('lib/security/template-index.json', 'utf-8'));
    const lines = ['Available templates:'];
    for (const t of index) {
      lines.push(`  ${t.id} (${t.category}): ${t.title}`);
    }
    if (args.topic) {
      const match = matchTemplate(args.topic);
      if (match) {
        lines.push(`\nBest match for "${args.topic}": ${match.templateId} — ${match.title}`);
        lines.push(`Style hints: ${match.styleHints}`);
      } else {
        lines.push(`\nNo template match for "${args.topic}".`);
      }
    }
    return text(lines.join('\n'));
  },
);

// ── 7. search_security ──────────────────────────────────────────────────
server.tool(
  'search_security',
  'Search the web for latest security news, CVEs, and threat intelligence. Uses Tavily API.',
  {
    query: z.string().describe('Search query, e.g. "latest zero-day 2025"'),
  },
  async (args) => {
    const { searchSecurityContext } = await import('@/lib/security/web-search');
    const result = await searchSecurityContext(args.query);
    if (!result) return text('Search unavailable (TAVILY_API_KEY not set or search failed)');
    const lines = [
      `Search: ${result.query}`,
      result.answer ? `Answer: ${result.answer}` : '',
      'Sources:',
    ];
    for (const s of result.sources) lines.push(`  - ${s.title}: ${s.url}`);
    return text(lines.filter(Boolean).join('\n'));
  },
);

// ── 8. create_debate ─────────────────────────────────────────────────────
server.tool(
  'create_debate',
  'Create a multi-agent debate classroom on a security compliance/ethics topic. AI agents with opposing stances (lawyer/white-hat/corporate counsel) debate; students can interject. Returns a classroom URL.',
  {
    topic: z.string().describe('Debate topic, e.g. "白帽子未授权测试企业系统并公开漏洞是否合法"'),
    description: z.string().optional(),
  },
  async (args) => {
    try {
      const { generateClassroom } = await import('@/lib/server/classroom-generation');
      const result = await generateClassroom(
        {
          requirement: `发起一场安全辩论。话题：${args.topic}。${args.description || '请从法律、技术、企业风险等多角度展开激烈讨论，学生可以随时插话。'}`,
          subjectProfile: 'cybersecurity',
          debate: true,
          agentMode: 'default',
        },
        { baseUrl: process.env.MAIC_BASE_URL ?? 'http://localhost:3001' },
      );
      return text(`辩论课堂已创建: ${result.url}\n场景数: ${result.scenesCount}`);
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── 9. create_roleplay ──────────────────────────────────────────────────
server.tool(
  'create_roleplay',
  'Create a multi-agent role-play scenario with CUSTOM personas. Each agent has a name, role (teacher/student), and detailed persona. Student interacts with conflicting AI characters. Returns a classroom URL.',
  {
    topic: z.string().describe('Scenario topic, e.g. "佛罗里达水厂投毒事件应急响应"'),
    description: z.string().optional().describe('Additional scenario context'),
    agents: z
      .array(
        z.object({
          name: z.string().describe('Agent display name, e.g. "AI 厂长"'),
          role: z
            .enum(['teacher', 'student'])
            .describe('teacher=moderator/leader, student=participant'),
          persona: z
            .string()
            .describe('Detailed personality/stance, e.g. "你是水务厂厂长，绝对不能停机停水"'),
        }),
      )
      .min(2)
      .describe('2-5 custom agent personas with conflicting viewpoints'),
  },
  async (args) => {
    try {
      const { generateClassroom } = await import('@/lib/server/classroom-generation');
      const palette = ['#3b82f6', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6'];
      const avatars = [
        '/avatars/teacher.png',
        '/avatars/assist.png',
        '/avatars/curious.png',
        '/avatars/thinker.png',
        '/avatars/clown.png',
      ];
      const configs = args.agents.map((a, i) => ({
        id: `custom-${i}`,
        name: a.name,
        role: a.role,
        persona: a.persona,
        avatar: avatars[i % avatars.length],
        color: palette[i % palette.length],
        priority: a.role === 'teacher' ? 10 : 5,
      }));
      const result = await generateClassroom(
        {
          requirement: `角色扮演情景模拟。场景：${args.topic}。${args.description || '学生作为决策者与多个 AI 角色互动，每个角色有不同立场和压力。'}`,
          subjectProfile: 'cybersecurity',
          agentMode: 'generate',
          generatedAgentConfigs: configs,
        },
        { baseUrl: process.env.MAIC_BASE_URL ?? 'http://localhost:3001' },
      );
      return text(
        `角色扮演课堂已创建: ${result.url}\nAgent 数: ${args.agents.length}\n场景数: ${result.scenesCount}`,
      );
    } catch (e) {
      return errText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
);

// ── Connect ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
server.connect(transport).then(() => console.error('[aisecedu-global-agent-tools-mcp] running'));
