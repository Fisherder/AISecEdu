import type { DebateIntent, DebateMove, DebateSide, DebateSpec, DebateTurn, DebateV2Spec } from './schema';

export const DEBATE_INTENTS: Record<DebateIntent, string> = {
  respond: '提出观点', 'follow-up': '继续追问', challenge: '质询论据', evidence: '补充证据',
  listen: '先听角色交锋', advance: '进入下一环节',
};

export function phaseIndex(spec: DebateSpec, turns: DebateTurn[]): number {
  if (spec.schema === 'debate-v1') return Math.min(turns.length, spec.rounds.length);
  if (!turns.length) return 0;
  const last = turns.at(-1)!;
  const round = Math.min(last.round, spec.rounds.length - 1);
  if (turns.length >= spec.rules.maxExchanges) return spec.rounds.length;
  const count = turns.filter(turn => turn.round === round).length;
  const advance = last.intent === 'advance' ||
    (last.intent !== 'follow-up' && count >= spec.rounds[round].exchanges);
  return advance ? round + 1 : round;
}

export function argumentLedger(turns: DebateTurn[]): DebateMove[] {
  return turns.flatMap(turn => turn.reply.moves || []);
}

export function selectSpeakers(spec: DebateV2Spec, side: DebateSide, turns: DebateTurn[],
  intent: DebateIntent, targetSpeakerId?: string) {
  if (targetSpeakerId) {
    const role = spec.roles.find(item => item.id === targetSpeakerId);
    if (!role) throw Error('指定的辩论角色不存在');
    return [role];
  }
  const index = phaseIndex(spec, turns);
  const scheduled = spec.rounds[index]?.speakers || [];
  let pool = scheduled.length ? spec.roles.filter(role => scheduled.includes(role.id)) : spec.roles;
  if (['dialogue', 'socratic'].includes(spec.format.kind) && side !== 'neutral') {
    const opponents = pool.filter(role => role.side !== side);
    if (opponents.length) pool = opponents;
  }
  if (intent === 'listen' && pool.length < 2) pool = [...pool, ...spec.roles.filter(role => !pool.some(selected => selected.id === role.id))];
  const lastSpoke = (id: string) => turns.findLastIndex(turn => turn.reply.voices?.some(voice => voice.speakerId === id));
  pool = [...pool].sort((a, b) => lastSpoke(a.id) - lastSpoke(b.id));
  const count = intent === 'listen' || ['roundtable', 'hearing', 'negotiation', 'oxford'].includes(spec.format.kind) ? 2 : 1;
  return pool.slice(0, count);
}

export function dialogueContext(turns: DebateTurn[], complete = false) {
  const recentStart = complete ? 0 : Math.max(0, turns.length - 6);
  return turns.map((turn, index) => index >= recentStart ? turn : {
    id: turn.id, round: turn.round, intent: turn.intent,
    student: turn.reply.memory?.studentClaim || turn.student,
    unresolved: turn.reply.memory?.unresolved || turn.reply.question,
    moves: turn.reply.moves || [], compacted: true,
  });
}

export function upgradeDebate(spec: DebateSpec): DebateV2Spec {
  if (spec.schema === 'debate-v2') return structuredClone(spec);
  return {...structuredClone(spec), schema: 'debate-v2',
    format: {kind: 'dialogue', label: '双人辩论', description: '学生提出观点，AI针对论据展开追问与反驳。'},
    rules: {durationMinutes: spec.rounds.length * 4, maxExchanges: Math.max(12, spec.rounds.length * 3),
      responseChars: 300, style: '自然、具体、尊重对方，承认有效论据并追问关键前提。',
      allowFollowUps: true, allowEarlyFinish: true, coaching: 'on-demand'},
    roles: [
      {id: 'pro-speaker', name: '支持方代表', identity: '支持立场的讨论参与者', side: 'pro',
        stance: spec.positions.pro, voice: '从支持立场的利益与证据出发，愿意作有条件的让步。', opening: spec.positions.pro},
      {id: 'con-speaker', name: '反对方代表', identity: '反对立场的讨论参与者', side: 'con',
        stance: spec.positions.con, voice: '检验前提和代价，提出具体替代方案，不为反对而反对。', opening: spec.positions.con},
    ],
    rounds: spec.rounds.map((round, index) => ({...round, exchanges: 1, speakers: [], prompts: [],
      mode: index === 0 ? 'opening' : index === spec.rounds.length - 1 ? 'synthesis' : 'inquiry'})),
  };
}
