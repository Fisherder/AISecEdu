/**
 * Agent Registry Store
 * Manages configurable AI agents using Zustand with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getActionsForRole, SLIDE_ACTIONS, WHITEBOARD_ACTIONS, type AgentConfig } from './types';
import { DEFAULT_AGENTS } from './defaults';
import { isKnownTTSProviderId } from '@/lib/audio/constants';
import type { GeneratedAgentConfig } from '@/lib/types/stage';
import { USER_AVATAR } from '@/lib/types/roundtable';
import type { Participant, ParticipantRole } from '@/lib/types/roundtable';
import { useUserProfileStore } from '@/lib/store/user-profile';
import type { AgentInfo } from '@/lib/generation/pipeline-types';

interface AgentRegistryState {
  agents: Record<string, AgentConfig>; // Map of agentId -> config

  // Actions
  addAgent: (agent: AgentConfig) => void;
  updateAgent: (id: string, updates: Partial<AgentConfig>) => void;
  deleteAgent: (id: string) => void;
  getAgent: (id: string) => AgentConfig | undefined;
  listAgents: () => AgentConfig[];
}

/**
 * Return the built-in default agents as lightweight AgentInfo objects
 * suitable for the generation pipeline (no UI-only fields like avatar/color).
 */
export function getDefaultAgents(): AgentInfo[] {
  return Object.values(DEFAULT_AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    persona: a.persona,
  }));
}

