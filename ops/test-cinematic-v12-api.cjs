const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const retry = 'retry-cinematic-v12-api.cjs';
const observer = 'observe-cinematic-v9.cjs';
const sources = Object.fromEntries([retry, observer].map(name => [name, fs.readFileSync(path.join(__dirname, name), 'utf8')]));
const playwright = '/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const base = 'http://10.92.35.7:8080';
const apiBase = base + '/pwncollege_api/v1';
const nonce = 'mock-private-nonce-not-for-evidence';
const cookie = 'mock-private-cookie-not-for-evidence';
const targets = [
  { job: 'job_de31ef062be0472483c295bbe61b048a', artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b', thread: 'thread_7b9f8ab313154828896f4eb5267026fc' },
  { job: 'job_af3f6da7f8644907be4698f7d2670f44', artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c', thread: 'thread_311349201a664533b0a4b1c71124a11e' },
];
const plain = value => JSON.parse(JSON.stringify(value));
const receipt = index => path.join(root, 'cache/cinematic-controls/retry-v12/api-example-' + index, 'request-sent.json');

function memoryFs() {
  const files = new Map(), writes = [], directories = [];
  return {
    files, writes, directories,
    existsSync: name => files.has(name),
    mkdirSync(name, options) { directories.push({ name, options: plain(options) }); },
    mkdtempSync(prefix) { return prefix + 'mock-' + directories.length; },
    writeFileSync(name, value, options) {
      if (options.flag === 'wx' && files.has(name)) throw Object.assign(new Error('Receipt exists'), { code: 'EEXIST' });
      files.set(name, value);
      writes.push({ name, value, options: plain(options) });
    },
  };
}

async function execute(name, args, options = {}) {
  const disk = options.disk || memoryFs();
  const calls = [], logs = [], processMock = { argv: ['node', path.join(__dirname, name), ...args], exitCode: 0 };
  const response = (data, status = 200) => ({ status: () => status, json: async () => plain({ success: true, data }) });
  const api = {
    async get(url, config) {
      calls.push({ method: 'get', url, config: config && plain(config) });
      for (const target of targets) {
        if (url === apiBase + '/teaching/jobs/' + target.job) {
          return response({ job: {
            id: target.job, kind: 'artifact.materialize', threadId: target.thread,
            status: 'FAILED', maxAttempts: 3, attemptCount: 3, stage: 'failed', progress: 20,
            modelRoute: { actualModel: 'deepseek-v4-flash' }, result: { error: 'fixture failure' },
            ...options.job,
          } }, options.getStatus || 200);
        }
        if (url === apiBase + '/teaching/artifacts/' + target.artifact) {
          return response({ artifact: { id: target.artifact, status: 'FAILED', currentRevision: 1, ...options.artifact } });
        }
        if (url === base + '/teacher/artifacts/' + target.artifact) {
          if (options.beforePage) await options.beforePage();
          return { status: () => 200, text: async () => options.html ?? `window.init = {'csrfNonce': "${nonce}"};` };
        }
      }
      throw new Error('Unexpected mock GET target');
    },
    async post(url, config) {
      calls.push({ method: 'post', url, config: plain(config) });
      const index = targets.findIndex(target => url === apiBase + '/teaching/jobs/' + target.job + '/retry') + 1;
      assert.ok(index > 0, 'Only the two original retry endpoints are allowed');
      assert.ok(disk.files.has(receipt(index)), 'Atomic receipt must precede POST');
      if (options.postError) throw new Error(nonce + cookie);
      if (options.invalidJson) return { status: () => 202, json: async () => { throw new SyntaxError(nonce + cookie); } };
      return response({ job: { id: targets[index - 1].job, status: 'QUEUED' }, replacedInPlace: true, ...options.postData }, options.postStatus || 202);
    },
    async dispose() { calls.push({ method: 'dispose' }); },
  };
  const request = { async newContext(config) { calls.push({ method: 'context', config: plain(config) }); return api; } };
  const modules = { 'node:fs': disk, 'node:path': path, 'node:assert/strict': assert, [playwright]: { request } };
  const sandbox = {
    __dirname, process: processMock,
    require(module) { assert.ok(Object.hasOwn(modules, module), 'Unmocked module: ' + module); return modules[module]; },
    console: { log: value => logs.push(value), error: value => logs.push(value) },
    setTimeout(callback, delay) {
      if (!options.nextSample) throw new Error('Unexpected polling in offline test');
      calls.push({ method: 'wait', delay });
      options.nextSample();
      callback();
    },
  };
  let startupError;
  try { await vm.runInNewContext(sources[name], sandbox, { filename: name, timeout: 1000 }); }
  catch (error) { startupError = error; }
  return { disk, calls, logs, exitCode: processMock.exitCode, startupError };
}

function assertPrivate(result) {
  const evidence = JSON.stringify([...result.disk.files]) + result.logs.join('\n');
  assert.ok(!evidence.includes(nonce));
  assert.ok(!evidence.includes(cookie));
  assert.ok(result.disk.writes.every(write => write.options.mode === 0o600));
  assert.ok(result.disk.directories.every(dir => dir.options.mode === 0o700));
}

for (const index of [1, 2]) {
  test('v12 retries only original task ' + index + ' using one authenticated in-place POST', async () => {
    const result = await execute(retry, [String(index), '--run-after-v12']);
    assert.equal(result.startupError, undefined);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.calls.map(call => call.method), ['context', 'get', 'get', 'get', 'post', 'dispose']);
    const post = result.calls.find(call => call.method === 'post');
    assert.equal(post.url, apiBase + '/teaching/jobs/' + targets[index - 1].job + '/retry');
    assert.deepEqual(post.config, {
      headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' },
      data: { idempotencyKey: 'cinematic-v12-original-example-' + index }, maxRetries: 0,
    });
    assert.equal(result.calls[0].config.storageState, path.join(root, 'cache/acceptance/browser-state.json'));
    const marker = JSON.parse(result.disk.files.get(receipt(index)));
    assert.equal(marker.release, 'v12');
    for (const field of ['job', 'artifact', 'thread']) assert.equal(marker[field], targets[index - 1][field]);
    assert.equal(result.disk.writes.find(write => write.name === receipt(index)).options.flag, 'wx');
    assert.ok(result.disk.writes.every(write => write.name.startsWith(path.dirname(receipt(index)) + path.sep)));
    assertPrivate(result);
  });
}

for (const args of [['3', '--run-after-v12'], ['1', '--run-after-v10'], ['1', '--run-after-v11'], ['1'], ['1', '--run-after-v12', '--force']]) {
  test('rejects invalid retry arguments before any API context: ' + args.join(' '), async () => {
    const result = await execute(retry, args);
    assert.ok(result.startupError);
    assert.equal(result.calls.length, 0);
    assert.equal(result.disk.writes.length, 0);
  });
}

for (const [field, value] of [['id', 'job_other'], ['kind', 'learning.authoring'], ['threadId', 'thread_other'], ['status', 'RUNNING'], ['maxAttempts', 4]]) {
  test('refuses mismatched job ' + field + ' before POST', async () => {
    const result = await execute(retry, ['1', '--run-after-v12'], { job: { [field]: value } });
    assert.equal(result.exitCode, 1);
    assert.ok(!result.calls.some(call => call.method === 'post'));
    assert.ok(!result.disk.files.has(receipt(1)));
    assert.equal(result.calls.at(-1).method, 'dispose');
  });
}

for (const artifact of [{ id: 'artifact_other' }, { status: 'GENERATING' }]) {
  test('refuses mismatched artifact ' + JSON.stringify(artifact), async () => {
    const result = await execute(retry, ['1', '--run-after-v12'], { artifact });
    assert.equal(result.exitCode, 1);
    assert.ok(!result.calls.some(call => call.method === 'post'));
    assert.ok(!result.disk.files.has(receipt(1)));
  });
}

for (const options of [{ getStatus: 403 }, { html: 'login page without framework nonce' }]) {
  test('requires authentication and framework nonce: ' + JSON.stringify(options), async () => {
    const result = await execute(retry, ['1', '--run-after-v12'], options);
    assert.equal(result.exitCode, 1);
    assert.ok(!result.calls.some(call => call.method === 'post'));
    assert.ok(!result.disk.files.has(receipt(1)));
    assertPrivate(result);
  });
}

for (const options of [{ postError: true }, { invalidJson: true }, { postStatus: 503 }, { postData: { replacedInPlace: false } }, { postData: { job: { id: 'job_other' } } }]) {
  test('never resends after failed or uncertain POST: ' + JSON.stringify(options), async () => {
    const disk = memoryFs();
    const first = await execute(retry, ['1', '--run-after-v12'], { disk, ...options });
    assert.equal(first.exitCode, 1);
    assert.equal(first.calls.filter(call => call.method === 'post').length, 1);
    assert.ok(disk.files.has(receipt(1)));
    const originalMarker = disk.files.get(receipt(1));
    const second = await execute(retry, ['1', '--run-after-v12'], { disk });
    assert.equal(second.exitCode, 0);
    assert.deepEqual(second.calls.map(call => call.method), ['context', 'get', 'dispose']);
    assert.equal(disk.files.get(receipt(1)), originalMarker);
    assertPrivate(first);
    assertPrivate(second);
  });
}

test('concurrent invocations share atomic receipt and send exactly one POST', async () => {
  const disk = memoryFs();
  let entered = 0, unblock;
  const barrier = new Promise(resolve => { unblock = resolve; });
  const beforePage = async () => { if (++entered === 2) unblock(); await barrier; };
  const runs = await Promise.all([1, 2].map(() => execute(retry, ['1', '--run-after-v12'], { disk, beforePage })));
  assert.equal(entered, 2);
  assert.equal(runs.flatMap(run => run.calls).filter(call => call.method === 'post').length, 1);
  assert.equal(disk.writes.filter(write => write.name === receipt(1)).length, 1);
  assert.deepEqual(runs.map(run => run.exitCode).sort(), [0, 1]);
  runs.forEach(assertPrivate);
});

test('v11 receipt cannot suppress v12 and remains unchanged', async () => {
  const disk = memoryFs();
  const old = receipt(1).replace('retry-v12', 'retry-v11');
  disk.files.set(old, 'preserved v11 evidence');
  const result = await execute(retry, ['1', '--run-after-v12'], { disk });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.filter(call => call.method === 'post').length, 1);
  assert.equal(disk.files.get(old), 'preserved v11 evidence');
});

