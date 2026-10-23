import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openCinematicCallCheckpoint } from '@/lib/cinematic/call-checkpoint';
const roots: string[] = [];
const identity = (context?: unknown) => ({phase: 'materialize', model: 'test:model', payload: {artifactId: 'owned-artifact', requestPrompt: '逐步观察二分查找', ...(context === undefined ? {} : {context})}});
const root = async () => {const path = await mkdtemp(join(tmpdir(), 'simulation-identity-')); roots.push(path); return path;};
afterEach(async () => {await Promise.all(roots.splice(0).map(path => rm(path, {recursive: true, force: true})));});
describe('materialization dispatch identity', () => {
  it('reuses the validated prefix and draft when the worker persists an empty context', async () => {
    const directory = await root(), first = (await openCinematicCallCheckpoint(identity(), directory))!;
    await first.run({system: 'JSON', user: 'intent'}, async () => '{"mode":"process"}');
    await first.markValidatedDraft();
    await first.stages.write('process-repair', {scene: {title: '已有草稿'}, correction: '只修解释'});
    await first.rejectRepairs('解释未通过');
    const retry = (await openCinematicCallCheckpoint(identity({}), directory))!;
    expect(retry.fingerprint).toBe(first.fingerprint);
    expect(retry.stages.read('process-repair')).toEqual({scene: {title: '已有草稿'}, correction: '只修解释'});
    expect(await retry.run({system: 'JSON', user: 'intent'}, async () => {throw Error('must reuse');})).toBe('{"mode":"process"}');
  });
  it('keeps real context changes distinct', async () => {
    const directory = await root(), empty = (await openCinematicCallCheckpoint(identity({}), directory))!;
    for (const context of [{audience: '高中'}, {audience: '大学'}, null]) {
      expect((await openCinematicCallCheckpoint(identity(context), directory))!.fingerprint).not.toBe(empty.fingerprint);
    }
  });
  it('migrates a pre-normalization checkpoint without discarding its draft', async () => {
    const directory = await root(), initial = (await openCinematicCallCheckpoint(identity(), directory))!;
    await initial.stages.write('process-repair', {draft: 'preserved'});
    const file = join(directory, initial.fingerprint + '.json'), data = JSON.parse(await readFile(file, 'utf8'));
    const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    const legacy = createHash('sha256').update(canonical({version: 'cinematic-calls-20260914-r8', identity: identity()})).digest('hex');
    data.fingerprint = legacy; await writeFile(join(directory, legacy + '.json'), JSON.stringify(data)); await rm(file);
    const resumed = (await openCinematicCallCheckpoint(identity(), directory))!;
    expect(resumed.stages.read('process-repair')).toEqual({draft: 'preserved'});
    expect(JSON.parse(await readFile(file, 'utf8')).fingerprint).toBe(resumed.fingerprint);
  });
});
