import { z } from 'zod';

export function sourceRequirements(request: Record<string, unknown>) {
  const teaching = request.teacherLearningRequest as {originalRequest?: unknown; feedback?: unknown} | undefined;
  const original = typeof teaching?.originalRequest === 'string' ? teaching.originalRequest :
    typeof request.originalRequest === 'string' ? request.originalRequest : String(request.description || request.title || '');
  const feedback = Array.isArray(teaching?.feedback) ? teaching.feedback.filter((item): item is string => typeof item === 'string') : [];
  const sources = [{source: 'original', text: original}, ...feedback.map((text, index) => ({source: 'feedback-' + index, text}))];
  const requirements = sources.flatMap(source => {
    const matches = [...source.text.matchAll(/[^，。；\n]*[，。；\n]+|[^，。；\n]+$/g)];
    const quota = Math.max(1, Math.min(48, Math.floor(480 / sources.length)));
    const batch = Math.max(1, Math.ceil(matches.length / quota));
    const pieces = [];
    for (let start = 0; start < matches.length; start += batch) {
      const last = matches[Math.min(start + batch, matches.length) - 1];
      const text = source.text.slice(matches[start].index, last.index! + last[0].length);
      if (text.trim()) pieces.push({source: source.source, text});
    }
    return pieces;
  });
  return requirements.map((item, index) => ({index, ...item}));
}

const checkSchema = z.array(z.object({index: z.number().int().nonnegative(), quote: z.string(),
  fulfilled: z.boolean(), evidence: z.string().min(1).max(1600)}).strict()).max(512);

export function validateSourceChecks(requirements: ReturnType<typeof sourceRequirements>, value: unknown) {
  const checks = checkSchema.parse(value);
  if (checks.length !== requirements.length || new Set(checks.map(check => check.index)).size !== requirements.length ||
      checks.some(check => requirements[check.index]?.text !== check.quote))
    throw Error('必须逐项核对全部sourceRequirements，index不重复且每条有证据；quote由服务端附回，不得遗漏或改写局部、数量、方向与先后限制');
  return checks;
}

export const SOURCE_FIDELITY_BRIEF = `sourceRequirements是程序从教师原文逐段保留的约束，不是模型总结。原文优先于director和frozenRequirements中的提取；反馈按顺序覆盖原先冲突要求，须在证据中说明。逐项核对对象、数量、局部/整体、运动方向、先后顺序、输入输出和控件，不能只核对大意。
局部改变要求未涉及的部分保持原状；局部特写镜头不等于局部动作，整个对象或全部零件一起分离不证明局部分离。模型说明、字幕和免责声明不能替代原文要求的真实行为。
语义审查额外输出sourceChecks:[{index,fulfilled,evidence}]，每一原文条目恰好一次；原文quote由服务端按index附回，不需重复输出。evidence引用实际节点/轨道/章节或运行时控件。缺少实际证据时fulfilled=false，不因已经生成或其他检查通过而放行。`;
