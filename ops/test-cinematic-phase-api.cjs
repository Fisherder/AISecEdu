const { test } = require('node:test');
const assert = require('node:assert/strict');
const { target, base, apiBase, instruction, key, submit, observe, retry, cancel } = require('./revise-cinematic-phases-api.cjs');

function fixture(options = {}) {
  const files = new Map(), calls = [];
  const job = { id: target.materialization, kind: 'artifact.materialize', status: 'SUCCEEDED', modelRoute: { actualModel: 'deepseek-v4-flash', degraded: false }, ...options.job };
  const artifact = { id: target.artifact, status: 'READY', currentRevision: 2, capabilities: { edit: true }, revision: { content: { lesson: { artifacts: [{ content: { renderingMode: 'cinematic-v1', cinematicScene: { nodes: Array.from({ length: 4 }, () => ({ kind: 'model' })) } } }] } } }, ...options.artifact };
  const response = (data, status = 200) => ({ status: () => status, json: async () => ({ success: true, data }) });
  const io = {
    exists: name => files.has(name), load: name => files.get(name),
    save: (name, value) => files.set(name, value),
    writeOnce(name, value) { assert.ok(!files.has(name)); files.set(name, value); },
  };
  const api = {
    async get(url, config) {
      calls.push({ method: 'GET', url, config });
      if (url === apiBase + '/teaching/jobs/' + target.materialization) return response({ job });
      if (url === apiBase + '/teaching/artifacts/' + target.artifact) return response({ artifact });
      if (url === base + '/teacher/artifacts/' + target.artifact) return { status: () => 200, text: async () => options.html ?? 'window.init={"csrfNonce":"private-test-nonce"}' };
      if (url === apiBase + '/teaching/jobs/job_abc123') return response({ job: { id: 'job_abc123', kind: 'artifact.revise', status: 'RUNNING', modelRoute: { actualModel: 'deepseek-v4-flash', degraded: false }, ...options.observedJob } });
      throw new Error('Unscoped URL');
    },
    async post(url, config) {
      assert.ok(files.has('request-sent.json'));
      calls.push({ method: 'POST', url, config });
      if (options.postError) throw new Error('private-test-nonce');
      if (url === apiBase + '/teaching/jobs/job_abc123/retry') {
        assert.ok(files.has('retry-v13-request-sent.json') || files.has('retry-v14-request-sent.json'));
        if (options.retryError) throw new Error('private-test-nonce');
        return response({ job: { id: 'job_abc123', kind: 'artifact.revise', status: 'QUEUED' }, replacedInPlace: true });
      }
      return response({ job: { id: 'job_abc123', kind: 'artifact.revise', status: 'QUEUED' } }, options.postStatus ?? 202);
    },
    async delete(url, config) {
      assert.ok(files.has('cancel-contract-request.json'));
      assert.equal(url, apiBase + '/teaching/jobs/job_abc123');
      calls.push({ method: 'DELETE', url, config });
      return response({ job: { id: 'job_abc123', kind: 'artifact.revise', status: 'CANCEL_REQUESTED' } });
    },
  };
  return { api, io, files, calls, artifact };
}

test('one revision POST retains original artifact, expected revision, Flash and private receipt', async () => {
  const f = fixture();
  assert.deepEqual(await submit(f.api, f.io), { jobId: 'job_abc123', artifactId: target.artifact, status: 'QUEUED', expectedRevision: 2 });
  const posts = f.calls.filter(call => call.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, apiBase + '/teaching/artifacts/' + target.artifact + '/revise');
  assert.deepEqual(posts[0].config, {
    headers: { 'CSRF-Token': 'private-test-nonce', 'Content-Type': 'application/json', 'Idempotency-Key': key },
    data: { instruction, expectedRevision: 2, allowDegraded: false }, maxRetries: 0,
  });
  assert.ok(!JSON.stringify([...f.files]).includes('private-test-nonce'));
});

for (const options of [
  { job: { status: 'RUNNING' } }, { job: { kind: 'artifact.revise' } },
  { job: { modelRoute: { actualModel: 'deepseek-v4-pro', degraded: false } } },
  { job: { modelRoute: { actualModel: 'deepseek-v4-flash', degraded: true } } },
  { artifact: { id: 'another-artifact' } }, { artifact: { currentRevision: 3 } },
  { artifact: { status: 'RUNNING' } }, { artifact: { capabilities: { edit: false } } },
  { artifact: { revision: {} } }, { html: 'login required' },
]) test('preflight rejects changed source or unauthorized input: ' + JSON.stringify(options), async () => {
  const f = fixture(options);
  await assert.rejects(submit(f.api, f.io));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 0);
  assert.ok(!f.files.has('request-sent.json'));
});