for (const release of ['v9', 'v10', 'v11', 'v12']) {
  test('observer ' + release + ' reads only original two tasks into isolated evidence', async () => {
    const result = await execute(observer, ['--once', '--release=' + release]);
    assert.equal(result.startupError, undefined);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.calls.filter(call => call.method === 'get').map(call => call.url).sort(), targets.flatMap(target => [
      apiBase + '/teaching/jobs/' + target.job, apiBase + '/teaching/artifacts/' + target.artifact,
    ]).sort());
    assert.ok(!result.calls.some(call => call.method === 'post'));
    assert.equal(result.calls[0].config.storageState, path.join(root, 'cache/acceptance/browser-state.json'));
    assert.equal(result.calls.at(-1).method, 'dispose');
    assert.equal(result.disk.writes.length, 4);
    assert.ok(result.disk.writes.every(write => write.name.startsWith(path.join(root, 'cache/cinematic-controls/retry-' + release, 'observation-'))));
    assertPrivate(result);
  });
}

for (const args of [['--release=v13'], ['--release=v10', '--release=v12']]) {
  test('observer rejects ambiguous or unknown release: ' + args.join(' '), async () => {
    const result = await execute(observer, args);
    assert.ok(result.startupError);
    assert.equal(result.calls.length, 0);
    assert.equal(result.disk.writes.length, 0);
  });
}

