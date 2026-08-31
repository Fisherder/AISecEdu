/**
 * Simplified prompt system type definitions
 */

/**
 * Prompt template identifier
 */
export type PromptId =
  | 'requirements-to-outlines'
  | 'interactive-outlines'
  | 'task-engine-outlines'
  | 'web-search-query-rewrite'
  | 'slide-content'
  | 'slide-plan'
  | 'quiz-content'
  | 'slide-actions'
  | 'quiz-actions'
  | 'interactive-actions'
  | 'simulation-content'
  | 'simulation-config'
  | 'simulation-scenario'
  | 'diagram-content'
  | 'diagram-config'
  | 'code-content'
  | 'code-config'
  | 'vulnerable-lab-content'
  | 'scenario-design'
  | 'game-content'
  | 'game-config'
  | 'visualization3d-content'
  | 'visualization3d-config'
  | 'procedural-skill-content'
  | 'procedural-skill-config'
  | 'pbl-actions'
  | 'agent-system'
  | 'agent-system-wb-teacher'
  | 'agent-system-wb-assistant'
  | 'agent-system-wb-student'
  | 'director'
  | 'pbl-design';

/**
 * Snippet identifier
 */
export type SnippetId =
  | 'json-output-rules'
  | 'element-types'
  | 'action-types'
  | 'image-instructions'
  | 'video-instructions'
  | 'media-safety-guidelines'
  | 'slide-image-instructions'
  | 'slide-generated-image-instructions'
  | 'slide-video-instructions'
  | 'speech-guidelines'
  | 'whiteboard-reference'
  | 'security-pedagogy'
  | 'security-examples'
  | 'security-code-policy';

/**
 * Loaded prompt template
 */
export interface LoadedPrompt {
  id: PromptId;
  systemPrompt: string;
  userPromptTemplate: string;
}
