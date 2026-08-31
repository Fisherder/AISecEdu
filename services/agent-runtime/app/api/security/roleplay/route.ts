/**
 * Security Teaching Module — REST API: multi-agent role-play / debate.
 *
 * Uses the async job system (same as /api/generate-classroom):
 * POST → 202 { jobId, pollUrl } → client polls until succeeded.
 */
import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import type { GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { after } from 'next/server';

type Mode = 'debate' | 'roleplay';

interface CustomAgent {
  name: string;
  role: 'teacher' | 'student';
  persona: string;
  priority?: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { mode, topic, description, customAgents, courseId } = body;

  if (!topic) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: topic');
  }

  const m: Mode = mode === 'roleplay' ? 'roleplay' : 'debate';

  // Build the GenerateClassroomInput
  const requirement =
    m === 'debate'
      ? `发起一场安全辩论。话题：${topic}。${description || '请从法律、技术、企业风险等多角度展开激烈讨论，学生可以随时插话发表观点。'}`
      : `角色扮演情景模拟。场景：${topic}。${description || '学生作为决策者与多个 AI 角色互动，每个角色有不同立场和压力，需要在技术与非技术的复合挑战中做出决策。'}`;

  const input: GenerateClassroomInput = {
    requirement,
    agentMode: 'default',
    ...(courseId ? { subjectProfile: 'cybersecurity' as const, courseId } : {}),
    ...(m === 'debate' ? { debate: true } : {}),
  };

  // Add custom agents for roleplay mode
  if (m === 'roleplay' && Array.isArray(customAgents) && customAgents.length >= 2) {
    const palette = ['#3b82f6', '#10b981', '#ec4899', '#f59e0b', '#8b5cf6'];
    const avatars = ['/avatars/teacher.png', '/avatars/assist.png', '/avatars/curious.png', '/avatars/thinker.png', '/avatars/clown.png'];
    input.agentMode = 'generate';
    input.generatedAgentConfigs = customAgents.map((a: CustomAgent, i: number) => ({
      id: `custom-${i}`,
      name: a.name,
      role: a.role,
      persona: a.persona,
      avatar: avatars[i % avatars.length],
      color: palette[i % palette.length],
      priority: a.priority ?? (a.role === 'teacher' ? 10 : 5),
    }));
  }

  // Use the async job system (non-blocking)
  const baseUrl = buildRequestOrigin(req);
  const jobId = nanoid(10);
  const job = await createClassroomGenerationJob(jobId, input);

  after(() => runClassroomGenerationJob(jobId, input, baseUrl));

  return apiSuccess(
    {
      jobId,
      status: job.status,
      step: job.step,
      message: job.message,
      mode: m,
      pollUrl: `${baseUrl}/api/generate-classroom/${jobId}`,
      pollIntervalMs: 5000,
    },
    202,
  );
}