// Security-profile default agents — cybersecurity teaching roster.
// Activated via getSecurityDefaultAgents() when subjectProfile === 'cybersecurity'.
const SECURITY_DEFAULT_AGENTS: Record<string, AgentConfig> = {
  'sec-teacher': {
    id: 'sec-teacher',
    name: '安全教授',
    role: 'teacher',
    persona: `You are the security professor leading this cybersecurity class. You teach with rigor, grounding every concept in an explicit threat model.

Your teaching style:
- For each topic, walk the arc: concept → threat model → principle → defense → ethics/law.
- Use precise terminology; never conflate vulnerability classes (e.g., XSS vs CSRF, stack vs heap overflow).
- Demonstrate on the whiteboard: attack trees, protocol flows, network topologies.
- Whenever you show an attack, immediately pair it with detection or mitigation, and state the authorization/legal boundary.
- Keep tool and protocol names in their standard form (nmap, TLS, AES, ROP).

Tone: Authoritative, precise, calm. You treat security as both engineering and responsibility. Never announce your actions; just teach.`,
    avatar: '/avatars/teacher.png',
    color: '#3b82f6',
    allowedActions: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
    priority: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'sec-red': {
    id: 'sec-red',
    name: '红队同学',
    role: 'student',
    persona: `You are the red-team thinker of the class. You instinctively ask "how could this be attacked?" and probe for weaknesses.

Your style:
- You reason about attacker capabilities and goals, and surface assumptions that favor the defender.
- You propose concrete (educational) attack ideas — always abstract enough to stay responsible.
- You notice where a system trusts input it shouldn't, or where crypto is misused.
- When the class gets complacent, you remind them "the attacker only needs to find one flaw."

Tone: Sharp, skeptical, scenario-driven. Keep responses SHORT — one probing point or a quick attack-scenario question.`,
    avatar: '/avatars/curious.png',
    color: '#ec4892',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'sec-blue': {
    id: 'sec-blue',
    name: '蓝队同学',
    role: 'student',
    persona: `You are the blue-team thinker of the class. You reflexively ask "how do we detect, contain, and recover from this?"

Your style:
- For every attack discussed, you name the defensive control: prevention, detection, or response.
- You think in layers (defense-in-depth) and ask about logging, monitoring, and fail-safe defaults.
- You connect topics to incident response: how would we see this happening, and what would we do?
- You care about patching, hardening, and least privilege.

Tone: Steady, practical, systems-minded. Keep responses SHORT — one concrete mitigation or detection idea.`,
    avatar: '/avatars/assist.png',
    color: '#10b981',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'sec-novice': {
    id: 'sec-novice',
    name: '小白同学',
    role: 'student',
    persona: `You are a beginner student who is new to security. Your honest confusion helps the whole class.

Your style:
- You ask the "dumb" questions that aren't dumb — clarifying definitions and assumptions others skip.
- You admit when jargon loses you ("wait, what's the difference between a hash and a MAC again?").
- You connect new ideas to everyday experience (passwords, Wi-Fi, app permissions).
- Your questions prompt the professor to re-explain at a clearer level.

Tone: Curious, humble, relatable. Keep questions SHORT and direct.`,
    avatar: '/avatars/note-taker.png',
    color: '#f59e0b',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'sec-researcher': {
    id: 'sec-researcher',
    name: '安全研究员同学',
    role: 'student',
    persona: `You are the security researcher of the class — the one who goes deeper than the syllabus requires.

Your style:
- You connect today's topic to underlying math, standards, or recent CVEs/research.
- You ask "why is it designed this way?" and explore trade-offs (performance vs security, usability vs safety).
- You notice edge cases, downgrade attacks, and compositional risks.
- You occasionally pull the discussion toward advanced or forward-looking topics (post-quantum, supply chain).

Tone: Analytical, well-read, slightly ahead of the class. Keep contributions focused — one substantive observation, not a lecture.`,
    avatar: '/avatars/thinker.png',
    color: '#8b5cf6',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
};

/**
 * Return the cybersecurity subject-profile agents as lightweight AgentInfo
 * objects for the generation pipeline. Used when subjectProfile === 'cybersecurity'
 * and the operator has not opted into LLM-generated agents. Sorted by priority
 * desc so the teacher is queued first.
 */
export function getSecurityDefaultAgents(): AgentInfo[] {
  return Object.values(SECURITY_DEFAULT_AGENTS)
    .sort((a, b) => b.priority - a.priority)
    .map((a) => ({ id: a.id, name: a.name, role: a.role, persona: a.persona }));
}

// Debate-profile agents — adversarial roundtable personas for compliance/ethics debates.
const DEBATE_AGENTS: Record<string, AgentConfig> = {
  'debate-moderator': {
    id: 'debate-moderator',
    name: '辩论主持人',
    role: 'teacher',
    persona: `You are the moderator of a cybersecurity ethics/legal debate. You are neutral and fair.

Your role:
- Introduce the debate topic and the key points of tension.
- Call on each debater to present their argument.
- Probe weaknesses in every position ("but what about...?").
- Summarize the key arguments at the end without taking a side.
- Ensure all voices are heard; cut off rambling.

Tone: Calm, authoritative, Socratic. You ask sharp follow-up questions. Keep it SHORT — one question or summary per turn.`,
    avatar: '/avatars/teacher.png',
    color: '#3b82f6',
    allowedActions: [...SLIDE_ACTIONS, ...WHITEBOARD_ACTIONS],
    priority: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'debate-lawyer': {
    id: 'debate-lawyer',
    name: 'AI 律师',
    role: 'student',
    persona: `You are a cybersecurity lawyer. You argue strictly from the law (《网络安全法》《数据安全法》etc.).

Your stance: the law is the law. Unauthorized testing is illegal regardless of intent. You cite specific legal provisions and penalties.

Your style: Precise, legalistic, you quote statutes. You challenge others' technical justifications with legal counterarguments. You acknowledge nuance but maintain that legality comes before ethics.

Tone: Formal, rigorous, slightly pedantic. Keep responses SHORT — one legal point per turn.`,
    avatar: '/avatars/thinker.png',
    color: '#8b5cf6',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'debate-whitehat': {
    id: 'debate-whitehat',
    name: 'AI 白帽子',
    role: 'student',
    persona: `You are a white-hat hacker. You argue from the practical security perspective.

Your stance: the public interest in security outweighs bureaucratic process. Responsible disclosure protects users. You argue that over-criminalizing security research harms everyone. You cite real cases (Heartbleed, Equifax).

Your style: Passionate, practical, scenario-driven. You challenge the lawyer's rigid legalism with "but in the real world..." arguments. You concede that authorization matters but argue the system is broken.

Tone: Energetic, blunt, slightly rebellious. Keep responses SHORT — one punchy argument per turn.`,
    avatar: '/avatars/curious.png',
    color: '#ec4899',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
  'debate-corporate': {
    id: 'debate-corporate',
    name: 'AI 企业法务',
    role: 'student',
    persona: `You are a corporate legal counsel. You argue from the enterprise risk perspective.

Your stance: companies have the right to control who tests their systems. Unauthorized testing — even well-intentioned — creates liability, panic, and competitive risk. You argue for coordinated disclosure and bug bounty programs.

Your style: Risk-averse, pragmatic, you focus on business consequences. You find common ground between the lawyer and the white-hat but lean toward process and control.

Tone: Cautious, diplomatic, business-minded. Keep responses SHORT — one risk/position per turn.`,
    avatar: '/avatars/assist.png',
    color: '#10b981',
    allowedActions: [...WHITEBOARD_ACTIONS],
    priority: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDefault: false,
  },
};

/** Return the debate-profile agents for cybersecurity ethics/legal roundtable debates. */
export function getDebateAgents(): AgentInfo[] {
  return Object.values(DEBATE_AGENTS)
    .sort((a, b) => b.priority - a.priority)
    .map((a) => ({ id: a.id, name: a.name, role: a.role, persona: a.persona }));
}

export const useAgentRegistry = create<AgentRegistryState>()(
  persist(
    (set, get) => ({
      agents: { ...DEFAULT_AGENTS },

      addAgent: (agent) =>
        set((state) => ({
          agents: { ...state.agents, [agent.id]: agent },
        })),

      updateAgent: (id, updates) =>
        set((state) => ({
          agents: {
            ...state.agents,
            [id]: { ...state.agents[id], ...updates, updatedAt: new Date() },
          },
        })),

      deleteAgent: (id) =>
        set((state) => {
          const { [id]: _removed, ...rest } = state.agents;
          return { agents: rest };
        }),

      getAgent: (id) => get().agents[id],

      listAgents: () => Object.values(get().agents),
    }),
    {
      name: 'agent-registry-storage',
      version: 11, // Bumped: add voiceOverrides field to AgentConfig
      migrate: (persistedState: unknown) => persistedState,
      // Generated agents are single-sourced on the stage document and rebuilt
      // from it on every classroom load — keep them out of the localStorage
      // snapshot entirely. The merge filter below stays as defense in depth
      // for snapshots written before this partialize existed.
      partialize: (state) => ({
        agents: Object.fromEntries(
          Object.entries(state.agents).filter(([, agent]) => !agent.isGenerated),
        ),
      }),
      // Merge persisted state with default agents
      // Default agents always use code-defined values (not cached)
      // Custom agents use persisted values
      merge: (persistedState: unknown, currentState) => {
        const persisted = persistedState as Record<string, unknown> | undefined;
        const persistedAgents = (persisted?.agents || {}) as Record<string, AgentConfig>;
        const mergedAgents: Record<string, AgentConfig> = { ...DEFAULT_AGENTS };

        // Only preserve non-default, non-generated (custom) agents from cache
        // Generated agents are loaded on-demand from IndexedDB per stage
        for (const [id, agent] of Object.entries(persistedAgents)) {
          const agentConfig = agent as AgentConfig;
          if (!id.startsWith('default-') && !agentConfig.isGenerated) {
            mergedAgents[id] = agentConfig;
          }
        }

        return {
          ...currentState,
          agents: mergedAgents,
        };
      },
    },
  ),
);

/**
 * Convert agents to roundtable participants
 * Maps agent roles to participant roles for the UI
 * @param t - i18n translation function for localized display names
 */
export function agentsToParticipants(
  agentIds: string[],
  t?: (key: string) => string,
): Participant[] {
  const registry = useAgentRegistry.getState();
  const participants: Participant[] = [];
  let hasTeacher = false;

  // Resolve agents and sort: teacher first (by role then priority desc)
  const resolved = agentIds
    .map((id) => registry.getAgent(id))
    .filter((a): a is AgentConfig => a != null);
  resolved.sort((a, b) => {
    if (a.role === 'teacher' && b.role !== 'teacher') return -1;
    if (a.role !== 'teacher' && b.role === 'teacher') return 1;
    return (b.priority ?? 0) - (a.priority ?? 0);
  });

  for (const agent of resolved) {
    // Map agent role to participant role:
    // The first agent with role "teacher" becomes the left-side teacher.
    // If no agent has role "teacher", the highest-priority agent becomes teacher.
    let role: ParticipantRole = 'student';
    if (!hasTeacher) {
      role = 'teacher';
      hasTeacher = true;
    }

    // Use i18n name for default agents, fall back to registry name
    const i18nName = t?.(`settings.agentNames.${agent.id}`);
    const displayName =
      i18nName && i18nName !== `settings.agentNames.${agent.id}` ? i18nName : agent.name;

    participants.push({
      id: agent.id,
      name: displayName,
      role,
      avatar: agent.avatar,
      isOnline: true,
      isSpeaking: false,
    });
  }

  // Always add user participant — use profile store when available
  const userProfile = useUserProfileStore.getState();
  const userName = userProfile.nickname || t?.('common.you') || 'You';
  const userAvatar = userProfile.avatar || USER_AVATAR;

  participants.push({
    id: 'user-1',
    name: userName,
    role: 'user',
    avatar: userAvatar,
    isOnline: true,
    isSpeaking: false,
  });

  return participants;
}

/**
 * Replace the registry's generated agents with the given stage roster.
 *
 * In-memory registry side effect: the persisted source of truth for the
 * roster is `stage.generatedAgentConfigs` on the stage document, and callers
 * persist it through the document path — the registry's own localStorage
 * snapshot excludes generated agents (see the persist `partialize` above), so
 * nothing written here becomes durable.
 * Clears previously loaded generated agents first (even when the new roster is
 * empty) so a prior classroom's roster cannot leak into the current one.
 * The contract keeps `voiceConfig.providerId` an open string; a binding whose
 * provider is not registered in this app is dropped here (the agent keeps its
 * voiceDesign, and the TTS path falls back at call time).
 * Returns the applied agent IDs.
 */
export function applyGeneratedAgentsToRegistry(
  stageId: string,
  agents: ReadonlyArray<GeneratedAgentConfig>,
): string[] {
  const registry = useAgentRegistry.getState();
  for (const agent of registry.listAgents()) {
    if (agent.isGenerated) registry.deleteAgent(agent.id);
  }

  const now = Date.now();
  const ids: string[] = [];
  for (const agent of agents) {
    const { voiceConfig, ...rest } = agent;
    registry.addAgent({
      ...rest,
      allowedActions: getActionsForRole(agent.role),
      isDefault: false,
      isGenerated: true,
      boundStageId: stageId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      ...(voiceConfig && isKnownTTSProviderId(voiceConfig.providerId)
        ? {
            voiceConfig: {
              providerId: voiceConfig.providerId,
              voiceId: voiceConfig.voiceId,
            },
          }
        : {}),
    });
    ids.push(agent.id);
  }

  // Eager warm-up: pre-register each generated agent's auto voice so the first
  // spoken line is already stable. Same idempotent ensure as the TTS path;
  // fire-and-forget. Dynamic import keeps this client-only dep out of the
  // server-importable store module.
  if (ids.length > 0 && typeof window !== 'undefined') {
    void import('@/lib/audio/agent-voice')
      .then((m) => m.warmUpAgentVoices(registry.listAgents().filter((a) => a.isGenerated)))
      .catch(() => undefined);
  }

  return ids;
}
