import { createHash } from 'node:crypto';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';

type ContractDraft = {
  rawScene?: unknown;
  previousOutput?: string;
  previousFailure?: string;
  previousPatchApplied?: boolean;
};
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

/** Unvalidated model data only. Resumption must run the entire acceptance pipeline. */
export function cinematicContractCheckpoint(identity: unknown, state?: GenerationStateStore) {
  const fingerprint = createHash('sha256').update(canonical({version: 1, identity})).digest('hex');
  const key = 'cinematic-contract-' + fingerprint.slice(0, 40);
  const saved = state?.read(key) as (ContractDraft & {version?: number; fingerprint?: string; attempts?: number}) | undefined;
  let attempts = 0;
  let draft: ContractDraft = {};
  if (saved !== undefined) {
    if (!saved || saved.version !== 1 || saved.fingerprint !== fingerprint ||
        !Number.isInteger(saved.attempts) || saved.attempts! < 0 || saved.attempts! > 64 ||
        JSON.stringify(saved).length > 2_000_000 ||
        (saved.previousOutput !== undefined && (typeof saved.previousOutput !== 'string' || saved.previousOutput.length > 400_000)) ||
        (saved.previousFailure !== undefined && (typeof saved.previousFailure !== 'string' || saved.previousFailure.length > 16_000)) ||
        (saved.previousPatchApplied !== undefined && typeof saved.previousPatchApplied !== 'boolean'))
      throw Error('Invalid cinematic contract draft checkpoint');
    attempts = saved.attempts!;
    draft = structuredClone({rawScene: saved.rawScene, previousOutput: saved.previousOutput,
      previousFailure: saved.previousFailure, previousPatchApplied: saved.previousPatchApplied});
  }
  return {key, draft, resumed: saved !== undefined, async save(value: ContractDraft) {
    const next = {version: 1, fingerprint, ...value, attempts: ++attempts};
    if (attempts > 64) throw Error('Cinematic contract repair budget exhausted without acceptance');
    if (JSON.stringify(next).length > 2_000_000 || (value.previousOutput?.length ?? 0) > 400_000)
      throw Error('Cinematic contract draft exceeds checkpoint capacity');
    await state?.write(key, next);
  }};
}
