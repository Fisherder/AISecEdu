type Failure = {
  failureCategory: 'service' | 'quality' | 'permanent' | 'internal';
  errorCode: string;
  error: string;
  retryAfterSeconds?: number;
};

/** Send scheduling facts, never SDK request bodies, credentials or generated drafts. */
export function generationFailure(error: unknown): Failure {
  const chain: Record<string, unknown>[] = [];
  let value = error;
  for (let i = 0; i < 5 && value && typeof value === 'object'; i++) {
    const item = value as Record<string, unknown>;
    if (chain.includes(item)) break;
    chain.push(item);
    value = item.lastError || item.cause;
  }
  const codes = chain.map(item => String(item.code || ''));
  const names = chain.map(item => String(item.name || ''));
  const message = chain.map(item => String(item.message || '')).join(' ');
  const status = chain.map(item => Number(item.statusCode || item.status)).find(Number.isFinite);
  if (names.includes('SkillCatalogUnavailableError'))
    return { failureCategory: 'service', errorCode: 'SKILL_CATALOG_UNAVAILABLE',
      error: '技能目录暂时不可用，任务已保存并会在服务恢复后重试。', retryAfterSeconds: 30 };
  if ([401, 402, 403].includes(status || 0))
    return { failureCategory: 'permanent', errorCode: 'MODEL_CONFIGURATION_REQUIRED', error: '模型服务的账号、额度或权限需要检查；已保留任务。' };
  if (status === 429 || (status !== undefined && status >= 500) ||
      codes.some(code => /^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT)$/.test(code)) ||
      names.some(name => ['TimeoutError', 'CinematicInspectorUnavailableError', 'CoursewareInspectorUnavailableError', 'ModelCapacityError'].includes(name)) ||
      chain.some(item => item.name === 'CinematicExecutionError' && ['deadline', 'model-timeout', 'disconnected'].includes(String(item.reason))) ||
      /fetch failed|socket hang up|timed out|request timeout|service unavailable/i.test(message)) {
    return { failureCategory: 'service', errorCode: status === 429 ? 'MODEL_RATE_LIMITED' : 'GENERATION_TEMPORARILY_UNAVAILABLE',
      error: '生成服务暂时未响应，已保存可恢复的步骤，系统会等待后继续。', retryAfterSeconds: status === 429 ? 120 : 30 };
  }
  if (names.some(name => ['ProcessValidationError', 'SimulationOptionQualityError', 'CinematicQualityError', 'CinematicLearnerCopyError', 'CinematicLearnerSceneRepairRequired', 'GenerationStageError', 'VisualIntentResolutionError', 'ZodError', 'AI_NoObjectGeneratedError', 'SyntaxError'].includes(name)) ||
      /校验后仍|审校后仍|审查后仍|轮生成后仍|未通过|remained truncated|no output generated|validation failed|quality gate failed|invalid integration result|invalid.*json|missing candidates|applicable edit/i.test(message)) {
    return { failureCategory: 'quality', errorCode: 'GENERATION_REPAIR_REQUIRED', error: '本轮内容未通过结构、交互或教学检查，需要继续定向修复；尚未发布为完成作品。' };
  }
  return { failureCategory: 'internal', errorCode: 'EXECUTION_FAILED', error: '生成流程发生内部错误，已保留任务和诊断记录。' };
}
