/**
 * Prompt System - Simplified prompt management
 *
 * Features:
 * - File-based prompt storage in templates/
 * - Snippet composition via {{snippet:name}} syntax
 * - Conditional blocks via {{#if flag}}...{{/if}} syntax
 * - Variable interpolation via {{variable}} syntax
 */

// Types
import type { PromptId } from './types';
export type { PromptId, SnippetId, LoadedPrompt } from './types';

// Loader functions
export {
  loadPrompt,
  loadSnippet,
  buildPrompt,
  interpolateVariables,
  processSnippets,
  processConditionalBlocks,
} from './loader';

// Prompt IDs constant
export const PROMPT_IDS = {
  REQUIREMENTS_TO_OUTLINES: 'requirements-to-outlines',
  INTERACTIVE_OUTLINES: 'interactive-outlines',
  TASK_ENGINE_OUTLINES: 'task-engine-outlines',
  WEB_SEARCH_QUERY_REWRITE: 'web-search-query-rewrite',
  SLIDE_CONTENT: 'slide-content',
  SLIDE_PLAN: 'slide-plan',
  QUIZ_CONTENT: 'quiz-content',
  SLIDE_ACTIONS: 'slide-actions',
  QUIZ_ACTIONS: 'quiz-actions',
  INTERACTIVE_ACTIONS: 'interactive-actions',
  SIMULATION_CONTENT: 'simulation-content',
  SIMULATION_CONFIG: 'simulation-config',
  SIMULATION_SCENARIO: 'simulation-scenario',
  DIAGRAM_CONTENT: 'diagram-content',
  DIAGRAM_CONFIG: 'diagram-config',
  CODE_CONTENT: 'code-content',
  CODE_CONFIG: 'code-config',
  VULNERABLE_LAB_CONTENT: 'vulnerable-lab-content',
  SCENARIO_DESIGN: 'scenario-design',
  GAME_CONTENT: 'game-content',
  GAME_CONFIG: 'game-config',
  VISUALIZATION3D_CONTENT: 'visualization3d-content',
  VISUALIZATION3D_CONFIG: 'visualization3d-config',
  PROCEDURAL_SKILL_CONTENT: 'procedural-skill-content',
  PROCEDURAL_SKILL_CONFIG: 'procedural-skill-config',
  PBL_ACTIONS: 'pbl-actions',
  AGENT_SYSTEM: 'agent-system',
  AGENT_SYSTEM_WB_TEACHER: 'agent-system-wb-teacher',
  AGENT_SYSTEM_WB_ASSISTANT: 'agent-system-wb-assistant',
  AGENT_SYSTEM_WB_STUDENT: 'agent-system-wb-student',
  DIRECTOR: 'director',
  PBL_DESIGN: 'pbl-design',
} as const satisfies Record<string, PromptId>;
