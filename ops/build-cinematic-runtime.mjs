import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('npm', ['run', 'build'], {
  cwd: path.join(root, 'services/agent-runtime'),
  env: {
    ...process.env,
    NEXT_PUBLIC_BASE_PATH: '/agent-runtime',
    NEXT_PUBLIC_AISECEDU_INTEGRATED: 'true',
    AISECEDU_INTEGRATED: 'true',
  },
  stdio: 'inherit',
});
