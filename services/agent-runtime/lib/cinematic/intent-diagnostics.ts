import { z } from 'zod';
import { CinematicJsonError } from './json';

export type VisualIntentFailurePhase = 'upstream' | 'json' | 'schema' | 'contract';
export type VisualIntentContractCode =
  | 'MISSING_2D_FORMAT'
  | 'INTERACTION_MAPPING_MISMATCH'
  | 'INVALID_PLAYER_CONTROLS'
  | 'CONTROLS_ON_TEACHING_REQUIREMENT';

export class VisualIntentContractError extends Error {
  constructor(
    public readonly code: VisualIntentContractCode,
    message: string,
  ) {
    super(message);
    this.name = 'VisualIntentContractError';
  }
}

type IntentIssue = {
  code: string;
  path: string;
  minimum?: number;
  maximum?: number;
};

export type VisualIntentAttemptFailure = {
  attempt: number;
  phase: VisualIntentFailurePhase;
  code: string;
  offset?: number;
  statusCode?: number;
  transportCode?: string;
  issues?: IntentIssue[];
  issueCount?: number;
  omittedIssueCount?: number;
};

const intentFields = new Set([
  'mode',
  'twoDimensionalFormat',
  'reason',
  'objects',
  'interactions',
  'interactionRequirements',
  'description',
  'kind',
  'controls',
  'visualPriorities',
]);
const jsonCodes = new Set([
  'INVALID_INPUT',
  'AMBIGUOUS_ENVELOPE',
  'TRUNCATED_STRING',
  'INVALID_STRING',
  'INVALID_TOKEN',
  'TOKEN_LIMIT',
  'INVALID_ROOT',
  'INCOMPLETE_STRUCTURE',
  'AMBIGUOUS_TOKEN_BOUNDARY',
  'DEPTH_LIMIT',
  'MISSING_VALUE',
  'DUPLICATE_KEY',
  'TRUNCATED_STRUCTURE',
  'MULTIPLE_JSON_CANDIDATES',
]);
const upstreamNames = new Set([
  'Error',
  'TypeError',
  'AbortError',
  'TimeoutError',
  'AI_APICallError',
  'AI_RetryError',
  'AI_NoOutputGeneratedError',
  'AI_InvalidResponseDataError',
]);
const schemaCodes = new Set([
  'invalid_type',
  'invalid_value',
  'invalid_literal',
  'invalid_union',
  'invalid_union_discriminator',
  'invalid_enum_value',
  'unrecognized_keys',
  'invalid_arguments',
  'invalid_return_type',
  'invalid_date',
  'invalid_string',
  'invalid_intersection_types',
  'not_multiple_of',
  'not_finite',
  'too_small',
  'too_big',
  'invalid_format',
  'invalid_key',
  'invalid_element',
  'custom',
]);
const transportCodes = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

// Only structural diagnostics leave this function. Never retain messages,
// response bodies, request text, credentials, arbitrary keys or error causes.
export function visualIntentAttemptFailure(
  error: unknown,
  phase: VisualIntentFailurePhase,
  attempt: number,
): VisualIntentAttemptFailure {
  const base = { attempt, phase, code: 'UNCLASSIFIED_ERROR' };
  if (phase === 'upstream') {
    let value = error;
    const result: VisualIntentAttemptFailure = { ...base };
    for (let depth = 0; depth < 3 && value && typeof value === 'object'; depth++) {
      const current = value as {
        name?: unknown;
        statusCode?: unknown;
        code?: unknown;
        cause?: unknown;
        lastError?: unknown;
      };
      if (depth === 0 && typeof current.name === 'string' && upstreamNames.has(current.name))
        result.code = current.name;
      if (
        Number.isInteger(current.statusCode) &&
        Number(current.statusCode) >= 100 &&
        Number(current.statusCode) <= 599
      )
        result.statusCode = Number(current.statusCode);
      if (typeof current.code === 'string' && transportCodes.has(current.code))
        result.transportCode = current.code;
      value = current.lastError || current.cause;
    }
    return result;
  }
  if (error instanceof CinematicJsonError)
    return {
      ...base,
      phase: 'json',
      code: jsonCodes.has(error.code) ? error.code : 'INVALID_JSON',
      ...(Number.isInteger(error.offset) && error.offset >= 0 ? { offset: error.offset } : {}),
    };
  if (error instanceof VisualIntentContractError)
    return { ...base, phase: 'contract', code: error.code };
  if (error instanceof z.ZodError) {
    const issues = error.issues.slice(0, 24).map((issue) => {
      const limit = issue as { minimum?: unknown; maximum?: unknown };
      return {
        code: schemaCodes.has(issue.code) ? issue.code : 'schema_error',
        path:
          issue.path
            .map((part) =>
              typeof part === 'number' && Number.isSafeInteger(part) && part >= 0
                ? String(part)
                : typeof part === 'string' && intentFields.has(part)
                  ? part
                  : '<field>',
            )
            .join('.') || '<root>',
        ...(typeof limit.minimum === 'number' && Number.isFinite(limit.minimum)
          ? { minimum: limit.minimum }
          : {}),
        ...(typeof limit.maximum === 'number' && Number.isFinite(limit.maximum)
          ? { maximum: limit.maximum }
          : {}),
      };
    });
    return {
      ...base,
      phase: 'schema',
      code: 'SCHEMA_INVALID',
      issues,
      issueCount: error.issues.length,
      omittedIssueCount: error.issues.length - issues.length,
    };
  }
  return base;
}

export class VisualIntentResolutionError extends Error {
  readonly diagnostics: {
    version: 'visual-intent-diagnostics-v1';
    attempts: VisualIntentAttemptFailure[];
  };
  constructor(attempts: VisualIntentAttemptFailure[]) {
    const last = attempts.at(-1);
    super(
      `尚不能可靠确定演示表达方式，未用普通页面替代三维要求；请重试生成。${last ? ` [${last.phase}:${last.code}]` : ''}`,
    );
    this.name = 'VisualIntentResolutionError';
    this.diagnostics = { version: 'visual-intent-diagnostics-v1', attempts };
  }
}
