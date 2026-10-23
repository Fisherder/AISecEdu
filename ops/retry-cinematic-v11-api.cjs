// The normal authenticated retry API, without launching or controlling any UI.
// Run only after the guarded v11 deployment receipt and live image are verified.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const index = Number(process.argv[2]);
assert.ok([1, 2].includes(index));
assert.equal(process.argv[3], '--run-after-v11');
assert.equal(process.argv.length, 4);
const target = {
  1: { job: 'job_de31ef062be0472483c295bbe61b048a', artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b', thread: 'thread_7b9f8ab313154828896f4eb5267026fc' },
  2: { job: 'job_af3f6da7f8644907be4698f7d2670f44', artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c', thread: 'thread_311349201a664533b0a4b1c71124a11e' },
}[index];
const base = 'http://10.92.35.7:8080';
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'cache/cinematic-controls/retry-v11/api-example-' + index);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), { mode: 0o600 });
const sent = path.join(dir, 'request-sent.json');

(async () => {
  const api = await request.newContext({ storageState: path.join(root, 'cache/acceptance/browser-state.json'), timeout: 20000 });
  try {
    const read = async route => {
      const response = await api.get(base + '/pwncollege_api/v1' + route, { maxRetries: 1 });
      assert.equal(response.status(), 200);
      const result = await response.json();
      assert.equal(result.success, true);
      return result.data;
    };
    const before = await read('/teaching/jobs/' + target.job);
    assert.equal(before.job.id, target.job);
    assert.equal(before.job.kind, 'artifact.materialize');
    assert.equal(before.job.threadId, target.thread);
    if (fs.existsSync(sent)) {
      console.log(JSON.stringify({ jobId: target.job, status: before.job.status, alreadyAttempted: true, policy: 'No automatic resubmission after an uncertain POST' }));
      return;
    }
    assert.equal(before.job.status, 'FAILED');
    assert.equal(before.job.maxAttempts, 3);
    const artifactBefore = await read('/teaching/artifacts/' + target.artifact);
    assert.equal(artifactBefore.artifact.id, target.artifact);
    assert.equal(artifactBefore.artifact.status, 'FAILED');
    save('job-before.json', before);
    save('artifact-before.json', artifactBefore);
    // Same framework nonce and CSRF header used by the application's request client.
    const page = await api.get(base + '/teacher/artifacts/' + target.artifact);
    assert.equal(page.status(), 200);
    const html = await page.text();
    const nonce = /['"]csrfNonce['"]\s*:\s*"([^"\r\n]+)"/.exec(html)?.[1];
    assert.ok(nonce && nonce.length < 256, 'Authenticated framework nonce unavailable');
    const key = 'cinematic-v11-original-example-' + index;
    fs.writeFileSync(sent, JSON.stringify({ created: new Date().toISOString(), release: 'v11', ...target,
      idempotencyKey: key, policy: 'Retry original FAILED materialization in place through normal API; no SceneIR or request edits' }, null, 2), { mode: 0o600, flag: 'wx' });
    const response = await api.post(base + '/pwncollege_api/v1/teaching/jobs/' + target.job + '/retry', {
      headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' },
      data: { idempotencyKey: key }, maxRetries: 0,
    });
    const result = await response.json();
    save('response.json', { status: response.status(), result });
    assert.ok([200, 202].includes(response.status()));
    assert.equal(result.success, true);
    assert.equal(result.data.job.id, target.job);
    assert.equal(result.data.replacedInPlace, true);
    console.log(JSON.stringify({ example: index, jobId: target.job, artifactId: target.artifact,
      status: result.data.job.status, replacedInPlace: true, receipt: dir }));
  } finally { await api.dispose(); }
})().catch(error => {
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped retry did not complete; inspect private receipt and current job before any further action' }));
  process.exitCode = 1;
});
