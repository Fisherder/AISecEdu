import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCinematicJson } from './json';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const canonicalJson = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
type Entry = { state: 'completed-not-accepted'; text: string; sha256: string };

/** The old r8 identity is retained only to import an existing checkpoint. */
function legacyContentIdentity(identity:unknown){
  const copy=structuredClone(identity) as {phase?:string;payload?:Record<string,unknown>};
  if(copy&&copy.phase==='materialize'&&copy.payload&&typeof copy.payload==='object'){
    // The worker persists context={} after its first dispatch. Absence and an
    // empty object carry identical content; normalize before hashing so a
    // retry resumes its draft rather than silently starting a new workflow.
    if(copy.payload.context===undefined)copy.payload.context={};
    for(const key of ['manualRetryToken','manualRetryAttempt','manualRetryStartedAt'])delete copy.payload[key];
  }
  return copy;
}

/** Keep content and source revisions in the key, but exclude dispatch state.
 * Runtime material coverage is recomputed at each delivery. With no course
 * materials, its incidental metadata cannot change the generated artifact.
 */
function contentIdentity(identity: unknown) {
  const copy = legacyContentIdentity(identity) as {phase?: string; payload?: Record<string, unknown>};
  if (copy?.phase !== 'materialize' || !copy.payload) return copy;
  const payload = copy.payload;
  for (const key of ['manualRetry', 'manualRetryRootJobId', 'parentGenerationJobId',
    '_supersededRetryJobIds', 'retryOfJobId', 'retryOfLegacyJobId', 'retryOfSolutionRunId'])
    delete payload[key];
  if (payload.context === undefined) payload.context = {};
  payload.sourceRefs ??= [];
  payload.sourceMaterials ??= [];
  const material = payload.materialContext;
  if ((!material || typeof material === 'object' && !Array.isArray(material) &&
      Number((material as Record<string, unknown>).expectedMaterialCount) === 0) &&
      Array.isArray(payload.sourceMaterials) && !payload.sourceMaterials.length &&
      Array.isArray(payload.sourceRefs) && !payload.sourceRefs.length && !payload.materialDossier)
    payload.materialContext = {expectedMaterialCount: 0, complete: true};
  return copy;
}

