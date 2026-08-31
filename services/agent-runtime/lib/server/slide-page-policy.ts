export const DEFAULT_SLIDE_PAGE_MIN = 12;
export const DEFAULT_SLIDE_PAGE_MAX = 15;
export const DEFAULT_SLIDE_PAGE_TARGET = 14;

export type SlideDeckPageRequirement = {
  min: number;
  max: number;
  preferred: number;
  explicit: boolean;
  source: 'default' | 'exact' | 'range' | 'approximate';
};

const MAX_EXPLICIT_SLIDE_PAGES = 120;

const DEFAULT_REQUIREMENT: SlideDeckPageRequirement = {
  min: DEFAULT_SLIDE_PAGE_MIN,
  max: DEFAULT_SLIDE_PAGE_MAX,
  preferred: DEFAULT_SLIDE_PAGE_TARGET,
  explicit: false,
  source: 'default',
};

function chinesePageNumber(value: string): number | null {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (!value.includes('十')) {
    const parsed = [...value].map((character) => digits[character]);
    if (parsed.some((digit) => digit === undefined)) return null;
    return Number(parsed.join(''));
  }
  const [left, right] = value.split('十');
  const tens = left ? digits[left] : 1;
  const units = right ? digits[right] : 0;
  if (tens === undefined || units === undefined) return null;
  return tens * 10 + units;
}

function normalizedPageText(value: string): string {
  const fullWidthDigits = '０１２３４５６７８９';
  const normalized = value.replace(/[０-９]/g, (digit) => String(fullWidthDigits.indexOf(digit)));
  return normalized.replace(/[零〇一二两三四五六七八九十]{1,4}(?=\s*页)/g, (number) => {
    const parsed = chinesePageNumber(number);
    return parsed === null ? number : String(parsed);
  });
}

function validPageCount(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_EXPLICIT_SLIDE_PAGES;
}

type LocatedRequirement = SlideDeckPageRequirement & { index: number };

function collectMatches(
  text: string,
  pattern: RegExp,
  create: (match: RegExpExecArray) => SlideDeckPageRequirement | null,
): LocatedRequirement[] {
  const matches: LocatedRequirement[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const requirement = create(match);
    if (requirement) matches.push({ ...requirement, index: match.index });
  }
  return matches;
}

