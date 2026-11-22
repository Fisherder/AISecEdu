import { slideDeckPageCountIssue, type SlideDeckPageRequirement } from './slide-page-policy';

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

function candidateText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateTextArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const items = value.map(candidateText).filter(Boolean);
    if (items.length) return items;
  }
  return [];
}

const MATERIAL_CHAPTER_MINIMUM_CHARACTERS = 24_000;

export function materialChapterMinimum(extractedCharacters: number): number {
  // A short handout can quite reasonably become one focused lesson.  A
  // substantial uploaded document, however, must yield a teachable outline
  // instead of a single generic "chapter" card.
  return extractedCharacters >= MATERIAL_CHAPTER_MINIMUM_CHARACTERS ? 3 : 1;
}

function materialChapterTitleKey(value: unknown): string {
  return candidateText(value).replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function materialChapterOutlineIssue(
  analysis: Record<string, unknown>,
  minimumChapterCount: number,
): string | null {
  const chapters = Array.isArray(analysis.chapterCandidates) ? analysis.chapterCandidates : [];
  if (chapters.length < minimumChapterCount) {
    return `needs at least ${minimumChapterCount} chapter candidate(s)`;
  }

  const titles = new Set<string>();
  for (let index = 0; index < chapters.length; index++) {
    const chapter = recordValue(chapters[index]);
    if (!chapter) return `chapter ${index + 1} must be an object`;
    const title = candidateText(chapter.title);
    const compactTitle = title.replace(/\s+/g, '');
    if (compactTitle.length < 2) return `chapter ${index + 1} needs a durable title`;
    if (
      /^(?:第?\d+(?:章|节|部分)?|(?:章节|章|节|部分)\s*\d+|(?:chapter|section)\s*\d+)$/iu.test(
        title,
      )
    ) {
      return `chapter ${index + 1} uses a generic ordinal instead of a topic title`;
    }
    const titleKey = materialChapterTitleKey(title);
    if (titles.has(titleKey)) return 'chapter titles must be distinct';
    titles.add(titleKey);

    const objectives = candidateTextArray(chapter.objectives, chapter.learningObjectives);
    const description = candidateText(chapter.description || chapter.summary || chapter.overview);
    if (
      !objectives.some((objective) => objective.replace(/\s+/g, '').length >= 4) &&
      description.replace(/\s+/g, '').length < 12
    ) {
      return `chapter ${index + 1} needs a learning objective or teaching description`;
    }
  }
  return null;
}

export function slideDeckCandidateIssue(
  content: Record<string, unknown>,
  candidateIndex: number,
  pageRequirement: SlideDeckPageRequirement,
): string | null {
  if (
    String(content.type || '')
      .trim()
      .toLowerCase() !== 'slide-deck'
  ) {
    return `candidate ${candidateIndex} content.type must be slide-deck`;
  }
  const outline = nonEmptyArray(content.outline) || [];
  const pageCountIssue = slideDeckPageCountIssue(outline.length, pageRequirement);
  if (pageCountIssue) {
    return `candidate ${candidateIndex} slide deck ${pageCountIssue}`;
  }
  const titles = new Set<string>();
  const layouts = new Set<string>();
  let speakerNotePages = 0;
  let casePages = 0;
  let learnerCheckPages = 0;
  let visualRelationshipPages = 0;
  let summaryPages = 0;
  for (let pageIndex = 0; pageIndex < outline.length; pageIndex++) {
    const page = recordValue(outline[pageIndex]);
    if (!page) {
      return `candidate ${candidateIndex} page ${pageIndex + 1} must be a detailed object`;
    }
    const title = candidateText(page.title || page.name);
    if (!title) return `candidate ${candidateIndex} page ${pageIndex + 1} title is empty`;
    const titleKey = title.toLocaleLowerCase();
    if (titles.has(titleKey)) {
      return `candidate ${candidateIndex} slide titles must be unique`;
    }
    titles.add(titleKey);
    const description = candidateText(
      page.description || page.purpose || page.teachingIntent || page.summary,
    );
    if (description.replace(/\s+/g, '').length < 8) {
      return `candidate ${candidateIndex} page ${pageIndex + 1} needs a concrete teaching purpose`;
    }
    const layout = candidateText(page.layout || page.pageType || page.visualType).toLowerCase();
    const keyPoints = candidateTextArray(
      page.keyPoints,
      page.coreMessages,
      page.contentPoints,
      page.bullets,
    );
    const minimumKeyPoints = layout === 'cover' ? 1 : 2;
    if (keyPoints.length < minimumKeyPoints) {
      return `candidate ${candidateIndex} page ${pageIndex + 1} needs at least ${minimumKeyPoints} concrete point(s)`;
    }
    const visual = candidateText(page.visualBrief || page.visual || page.visualIntent);
    if (!layout || !visual) {
      return `candidate ${candidateIndex} page ${pageIndex + 1} needs layout and visualBrief`;
    }
    layouts.add(layout);
    if (layout === 'case') casePages += 1;
    if (layout === 'activity' || layout === 'checkpoint') learnerCheckPages += 1;
    if (['concept', 'comparison', 'process', 'timeline'].includes(layout)) {
      visualRelationshipPages += 1;
    }
    if (layout === 'summary') summaryPages += 1;
    const speakerNotes = candidateText(
      page.speakerNotes || page.teacherNotes || page.teachingNotes,
    );
    if (speakerNotes.replace(/\s+/g, '').length >= 60) speakerNotePages += 1;
  }
  const requiredLayouts =
    outline.length >= 8 ? 4 : outline.length >= 5 ? 3 : outline.length >= 3 ? 2 : 1;
  if (layouts.size < requiredLayouts) {
    return `candidate ${candidateIndex} slide deck needs at least ${requiredLayouts} distinct layout(s)`;
  }
  if (speakerNotePages !== outline.length) {
    return `candidate ${candidateIndex} speaker notes must cover every page`;
  }
  // Four-page decks are an explicitly compressed format: cover + relationship
  // visual + learner check + summary cannot also fit a standalone worked-case
  // page.  Require the case once there is room for five pages; otherwise the
  // short-deck contract would make deterministic exact-count fallbacks
  // impossible by construction.
  if (outline.length >= 5 && casePages < 1) {
    return `candidate ${candidateIndex} needs a complete case or worked example`;
  }
  const requiredLearnerChecks = outline.length >= 8 ? 2 : outline.length >= 5 ? 1 : 0;
  if (learnerCheckPages < requiredLearnerChecks) {
    return `candidate ${candidateIndex} needs at least ${requiredLearnerChecks} learner check(s)`;
  }
  if (outline.length >= 3 && visualRelationshipPages < 1) {
    return `candidate ${candidateIndex} needs a visual relationship page`;
  }
  if (outline.length >= 2 && summaryPages < 1) {
    return `candidate ${candidateIndex} needs a closing summary`;
  }
  return null;
}
