const test = require('node:test');
const assert = require('node:assert/strict');
const { target, apiBase, base, key, instruction, submit } = require('./revise-cinematic-assembly-api.cjs');

function fixture(change = () => {}, configuration) {
  const target = configuration?.target ?? require('./revise-cinematic-assembly-api.cjs').target;
  const job = { id: target.materialization, kind: 'artifact.materialize', status: 'SUCCEEDED', modelRoute: { actualModel: 'deepseek-v4-flash', degraded: false } };
  const artifact = { id: target.artifact, status: 'READY', currentRevision: 2, activeJob: null, capabilities: { edit: true }, revision: { content: { lesson: { artifacts: [{ content: { renderingMode: 'cinematic-v1', cinematicScene: { nodes: Array.from({ length: 6 }, () => ({ kind: 'model' })) } } }] } } } };
  change({ job, artifact });
  const files = new Map(), posts = [];
  const io = {
    exists: name => files.has(name), load: name => files.get(name), save: (name, data) => files.set(name, structuredClone(data)),
    writeOnce: (name, data) => { assert.equal(files.has(name), false); files.set(name, structuredClone(data)); },
  };
  const response = data => ({ status: () => 200, json: async () => ({ success: true, data }) });
  const api = {
    get: async url => {
      if (url === apiBase + '/teaching/jobs/' + target.materialization) return response({ job });
      if (url === apiBase + '/teaching/artifacts/' + target.artifact) return response({ artifact });
      assert.equal(url, base + '/teacher/artifacts/' + target.artifact);
      return { status: () => 200, text: async () => '{"csrfNonce":"scoped-test-nonce"}' };
    },
    post: async (url, options) => {
      assert.ok(files.has('request-sent.json'));
      posts.push({ url, options });
      return { status: () => 202, json: async () => ({ success: true, data: { job: { id: 'job_abcdef', kind: 'artifact.revise', status: 'QUEUED' } } }) };
    },
  };
  return { api, io, files, posts };
}

test('only revises the identified original valve artifact through its normal API', async () => {
  const f = fixture();
  const result = await submit(f.api, f.io);
  assert.equal(result.jobId, 'job_abcdef');
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].url, apiBase + '/teaching/artifacts/' + target.artifact + '/revise');
  assert.deepEqual(f.posts[0].options.data, { instruction, expectedRevision: 2, allowDegraded: false });
  assert.equal(f.posts[0].options.headers['Idempotency-Key'], key);
  assert.equal(f.posts[0].options.maxRetries, 0);
  assert.ok(f.files.has('artifact-before.json'));
  assert.ok(f.files.has('response.json'));
});

test('foundation revision requires the successful prior revision and exact version 3 draft', async () => {
  const { configuration } = require('./revise-cinematic-foundations-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 3;
  }, configuration);
  await submit(f.api, f.io, configuration);
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].options.data.expectedRevision, 3);
  assert.equal(f.posts[0].options.data.allowDegraded, false);
  assert.equal(f.posts[0].options.headers['Idempotency-Key'], configuration.key);
  assert.equal(f.files.get('request-sent.json').target.materialization, 'job_b30971977e824e979b9b535ebcc5db62');
});

test('foundation revision does not silently revise a newer user draft', async () => {
  const { configuration } = require('./revise-cinematic-foundations-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 4;
  }, configuration);
  await assert.rejects(submit(f.api, f.io, configuration));
  assert.equal(f.posts.length, 0);
});

test('sign revision is pinned to the successful version 5 Flash draft', async () => {
  const { configuration } = require('./revise-cinematic-sign-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 5;
  }, configuration);
  await submit(f.api, f.io, configuration);
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].options.data.expectedRevision, 5);
  assert.equal(f.posts[0].options.data.allowDegraded, false);
  assert.equal(f.posts[0].options.headers['Idempotency-Key'], configuration.key);
  assert.equal(f.files.get('request-sent.json').target.materialization, 'job_a9db17a710e84ae299761f828b1ce7c0');
});

test('sign revision will not overwrite a later draft', async () => {
  const { configuration } = require('./revise-cinematic-sign-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 6;
  }, configuration);
  await assert.rejects(submit(f.api, f.io, configuration));
  assert.equal(f.posts.length, 0);
  assert.equal(f.files.has('request-sent.json'), false);
});

test('board signs use only the existing four-model version 3 Flash artifact', async () => {
  const { configuration } = require('./revise-cinematic-board-signs-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 3;
    artifact.revision.content.lesson.artifacts[0].content.cinematicScene.nodes.length = 4;
  }, configuration);
  await submit(f.api, f.io, configuration);
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].url, apiBase + '/teaching/artifacts/artifact_1a218d1fed7a42d2b1928376e39c260c/revise');
  assert.equal(f.posts[0].options.data.expectedRevision, 3);
  assert.equal(f.posts[0].options.data.allowDegraded, false);
});

test('board signs refuse unexpected model-count drift before any send', async () => {
  const { configuration } = require('./revise-cinematic-board-signs-api.cjs');
  const f = fixture(({ job, artifact }) => {
    job.kind = 'artifact.revise'; artifact.status = 'DRAFT'; artifact.currentRevision = 3;
  }, configuration);
  await assert.rejects(submit(f.api, f.io, configuration));
  assert.equal(f.posts.length, 0); assert.equal(f.files.has('request-sent.json'), false);
});

for (const [name, change] of [
  ['different artifact', ({ artifact }) => { artifact.id = 'other'; }],
  ['different revision', ({ artifact }) => { artifact.currentRevision = 3; }],
  ['another active job', ({ artifact }) => { artifact.activeJob = { id: 'job_other' }; }],
  ['non-ready artifact', ({ artifact }) => { artifact.status = 'DRAFT'; }],
  ['no edit capability', ({ artifact }) => { artifact.capabilities.edit = false; }],
  ['failed initial model job', ({ job }) => { job.status = 'FAILED'; }],
  ['different model', ({ job }) => { job.modelRoute.actualModel = 'pro'; }],
  ['degraded job', ({ job }) => { job.modelRoute.degraded = true; }],
]) test('refuses submission for ' + name, async () => {
  const f = fixture(change);
  await assert.rejects(submit(f.api, f.io));
  assert.equal(f.posts.length, 0);
  assert.equal(f.files.has('request-sent.json'), false);
});

test('never resubmits an uncertain send', async () => {
  const f = fixture();
  let calls = 0;
  f.api.post = async () => { calls++; throw new Error('connection lost after send'); };
  await assert.rejects(submit(f.api, f.io));
  assert.equal((await submit(f.api, f.io)).alreadyAttempted, true);
  assert.equal(calls, 1);
});
