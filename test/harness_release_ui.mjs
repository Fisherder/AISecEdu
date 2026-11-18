// Run inside the release image's offline disposable CI container.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';

const address = 'http://127.0.0.1:3080';
const app = spawn('dsh', ['web', '--no-open', '--host', '127.0.0.1', '--port', '3080'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
let bootError = '';
app.stderr.setEncoding('utf8');
app.stderr.on('data', chunk => { bootError = (bootError + chunk).slice(-2500); });
const exited = once(app, 'exit');
try {
  const deadline = Date.now() + 45_000;
  let html;
  while (Date.now() < deadline && app.exitCode === null) {
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(2000) });
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
        html = await response.text();
        break;
      }
    } catch (error) {
      if (app.exitCode !== null) throw error;
    }
    await pause(250);
  }
  assert.ok(html, `Official Web UI startup (exit ${app.exitCode}, signal ${app.signalCode}): ${bootError}`);
  const script = html.match(/<script[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  assert.ok(script, 'The official Web UI did not reference its application bundle');
  const asset = new URL(script, address);
  assert.equal(asset.origin, address);
  const response = await fetch(asset, { signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok && !response.headers.get('content-type')?.includes('text/html'));
  console.log('Official Web UI served its HTML and JavaScript in the offline container.');
} finally {
  app.kill();
  const killTimer = setTimeout(() => app.kill('SIGKILL'), 3000);
  try {
    await exited;
  } finally {
    clearTimeout(killTimer);
  }
}
