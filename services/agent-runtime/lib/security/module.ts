/**
 * Security Teaching Module — unified API surface.
 *
 * Provides a clean interface for external systems (REST API, MCP, SDK)
 * to use the cybersecurity teaching capabilities:
 * - generate: create security artifacts (labs, slides, quizzes, etc.)
 * - knowledge: query the curated knowledge base (OWASP/CWE/CVE/ATT&CK)
 * - validate: post-generation accuracy checking
 * - templates: list/match proven high-quality templates
 * - search: real-time web search for latest security info
 */
export {
  generateSingleArtifact,
  buildLessonAiCall,
  buildOutlineForArtifact,
} from '@/lib/server/lesson-generation';
export type { SingleArtifactInput } from '@/lib/server/lesson-generation';
export { LESSON_ARTIFACT_TYPES as ARTIFACT_TYPES, isLessonArtifactType } from '@/lib/types/lesson';
export type { LessonArtifact, LessonArtifactType } from '@/lib/types/lesson';

export { matchSecurityKnowledge, extractCveIds } from './knowledge-loader';
export { fetchCveFromNvd, fetchCvesFromNvd } from './nvd-client';
export { searchSecurityContext } from './web-search';
export { buildSecurityKnowledgeContext } from './context-builder';
export { validateSecurityContent } from './validator';
export type { ValidationReport, ValidationIssue } from './validator';
export { auditLabSolvability, ensureLabSolvability } from './lab-solvability';
export type {
  LabSolvabilityIssue,
  LabSolvabilityIssueCode,
  LabSolvabilityReport,
  LabSolvabilityResult,
} from './lab-solvability';
export { matchTemplate, buildTemplateContext } from './template-matcher';
export { designScenarios } from './scenario-designer';
export type { ScenarioProposal } from './scenario-designer';

/** Knowledge base categories. */
export const KB_CATEGORIES = [
  'owasp',
  'cwe',
  'attack',
  'cves',
  'regulations',
  'tools',
  'crypto',
  'protocols',
] as const;
