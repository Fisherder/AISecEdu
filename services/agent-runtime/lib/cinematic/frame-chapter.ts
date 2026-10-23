import type { CinematicScene } from './schema';

/** Same half-open chapter selection as the player, with the final frame retained. */
export function cinematicFrameChapter(scene: CinematicScene, at: number) {
  if (!Number.isFinite(at) || at < 0 || at > scene.duration) return undefined;
  const index = scene.chapters.findLastIndex(chapter => chapter.at <= at);
  if (index < 0) return undefined;
  const chapter = scene.chapters[index];
  return {
    index,
    chapterNumber: index + 1,
    title: chapter.title,
    start: chapter.at,
    end: scene.chapters[index + 1]?.at ?? scene.duration,
    endInclusive: index === scene.chapters.length - 1,
    scope: 'player-time-selection-not-semantic-or-visibility-approval',
  };
}
