// Run inside the release image's offline disposable CI container.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { setTimeout as pause } from 'node:timers/promises';

const address = 'http://127.0.0.1:3080';
const app = spawn('dsh', ['web', '--no-open', '--host', '127.0.0.1', '--port', '3080'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let launchUrl;
const lines = createInterface({ input: app.stdout });
lines.on('line', line => {
  const match = line.match(/^dsh web: (https?:\/\/\S+)$/);
  if (match) launchUrl = new URL(match[1]);
});
let bootStart = '';
let bootError = '';
app.stderr.setEncoding('utf8');
app.stderr.on('data', chunk => {
  if (bootStart.length < 3500) bootStart += chunk.slice(0, 3500 - bootStart.length);
  bootError = (bootError + chunk).slice(-800);
});
const exited = once(app, 'exit');
try {
  const deadline = Date.now() + 45_000;
  while (!launchUrl && Date.now() < deadline && app.exitCode === null) await pause(150);
  assert.ok(launchUrl, `Official Web UI startup (exit ${app.exitCode}, signal ${app.signalCode}): ${bootStart}\n${bootError}`);
  assert.ok(launchUrl.origin === address, 'The startup URL must point to the offline loopback listener');
  const request = { redirect: 'manual', signal: AbortSignal.timeout(5000) };
  assert.equal((await fetch(address, request)).status, 401);
  const exchange = await fetch(launchUrl, request);
  assert.equal(exchange.status, 303);
  assert.equal(exchange.headers.get('location'), './');
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, 'The official first-launch exchange did not issue a session cookie');
  const page = await fetch(address, { ...request, headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  const html = await page.text();
  assert.match(html, /<title>DeepSeek Harness<\/title>/i);
  assert.ok(html.includes('__DSH_BOOT__'), 'The official server did not inject the Web bootstrap');
  const script = html.match(/<script[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
  assert.ok(script, 'The official Web UI did not reference its application bundle');
  const asset = new URL(script, address);
  assert.equal(asset.origin, address);
  const response = await fetch(asset, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /javascript/);
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
