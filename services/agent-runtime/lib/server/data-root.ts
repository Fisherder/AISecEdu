import path from 'node:path';

export function resolveAgentRuntimeDataDir(
  cwd = process.cwd(),
  configured = process.env.GLOBAL_AGENT_RUNTIME_DATA_DIR || process.env.OPENMAIC_DATA_DIR,
): string {
  const value = configured?.trim();
  return value ? path.resolve(cwd, value) : path.join(cwd, 'data');
}