export async function openCinematicCallCheckpoint(identity: unknown, directory?: string) {
  if (!directory && (process.env.VITEST || process.env.NODE_ENV === 'test')) return undefined;
  const root = directory || path.join(process.cwd(), 'data', 'cinematic-call-checkpoints');
  await mkdir(root, { recursive: true, mode: 0o700 });
  await access(root, constants.W_OK);
  const fingerprint = digest(canonicalJson({ version: 'cinematic-calls-20260930-r9', identity:contentIdentity(identity) }));
  const previousContentFingerprint=digest(canonicalJson({version:'cinematic-calls-20260914-r8',identity:legacyContentIdentity(identity)}));
  const previousFingerprint=digest(canonicalJson({version:'cinematic-calls-20260914-r8',identity}));
  // Optional, operator-scoped rolling-upgrade migration. Every content field,
  // model and source still participates in the legacy hash; only its known
  // former delivery token differs. Old files remain untouched and unaccepted.
  const migration=structuredClone(identity) as {phase?:string;payload?:Record<string,unknown>};
  const priorToken=process.env.CINEMATIC_LEGACY_RETRY_TOKEN;
  let migrationFingerprint:string|undefined;
  if(priorToken&&/^[a-zA-Z0-9_-]{1,160}$/.test(priorToken)&&migration?.phase==='materialize'&&migration.payload){
    migration.payload.manualRetryToken=priorToken;
    if(process.env.CINEMATIC_LEGACY_RETRY_ATTEMPT){
      const count=Number(process.env.CINEMATIC_LEGACY_RETRY_ATTEMPT);
      if(!Number.isInteger(count)||count<1||count>10000)throw Error('Invalid legacy retry migration attempt');
      migration.payload.manualRetryAttempt=count;
    }
    if(process.env.CINEMATIC_LEGACY_RETRY_STARTED_AT){
      const timestamp=process.env.CINEMATIC_LEGACY_RETRY_STARTED_AT;
      if(timestamp.length>40||!Number.isFinite(Date.parse(timestamp)))throw Error('Invalid legacy retry migration timestamp');
      migration.payload.manualRetryStartedAt=timestamp;
    }
    migrationFingerprint=digest(canonicalJson({version:'cinematic-calls-20260914-r8',identity:migration}));
  }
  const legacyFingerprint = digest(
    JSON.stringify({ version: 'cinematic-calls-20260914-r3', identity }),
  );
  const file = path.join(root, fingerprint + '.json');
  let entries: Record<string, Entry> = {};
  let stageEntries: Record<string, { text: string; sha256: string }> = {};
  const executionKeys: string[] = [];
  let validatedEntries: Record<string, Entry> | undefined;
  let repairFeedback: string | undefined;
  let importedLegacy = false;
  for (const candidate of [...new Set([fingerprint,previousContentFingerprint,previousFingerprint,...(migrationFingerprint?[migrationFingerprint]:[]),legacyFingerprint])]) {
    try {
      const saved = JSON.parse(await readFile(path.join(root, candidate + '.json'), 'utf8'));
      if (
        saved.fingerprint !== candidate ||
        !saved.entries ||
        typeof saved.entries !== 'object' ||
        Array.isArray(saved.entries)
      )
        throw Error('Cinematic checkpoint identity mismatch');
      for (const [key, entry] of Object.entries(saved.entries) as [string, Entry][]) {
        if (
          !/^[a-f0-9]{64}$/.test(key) ||
          entry.state !== 'completed-not-accepted' ||
          typeof entry.text !== 'string' ||
          entry.text.length > 400000 ||
          digest(entry.text) !== entry.sha256
        )
          throw Error('Cinematic checkpoint is incomplete or altered');
        parseCinematicJson(entry.text);
        entries[key] = entry;
      }
      importedLegacy = candidate !== fingerprint;
      repairFeedback = typeof saved.repairFeedback === 'string' ? saved.repairFeedback.slice(0, 6000) : undefined;
      if (saved.stageEntries !== undefined) {
        if (!saved.stageEntries || typeof saved.stageEntries !== 'object' || Array.isArray(saved.stageEntries))
          throw Error('Generation stage checkpoint is invalid');
        for (const [name, entry] of Object.entries(saved.stageEntries) as [string, {text: string; sha256: string}][]) {
          if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || !entry || typeof entry.text !== 'string' ||
              entry.text.length > 2000000 || digest(entry.text) !== entry.sha256)
            throw Error('Generation stage checkpoint is incomplete or altered');
          JSON.parse(entry.text);
          stageEntries[name] = entry;
        }
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  let writes = Promise.resolve();
  const save = () => {
    writes = writes.then(async () => {
      const temporary = file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify({ fingerprint, entries, repairFeedback, stageEntries }), { mode: 0o600 });
      await rename(temporary, file);
    });
    return writes;
  };
  if (importedLegacy) await save();
  const stages: GenerationStateStore = {
    read(name) {
      return Object.hasOwn(stageEntries, name) ? JSON.parse(stageEntries[name].text) : undefined;
    },
    async write(name, value) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw Error('Invalid generation stage name');
      const text = JSON.stringify(value);
      if (typeof text !== 'string' || text.length > 2000000) throw Error('Generation stage checkpoint is too large');
      stageEntries[name] = {text, sha256: digest(text)};
      await save();
    },
  };
  return {
    fingerprint,
    stages,
    get repairFeedback() { return repairFeedback; },
    async markValidatedDraft() {
      await writes;
      // Snapshot the values as well as the keys: a later fresh repair may
      // repeat the same prompt and replace its entry with an invalid result.
      validatedEntries = Object.fromEntries([...new Set(executionKeys)].map(key => [key, entries[key]]));
    },
    async rejectRepairs(feedback?: string) {
      await writes;
      if (feedback) repairFeedback = feedback.slice(0, 6000);
      await writeFile(
        file + '.rejected.' + randomUUID(),
        JSON.stringify({ fingerprint, entries, stageEntries }),
        { mode: 0o600 },
      );
      const ordered = [...new Set(executionKeys)].map(key => [key, entries[key]] as const);
      const scene = ordered.findIndex(([, entry]) => {
        const value = parseCinematicJson(entry.text).value as { schemaVersion?: string };
        return value?.schemaVersion === 'cinematic-v1';
      });
      // Keep the last revalidated prefix, not a receipt: retry replays these calls
      // through every gate before attempting the rejected stage again.
      entries = Object.fromEntries(validatedEntries && Object.keys(validatedEntries).length > scene
        ? Object.entries(validatedEntries)
        : scene < 0 ? [] : ordered.slice(0, scene + 1));
      await save();
    },
    async run(request: unknown, operation: () => Promise<string>): Promise<string> {
      const key = digest(canonicalJson(request));
      const legacyKey = digest(JSON.stringify(request));
      const completedKey = entries[key] ? key : entries[legacyKey] ? legacyKey : undefined;
      // Replay an interrupted prefix once. Repeating the same correction in
      // this execution is a new repair attempt, not a memoized success.
      if (completedKey && !executionKeys.includes(completedKey)) {
        executionKeys.push(completedKey);
        return entries[completedKey].text;
      }
      const text = await operation();
      if (text.length > 400000) return text;
      try {
        parseCinematicJson(text);
      } catch {
        return text;
      }
      // Completed model calls are reusable drafts, never acceptance receipts: every quality and browser gate still runs.
      entries[key] = { state: 'completed-not-accepted', text, sha256: digest(text) };
      executionKeys.push(key);
      await save();
      return text;
    },
  };
}
