import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GenerationStateStore } from '@/lib/generation/validated-stage';
import { generationFingerprint } from '@/lib/generation/durable-stage';

export async function openDebateCheckpoint(identity: unknown,
  directory = process.env.DEBATE_CHECKPOINT_DIR || path.join(process.cwd(), 'data', 'debate-checkpoints')): Promise<GenerationStateStore> {
  await mkdir(directory, {recursive: true, mode: 0o700});
  const fingerprint = generationFingerprint({contract: 'debate-v2.1', identity});
  const file = path.join(directory, createHash('sha256').update(fingerprint).digest('hex') + '.json');
  let stages: Record<string, unknown> = {};
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved.fingerprint !== fingerprint || !saved.stages || typeof saved.stages !== 'object') throw Error('辩论步骤记录不匹配');
    stages = saved.stages;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let writes = Promise.resolve();
  return {
    read(name) { return Object.hasOwn(stages, name) ? stages[name] : undefined; },
    async write(name, value) {
      if (!/^workflow-debate-[a-z0-9-]+$/.test(name)) throw Error('辩论步骤名无效');
      stages[name] = structuredClone(value);
      writes = writes.then(async () => {
        const temporary = file + '.' + randomUUID() + '.tmp';
        await writeFile(temporary, JSON.stringify({fingerprint, stages}), {mode: 0o600});
        await rename(temporary, file);
      });
      await writes;
    },
  };
}
