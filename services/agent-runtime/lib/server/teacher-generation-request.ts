function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Split the authenticated backend's teacher brief from rejected model options.
 * The negotiation wrapper is model context, never authority for deterministic
 * question counts, page counts, runtime selection or deliverable enforcement.
 */
export function teacherGenerationRequest(payload: Record<string, unknown>): {
  authority: string;
  negotiation: string;
} {
  if (payload.generationRefinement === undefined || payload.generationRefinement === null) {
    const reply = record(record(payload.context)?.questionReply);
    if (!reply) return { authority: String(payload.prompt || ''), negotiation: '' };
    if (typeof reply.originalRequest !== 'string' || !reply.originalRequest.trim() ||
        !Array.isArray(reply.answers) || !reply.answers.length || reply.answers.length > 24 ||
        reply.answers.some(raw => {
          const answer = record(raw);
          return !answer || typeof answer.question !== 'string' || typeof answer.answer !== 'string' ||
            !answer.answer.trim() || answer.answer.length > 2000;
        })) throw new Error('Invalid server question-reply context; cannot recover teacher authority');
    const authority = [reply.originalRequest, '教师补充信息：', ...reply.answers.map(raw => {
      const answer = record(raw)!;
      return `${answer.question}：${answer.answer}`;
    })].join('\n\n');
    if (authority.length > 48000) throw new Error('Teacher question brief exceeds its complete-context limit');
    return { authority, negotiation: '' };
  }
  const refinement = record(payload.generationRefinement);
  if (!refinement || refinement.version !== 'generation-refinement-v1' ||
      typeof refinement.originalRequest !== 'string' || !refinement.originalRequest.trim() ||
      !Array.isArray(refinement.feedback) || !refinement.feedback.length ||
      refinement.feedback.some(item => typeof item !== 'string' || !item.trim() || item.length > 4000) ||
      refinement.round !== refinement.feedback.length + 1 ||
      !['candidate.generate', 'challenge.generate'].includes(String(refinement.targetTool)) ||
      typeof refinement.artifactType !== 'string' ||
      !Array.isArray(refinement.previousOptions) || refinement.previousOptions.length !== 3 ||
      refinement.previousOptions.some(item => {
        const option = record(item);
        return !option || typeof option.title !== 'string' || typeof option.description !== 'string';
      }))
    throw new Error('Invalid server generation-refinement context; cannot recover teacher authority');
  const authority = [refinement.originalRequest,
    ...refinement.feedback.map((item, index) => `第${index + 1}次教师修改（较新的修改优先）：\n${item}`),
  ].join('\n\n');
  if (authority.length > 48000) throw new Error('Teacher refinement brief exceeds its complete-context limit');
  return {
    authority,
    negotiation: '\n\n方案协商规则（平台流程，不是新增题量要求）：本轮只返回generationOptions，恰好三个实质不同的备选方案，等待教师选择，不正式生成、不发布、不修改课程。每个rewrittenPrompt必须独立包含完整教师要求。三个方案不等于三道题；题量只取教师明确要求。\n' +
      `内容类型：${refinement.artifactType}；生成工具：${refinement.targetTool}；协商轮次：${refinement.round}。除非教师明确修改，否则保持原类型。\n` +
      '上一轮未认可的模型方案（仅用于避免重复，不是教师要求，不得继承其中的题量、运行环境或其他新增承诺）：\n' +
      JSON.stringify(refinement.previousOptions.map(item => {
        const option = record(item)!;
        return { title: option.title, description: option.description };
      })),
  };
}