export function parseSlideDeckPageRequirement(text: string): SlideDeckPageRequirement {
  const normalized = normalizedPageText(text);
  const matches: LocatedRequirement[] = [];
  matches.push(
    ...collectMatches(
      normalized,
      /(\d{1,3})\s*(?:页|张(?:幻灯片|PPT)?|个(?:完整)?教学页(?:面)?|slides?|pages?)?\s*(?:[-–—~～]|至|到)\s*(\d{1,3})\s*(?:页|张(?:幻灯片|PPT)?|个(?:完整)?教学页(?:面)?|slides?|pages?)/gi,
      (match) => {
        const first = Number(match[1]);
        const second = Number(match[2]);
        if (!validPageCount(first) || !validPageCount(second)) return null;
        const min = Math.min(first, second);
        const max = Math.max(first, second);
        return {
          min,
          max,
          preferred: Math.round((min + max) / 2),
          explicit: true,
          source: 'range',
        };
      },
    ),
  );
  matches.push(
    ...collectMatches(
      normalized,
      /(?:大约|约)?\s*(\d{1,3})\s*(?:页|张(?:幻灯片|PPT)?|slides?|pages?)\s*(?:左右|上下|大约|约)/gi,
      (match) => {
        const preferred = Number(match[1]);
        if (!validPageCount(preferred)) return null;
        return {
          min: Math.max(1, preferred - 1),
          max: Math.min(MAX_EXPLICIT_SLIDE_PAGES, preferred + 1),
          preferred,
          explicit: true,
          source: 'approximate',
        };
      },
    ),
  );
  const exactPatterns = [
    /(?:生成|制作|创建|准备|做成|整理成|需要|要|共|总共|页数(?:为|是)?|总页数(?:保持(?:为|在)?|为|是)?|保持(?:总)?页数(?:为|是|在)?|控制在|保持在|压缩(?:到|为)|扩展(?:到|为))[^\d。；;\n]{0,12}(\d{1,3})\s*(?:页|个(?:完整)?教学页(?:面)?)/gi,
    /(\d{1,3})\s*页(?:的)?\s*(?:课件|PPT|幻灯片|演示文稿)/gi,
    /(?:make|create|generate|build|need|want)\s+(?:a\s+)?(\d{1,3})[ -]?(?:slide|page)s?\b/gi,
    /(\d{1,3})[ -]?(?:slide|page)s?\s+(?:deck|presentation)\b/gi,
  ];
  for (const pattern of exactPatterns) {
    matches.push(
      ...collectMatches(normalized, pattern, (match) => {
        const count = Number(match[1]);
        if (!validPageCount(count)) return null;
        const numberOffset = match.index + match[0].lastIndexOf(match[1]);
        const numberPrefix = normalized.slice(Math.max(0, numberOffset - 8), numberOffset);
        // “增加一页/补充两页” describes a relative edit, not the deck's
        // total length. A preceding “生成” elsewhere in the same sentence
        // must not accidentally turn that local addition into an exact count.
        if (/(?:增加|新增|补充|插入|追加)\s*$/.test(numberPrefix)) return null;
        return {
          min: count,
          max: count,
          preferred: count,
          explicit: true,
          source: 'exact',
        };
      }),
    );
  }
  const defaultInstruction = new RegExp(
    `教师未指定页数[^\u3002]*默认生成\\s*${DEFAULT_SLIDE_PAGE_MIN}\\s*(?:[-–—~～]|至|到)\\s*${DEFAULT_SLIDE_PAGE_MAX}[^\u3002]*。`,
    'g',
  );
  let defaultMatch: RegExpExecArray | null;
  while ((defaultMatch = defaultInstruction.exec(normalized)) !== null) {
    matches.push({
      ...DEFAULT_REQUIREMENT,
      index: defaultMatch.index + defaultMatch[0].length,
    });
  }
  if (!matches.length) return { ...DEFAULT_REQUIREMENT };
  const selected = matches.sort((left, right) => left.index - right.index).at(-1);
  if (!selected) return { ...DEFAULT_REQUIREMENT };
  const { index: _index, ...requirement } = selected;
  return requirement;
}

export function slideDeckPageRequirementFromValue(value: unknown): SlideDeckPageRequirement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_REQUIREMENT };
  }
  const item = value as Record<string, unknown>;
  const min = Number(item.min);
  const max = Number(item.max);
  const preferred = Number(item.preferred);
  const explicit = item.explicit === true;
  const source = String(item.source || '');
  if (
    !validPageCount(min) ||
    !validPageCount(max) ||
    !validPageCount(preferred) ||
    min > max ||
    preferred < min ||
    preferred > max ||
    !['default', 'exact', 'range', 'approximate'].includes(source)
  ) {
    return { ...DEFAULT_REQUIREMENT };
  }
  return {
    min,
    max,
    preferred,
    explicit,
    source: source as SlideDeckPageRequirement['source'],
  };
}

export function slideDeckPageInstruction(requirement: SlideDeckPageRequirement): string {
  if (requirement.source === 'exact') {
    return `教师明确指定 ${requirement.preferred} 页；必须恰好生成 ${requirement.preferred} 个完整教学页面，不得擅自增减。`;
  }
  if (requirement.source === 'range') {
    return `教师明确指定 ${requirement.min}–${requirement.max} 页；必须在该区间内生成，优先接近 ${requirement.preferred} 页。`;
  }
  if (requirement.source === 'approximate') {
    return `教师要求约 ${requirement.preferred} 页；生成 ${requirement.min}–${requirement.max} 个完整教学页面，优先 ${requirement.preferred} 页。`;
  }
  return `教师未指定页数；默认生成 ${DEFAULT_SLIDE_PAGE_MIN}–${DEFAULT_SLIDE_PAGE_MAX} 个完整教学页面，优先 ${DEFAULT_SLIDE_PAGE_TARGET} 页。`;
}

export function slideDeckPageCountIssue(
  actual: number,
  requirement: SlideDeckPageRequirement,
): string | null {
  if (actual < requirement.min || actual > requirement.max) {
    if (requirement.min === requirement.max) {
      return `must contain exactly ${requirement.min} pages; received ${actual}`;
    }
    return `must contain ${requirement.min}-${requirement.max} pages; received ${actual}`;
  }
  return null;
}
