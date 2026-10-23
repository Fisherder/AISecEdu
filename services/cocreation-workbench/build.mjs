import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
const output = new URL('../../dojo_theme/static/js/dojo/workbench-v3/', import.meta.url);
await mkdir(output, { recursive: true });
const result = await build({
  entryPoints: [new URL('./src/main.tsx', import.meta.url).pathname],
  outfile: new URL('app.js', output).pathname,
  bundle: true,
  minify: true,
  sourcemap: false,
  metafile: true,
  target: ['es2022'],
  format: 'iife',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'external',
});
for (const variant of ['app.min.js', 'app.dev.js'])
  await copyFile(new URL('app.js', output), new URL(variant, output));
await writeFile(
  new URL('./build-meta.json', import.meta.url),
  JSON.stringify(result.metafile, null, 2),
);
