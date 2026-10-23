import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  coursewareDesignSchema,
  coursewarePageSchema,
  coursewareSlideDataSchema,
  type CoursewareDesign,
  type CoursewarePage,
  type CoursewareAsset,
} from './schema';

export type AcceptedCoursewarePage = {
  value: CoursewarePage;
  attempts: number;
  evidence: Record<string, unknown>;
};
export type CoursewareCheckpoint = {
  design?: CoursewareDesign;
  pages: Record<string, AcceptedCoursewarePage>;
  assets?: CoursewareAsset[];
  saveDesign: (design: CoursewareDesign, assets?: CoursewareAsset[]) => Promise<void>;
  savePage: (page: AcceptedCoursewarePage) => Promise<void>;
  saveCorrection?: (page: AcceptedCoursewarePage) => Promise<void>;
  saveAudit?: (audit: unknown) => Promise<void>;
  saveDesignCorrection?: (id: string, fields: Pick<CoursewareDesign['pages'][number], 'visualReason' | 'teachingAction'>) => Promise<void>;
  saveRejected?: (
    id: string,
    value: { attempt: number; draft: unknown; issues: string[] },
  ) => Promise<void>;
};

export async function openCoursewareCheckpoint(
  identity: unknown,
  directory = path.join(process.cwd(), 'data', 'courseware-checkpoints'),
): Promise<CoursewareCheckpoint> {
  // Check the mounted volume before spending model calls on an unwritable job.
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await access(directory, constants.W_OK);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ version: 'courseware-v2.20260913.2', identity }))
    .digest('hex');
  const file = path.join(directory, fingerprint + '.json');
  let saved: {
    design?: CoursewareDesign;
    pages: Record<string, AcceptedCoursewarePage>;
    assets?: CoursewareAsset[];
    audits?: unknown[];
  } = { pages: {} };
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    if (raw.fingerprint !== fingerprint) throw new Error('Checkpoint identity mismatch');
    if (raw.design) saved.design = coursewareDesignSchema.parse(raw.design);
    if (raw.assets) saved.assets = coursewareSlideDataSchema.shape.assets.parse(raw.assets);
    if (Array.isArray(raw.audits)) saved.audits = raw.audits.slice(-8);
    for (const [id, item] of Object.entries(raw.pages || {}) as [
      string,
      AcceptedCoursewarePage,
    ][]) {
      const value = coursewarePageSchema.parse(item.value);
      const digest = createHash('sha256').update(JSON.stringify(item.value)).digest('hex');
      if (
        value.id !== id ||
        raw.pageHashes?.[id] !== digest ||
        !Array.isArray(item.evidence?.frames) ||
        item.evidence.frames.length !== value.beats.length + 1
      )
        throw new Error('Unverified checkpoint page');
      saved.pages[id] = { value, attempts: item.attempts, evidence: item.evidence };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let writes = Promise.resolve();
  const persist = () => {
    writes = writes.then(async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = file + '.' + randomUUID() + '.tmp';
      await writeFile(
        temporary,
        JSON.stringify({
          fingerprint,
          ...saved,
          pageHashes: Object.fromEntries(
            Object.entries(saved.pages).map(([id, item]) => [
              id,
              createHash('sha256').update(JSON.stringify(item.value)).digest('hex'),
            ]),
          ),
        }),
        { mode: 0o600 },
      );
      await rename(temporary, file);
    });
    return writes;
  };
  return {
    get design() {
      return saved.design;
    },
    get pages() {
      return saved.pages;
    },
    get assets() {
      return saved.assets;
    },
    saveDesign: async (design, assets) => {
      saved = { design: structuredClone(design), pages: {}, assets };
      await persist();
    },
    savePage: async (page) => {
      saved.pages[page.value.id] = structuredClone(page);
      await persist();
    },
    saveCorrection: async (page) => {
      const brief = saved.design?.pages.find(item => item.id === page.value.id);
      if (!brief || brief.role !== page.value.role) throw new Error('Correction must preserve the approved page identity and role');
      Object.assign(brief, { title: page.value.title, composition: page.value.composition, visualKind: page.value.visual.kind });
      saved.pages[page.value.id] = structuredClone(page);
      await persist();
    },
    saveAudit: async (audit) => {
      saved.audits = [...(saved.audits || []), structuredClone(audit)].slice(-8);
      await persist();
    },
    saveDesignCorrection: async (id, fields) => {
      if (!saved.design || !saved.design.pages.some(page => page.id === id))
        throw new Error('Unknown design page');
      saved.design = coursewareDesignSchema.parse({ ...saved.design,
        pages: saved.design.pages.map(page => page.id === id ? { ...page, visualReason: fields.visualReason, teachingAction: fields.teachingAction } : page),
      });
      await persist();
    },
    saveRejected: async (id, value) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/.test(id) || ![1, 2, 3].includes(value.attempt))
        throw new Error('Invalid diagnostic identity');
      const diagnostics = path.join(directory, fingerprint + '-rejected');
      await mkdir(diagnostics, { recursive: true, mode: 0o700 });
      await writeFile(
        path.join(diagnostics, `${id}-${value.attempt}.json`),
        JSON.stringify(value),
        { mode: 0o600 },
      );
    },
  };
}