test('uncertain POST is never automatically repeated', async () => {
  const f = fixture({ postError: true });
  await assert.rejects(submit(f.api, f.io));
  assert.equal((await submit(f.api, f.io)).alreadyAttempted, true);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('rejected POST retains evidence and is never repeated', async () => {
  const f = fixture({ postStatus: 409 });
  await assert.rejects(submit(f.api, f.io));
  assert.equal(f.files.get('response.json').status, 409);
  assert.equal((await submit(f.api, f.io)).alreadyAttempted, true);
});

test('observer reads the receipt job and artifact without resubmitting', async () => {
  const f = fixture();
  await submit(f.api, f.io);
  const before = f.calls.length;
  const summary = await observe(f.api, f.io);
  assert.equal(summary.jobId, 'job_abc123');
  assert.equal(summary.status, 'RUNNING');
  assert.ok(f.calls.slice(before).every(call => call.method === 'GET'));
  assert.equal(f.files.get('artifact-latest.json').id, target.artifact);
});

test('observer rejects a different returned job', async () => {
  const f = fixture({ observedJob: { id: 'job_fff' } });
  await submit(f.api, f.io);
  await assert.rejects(observe(f.api, f.io));
  assert.ok(!f.files.has('latest.json'));
});

test('v13 retries the same failed revision job in place without changing its instruction', async () => {
  const f = fixture({ observedJob: { status: 'FAILED' } });
  await submit(f.api, f.io);
  const initial = structuredClone(f.files.get('request-sent.json'));
  const result = await retry(f.api, f.io);
  assert.equal(result.jobId, 'job_abc123');
  assert.equal(result.replacedInPlace, true);
  const post = f.calls.filter(call => call.method === 'POST').at(-1);
  assert.equal(post.url, apiBase + '/teaching/jobs/job_abc123/retry');
  assert.deepEqual(post.config, {
    headers: { 'CSRF-Token': 'private-test-nonce', 'Content-Type': 'application/json' },
    data: { idempotencyKey: key + '-retry-v13' }, maxRetries: 0,
  });
  assert.deepEqual(f.files.get('request-sent.json'), initial);
  assert.ok(!JSON.stringify([...f.files]).includes('private-test-nonce'));
});

test('v13 retry rejects a changed artifact revision', async () => {
  const f = fixture({ observedJob: { status: 'FAILED' } });
  await submit(f.api, f.io);
  f.artifact.currentRevision = 3;
  await assert.rejects(retry(f.api, f.io));
  assert.ok(!f.files.has('retry-v13-request-sent.json'));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('v13 retry rejects a still running job', async () => {
  const f = fixture();
  await submit(f.api, f.io);
  await assert.rejects(retry(f.api, f.io));
  assert.ok(!f.files.has('retry-v13-request-sent.json'));
});

test('v13 retry never repeats an uncertain POST', async () => {
  const f = fixture({ observedJob: { status: 'FAILED' }, retryError: true });
  await submit(f.api, f.io);
  await assert.rejects(retry(f.api, f.io));
  assert.equal((await retry(f.api, f.io)).alreadyAttempted, true);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});

test('cancellation only targets the original live revision job with normal JSON CSRF headers', async () => {
  const f = fixture();
  await submit(f.api, f.io);
  const result = await cancel(f.api, f.io);
  assert.equal(result.status, 'CANCEL_REQUESTED');
  assert.deepEqual(f.calls.find(call => call.method === 'DELETE').config, {
    headers: { 'CSRF-Token': 'private-test-nonce', 'Content-Type': 'application/json' }, data: {}, maxRetries: 0,
  });
  assert.equal((await cancel(f.api, f.io)).alreadyAttempted, true);
  assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 1);
  assert.ok(!JSON.stringify([...f.files]).includes('private-test-nonce'));
});

for (const status of ['SUCCEEDED', 'FAILED', 'CANCELED', 'CANCEL_REQUESTED']) test('cancellation leaves ' + status + ' unchanged', async () => {
  const f = fixture({ observedJob: { status } });
  await submit(f.api, f.io);
  assert.equal((await cancel(f.api, f.io)).action, 'none');
  assert.equal(f.calls.filter(call => call.method === 'DELETE').length, 0);
});

test('v14 retries the original canceled job using a distinct one-time receipt', async () => {
  const f = fixture({ observedJob: { status: 'CANCELED' } });
  await submit(f.api, f.io);
  await assert.rejects(retry(f.api, f.io, 'v13'));
  assert.equal((await retry(f.api, f.io, 'v14')).replacedInPlace, true);
  assert.equal((await retry(f.api, f.io, 'v14')).alreadyAttempted, true);
  assert.ok(!f.files.has('retry-v13-request-sent.json'));
  assert.equal(f.files.get('retry-v14-request-sent.json').key, key + '-retry-v14');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
});

test('unknown retry releases fail before any API call', async () => {
  const f = fixture();
  await assert.rejects(retry(f.api, f.io, 'v99'));
  assert.equal(f.calls.length, 0);
});
