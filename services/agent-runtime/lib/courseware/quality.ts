import type { LessonArtifact } from '@/lib/types/lesson';

/** Describe the delivered revision, never counts from a superseded pre-review draft. */
export function summarizeCoursewareArtifacts(artifacts: LessonArtifact[]) {
  const pages = artifacts.map(artifact => 'studio' in artifact.content ? artifact.content.studio?.page : undefined).filter(Boolean);
  return {
    pageCount: artifacts.length,
    visualPages: pages.length,
    chartPages: pages.filter(page => page!.visual.kind === 'chart').length,
    diagramPages: pages.filter(page => page!.visual.kind === 'diagram').length,
    nativeObjectCount: artifacts.reduce((count, artifact) => count + ('elements' in artifact.content ? artifact.content.elements.length : 0), 0),
    speakerNotePages: pages.filter(page => page!.speakerNotes.length >= 80).length,
    actionableChecks: pages.filter(page => page!.check).length,
    teachingBeats: pages.reduce((count, page) => count + page!.beats.length, 0),
    visualKinds: [...new Set(pages.map(page => page!.visual.kind))],
    compositions: [...new Set(pages.map(page => page!.composition))],
  };
}
