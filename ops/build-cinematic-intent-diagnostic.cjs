const path = require('node:path');
const { createRequire } = require('node:module');
const runtime = path.resolve('services/agent-runtime');
const fromRuntime = createRequire(path.join(runtime, 'package.json'));
const fromVitest = createRequire(fromRuntime.resolve('vitest'));
const esbuild = fromVitest('esbuild');

// These request-only methods have no valid request context in a standalone
// process. Count and fail if any code tries to use them; do not fake a session.
esbuild.build({
  entryPoints: ['ops/diagnose-cinematic-intent.ts'],
  outfile: 'cache/cinematic-controls/diagnose-intent-v8-main.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  tsconfig: path.join(runtime, 'tsconfig.json'),
  external: ['next', 'next/*'],
  plugins: [{ name: 'standalone-request-boundary', setup(build) {
    build.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'next/headers', namespace: 'no-request' }));
    build.onLoad({ filter: /.*/, namespace: 'no-request' }, () => ({
      contents: `function unavailable() { globalThis.__cinematicDiagnosticBridgeCalls = (globalThis.__cinematicDiagnosticBridgeCalls || 0) + 1; throw new Error('NO_REQUEST_CONTEXT_IN_DIAGNOSTIC'); } export { unavailable as headers, unavailable as cookies };`,
      loader: 'js',
    }));
  } }],
}).then(() => console.log('Standalone diagnostic built; no model call executed')).catch(() => { process.exitCode = 1; });
