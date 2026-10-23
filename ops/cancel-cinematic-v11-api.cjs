const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const base = 'http://10.92.35.7:8080';
const targets = [
  { job: 'job_de31ef062be0472483c295bbe61b048a', artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b', thread: 'thread_7b9f8ab313154828896f4eb5267026fc' },
  { job: 'job_af3f6da7f8644907be4698f7d2670f44', artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c', thread: 'thread_311349201a664533b0a4b1c71124a11e' },
];
assert.equal(process.argv[2], '--cancel-two-timeout-tests');
assert.equal(process.argv.length, 3);
(async () => {
  const dir = fs.mkdtempSync(path.join(root, 'cache/cinematic-controls/retry-v11/cancel-'));
  fs.chmodSync(dir, 0o700);
  const save = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
  const api = await request.newContext({ storageState: path.join(root, 'cache/acceptance/browser-state.json'), timeout: 20000 });
  try {
    for (const target of targets) {
      const endpoint = base + '/pwncollege_api/v1/teaching/jobs/' + target.job;
      const beforeResponse = await api.get(endpoint, { maxRetries: 1 });
      assert.equal(beforeResponse.status(), 200);
      const before = (await beforeResponse.json()).data;
      assert.equal(before.job.id, target.job);
      assert.equal(before.job.threadId, target.thread);
      assert.equal(before.job.kind, 'artifact.materialize');
      save(target.job + '-before.json', before);
      if (!['RUNNING', 'QUEUED'].includes(before.job.status)) {
        console.log(JSON.stringify({ job: target.job, status: before.job.status, action: 'none' }));
        continue;
      }
      const page = await api.get(base + '/teacher/artifacts/' + target.artifact, { maxRetries: 1 });
      assert.equal(page.status(), 200);
      const nonce = /['"]csrfNonce['"]\s*:\s*"([^"\r\n]+)"/.exec(await page.text())?.[1];
      assert.ok(nonce && nonce.length < 256);
      save(target.job + '-request.json', { ...target, action: 'cancel', at: new Date().toISOString() });
      const response = await api.delete(endpoint, { headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' }, data: {}, maxRetries: 0 });
      const result = await response.json();
      save(target.job + '-response.json', { status: response.status(), result });
      assert.equal(response.status(), 200);
      assert.equal(result.success, true);
      console.log(JSON.stringify({ job: target.job, status: result.data.job.status, action: 'cancel-requested', receipt: dir }));
    }
  } finally { await api.dispose(); }
})().catch(error => { console.error(JSON.stringify({ failure: error.name, message: 'Read current task state before any retry of cancellation' })); process.exitCode = 1; });
