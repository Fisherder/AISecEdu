/** Security Teaching Module — REST API: validate content. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  auditLabSolvability,
  ensureLabSolvability,
  validateSecurityContent,
} from '@/lib/security/module';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { html } = body;

  if (!html || typeof html !== 'string') {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: html');
  }

  const solvabilityResult =
    body.repair === true ? ensureLabSolvability(html) : { html, report: auditLabSolvability(html) };
  const report = await validateSecurityContent(solvabilityResult.html);
  return apiSuccess({
    report,
    solvability: solvabilityResult.report,
    html: solvabilityResult.html,
    repaired: solvabilityResult.report.autoRepaired,
  });
}
