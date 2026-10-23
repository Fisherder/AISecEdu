import type { ProcessScene } from './schema';

type ArtifactRecord = Record<string, unknown>;

export function mergeProcessRevisionArtifact(
  current: ArtifactRecord,
  generated: ArtifactRecord,
  before: Pick<ProcessScene, 'title' | 'summary'>,
  after: Pick<ProcessScene, 'title' | 'summary'>,
): ArtifactRecord {
  const merged: ArtifactRecord = {...current, content: generated.content};
  const outline = current.outline;
  if (outline && typeof outline === 'object' && !Array.isArray(outline)) {
    if (after.title !== before.title || after.summary !== before.summary) {
      merged.outline = {
        ...outline,
        ...(after.title !== before.title ? {title: after.title} : {}),
        ...(after.summary !== before.summary ? {description: after.summary} : {}),
      };
    }
  }
  if (after.title !== before.title) merged.title = after.title;
  return merged;
}