test('observer defaults to v9 and terminal --watch does not poll again', async () => {
  const result = await execute(observer, ['--watch']);
  assert.equal(result.exitCode, 0);
  assert.equal(result.startupError, undefined);
  assert.equal(result.calls.filter(call => call.method === 'get').length, 4);
  assert.ok(result.disk.writes.every(write => write.name.includes('/retry-v9/observation-')));
});

for (const index of [1, 2]) {
  for (const [jobStatus, artifactStatus] of [['CANCELED', 'CANCELED'], ['CANCELED', 'FAILED'], ['FAILED', 'CANCELED']]) {
    test('v12 accepts terminal original task ' + index + ': ' + jobStatus + '/' + artifactStatus, async () => {
      const result = await execute(retry, [String(index), '--run-after-v12'], {
        job: { status: jobStatus, attemptCount: jobStatus === 'CANCELED' ? 0 : 3 }, artifact: { status: artifactStatus },
      });
      assert.equal(result.startupError, undefined);
      assert.equal(result.exitCode, 0);
      const posts = result.calls.filter(call => call.method === 'post');
      assert.equal(posts.length, 1);
      assert.equal(posts[0].url, apiBase + '/teaching/jobs/' + targets[index - 1].job + '/retry');
      assert.deepEqual(posts[0].config.data, { idempotencyKey: 'cinematic-v12-original-example-' + index });
      assertPrivate(result);
    });
  }
}

