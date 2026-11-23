import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = new URL('.', import.meta.url);
const require = createRequire(new URL('../cocreation-workbench/package.json', here));
const { build } = require('esbuild');

await build({
  entryPoints: [fileURLToPath(new URL('courseware-compiler.ts', here))],
  outfile: fileURLToPath(new URL('courseware-compiler.mjs', here)),
  tsconfig: fileURLToPath(new URL('../agent-runtime/tsconfig.json', here)),
  bundle: true, platform: 'node', target: 'node24', format: 'esm', minify: true,
  supported: { 'template-literal': false },
  plugins: [{
    name: 'production-player-sources',
    setup(builder) {
      builder.onResolve({ filter: /\?raw$/ }, args => ({
        path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-player-source',
      }));
      builder.onLoad({ filter: /./, namespace: 'raw-player-source' }, async args => ({
        contents: await readFile(args.path, 'utf8'), loader: 'text',
      }));
    },
  }],
});