for (const entity of ['job', 'artifact']) {
  for (const status of ['QUEUED', 'CANCEL_REQUESTED', 'SUCCEEDED', null]) {
    test('v12 cannot retry ' + entity + ' with non-retryable status ' + status, async () => {
      const result = await execute(retry, ['1', '--run-after-v12'], { [entity]: { status } });
      assert.equal(result.startupError, undefined);
      assert.equal(result.exitCode, 1);
      assert.ok(!result.calls.some(call => call.method === 'post'));
      assert.ok(!result.disk.files.has(receipt(1)));
      assert.equal(result.calls.at(-1).method, 'dispose');
      assertPrivate(result);
    });
  }
}

test('existing v12 receipt never resends while a cancellation is still finishing', async () => {
  const disk = memoryFs();
  disk.files.set(receipt(1), 'preserved uncertain receipt');
  const result = await execute(retry, ['1', '--run-after-v12'], { disk, job: { status: 'CANCEL_REQUESTED' } });
  assert.equal(result.startupError, undefined);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.calls.map(call => call.method), ['context', 'get', 'dispose']);
  assert.equal(disk.files.get(receipt(1)), 'preserved uncertain receipt');
});

test('v12 observer waits for CANCEL_REQUESTED to become terminal without any POST', async () => {
  const job = { status: 'CANCEL_REQUESTED' }, artifact = { status: 'CANCEL_REQUESTED' };
  const result = await execute(observer, ['--watch', '--release=v12'], {
    job, artifact, nextSample() { job.status = 'CANCELED'; artifact.status = 'CANCELED'; },
  });
  assert.equal(result.startupError, undefined);
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.filter(call => call.method === 'get').length, 8);
  assert.deepEqual(result.calls.filter(call => call.method === 'wait'), [{ method: 'wait', delay: 5000 }]);
  assert.ok(!result.calls.some(call => call.method === 'post'));
  for (const index of [1, 2]) {
    const first = [...result.disk.files].find(([name]) => name.endsWith('example-' + index + '-sample-0.json'));
    const latest = [...result.disk.files].find(([name]) => name.endsWith('example-' + index + '-latest.json'));
    assert.equal(JSON.parse(first[1]).summary.status, 'CANCEL_REQUESTED');
    assert.equal(JSON.parse(latest[1]).summary.status, 'CANCELED');
  }
  assertPrivate(result);
});
