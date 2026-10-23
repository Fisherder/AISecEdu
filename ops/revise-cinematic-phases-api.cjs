const assert = require('node:assert/strict');
const target = Object.freeze({
  artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c',
  materialization: 'job_af3f6da7f8644907be4698f7d2670f44',
  revision: 2,
});
const base = 'http://10.92.35.7:8080';
const apiBase = base + '/pwncollege_api/v1';
const instruction = '请只修正这份主板演示中的阶段文字与动作同步问题，保留现有三维模型、精细结构、装配、全部近景镜头及处理器、内存和逻辑栈的拆解复原过程，不改成二维或幻灯片，不删减原教学要求。现在“进入、保存、返回、退出”共用一个章节标题和一段说明，状态面板只是亮度变化，观众不能明确知道当前是哪一步。请让这四步各有能单独定位的时间轴阶段、实时切换的可见标题和解释，切换时刻必须与已有帧标记、局部信息标记的实际位置和显隐变化对应；解释应明确此时什么进入、什么保存、什么返回、什么退出，不要仅改变亮度或仍用一个总标题概括四步。保留两个标记的真实运动、模型和既有拆装轨道，优先使用播放器中真实可见的阶段标题与说明完成同步，不要声称静态三维方块能自动显示动态文字。暂停、单步、拖动时间轴和重置后，显示的阶段也必须与当时画面一致。保持作品标题与其他内容不变。';
const key = 'cinematic-v12-mainboard-phase-sync-r2';

async function read(api, route) {
  const response = await api.get(apiBase + route, { maxRetries: 1 });
  assert.equal(response.status(), 200, 'Scoped API HTTP ' + response.status());
  const result = await response.json();
  assert.equal(result.success, true);
  return result.data;
}

async function submit(api, io) {
  if (io.exists('request-sent.json')) return { alreadyAttempted: true, policy: 'Inspect the saved response and current job; do not automatically resubmit' };
  const [{ job }, { artifact }] = await Promise.all([
    read(api, '/teaching/jobs/' + target.materialization),
    read(api, '/teaching/artifacts/' + target.artifact),
  ]);
  assert.equal(job.id, target.materialization);
  assert.equal(job.kind, 'artifact.materialize');
  assert.equal(job.status, 'SUCCEEDED');
  assert.equal(job.modelRoute?.actualModel, 'deepseek-v4-flash');
  assert.equal(job.modelRoute?.degraded, false);
  assert.equal(artifact.id, target.artifact);
  assert.equal(artifact.status, 'READY');
  assert.equal(artifact.currentRevision, target.revision);
  assert.equal(artifact.capabilities?.edit, true);
  const content = artifact.revision?.content?.lesson?.artifacts?.[0]?.content;
  assert.equal(content?.renderingMode, 'cinematic-v1');
  assert.equal(content.cinematicScene.nodes.filter(node => node.kind === 'model').length, 4);
  const page = await api.get(base + '/teacher/artifacts/' + target.artifact, { maxRetries: 1 });
  assert.equal(page.status(), 200);
  const nonce = /['"]csrfNonce['"]\s*:\s*"([^"\r\n]+)"/.exec(await page.text())?.[1];
  assert.ok(nonce && nonce.length < 256, 'Authenticated framework nonce unavailable');
  io.save('artifact-before.json', artifact);
  io.writeOnce('request-sent.json', { created: new Date().toISOString(), target, key, instruction });
  const response = await api.post(apiBase + '/teaching/artifacts/' + target.artifact + '/revise', {
    headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    data: { instruction, expectedRevision: target.revision, allowDegraded: false },
    maxRetries: 0,
  });
  const result = await response.json();
  io.save('response.json', { status: response.status(), result });
  assert.equal(response.status(), 202);
  assert.equal(result.success, true);
  assert.equal(result.data.job.kind, 'artifact.revise');
  assert.match(result.data.job.id, /^job_[a-f0-9]+$/);
  return { jobId: result.data.job.id, artifactId: target.artifact, status: result.data.job.status, expectedRevision: target.revision };
}

async function observe(api, io) {
  const receipt = io.load('response.json');
  assert.equal(receipt.status, 202);
  const jobId = receipt.result?.data?.job?.id;
  assert.match(jobId, /^job_[a-f0-9]+$/);
  const [{ job }, { artifact }] = await Promise.all([
    read(api, '/teaching/jobs/' + jobId), read(api, '/teaching/artifacts/' + target.artifact),
  ]);
  assert.equal(job.id, jobId);
  assert.equal(job.kind, 'artifact.revise');
  assert.equal(artifact.id, target.artifact);
  const summary = {
    observedAt: new Date().toISOString(), jobId, status: job.status, stage: job.stage,
    progress: job.progress, attemptCount: job.attemptCount, maxAttempts: job.maxAttempts,
    modelRoute: job.modelRoute, updated: job.updated, artifactId: artifact.id,
    artifactStatus: artifact.status, revision: artifact.currentRevision,
  };
  io.save('latest.json', { summary, result: job.result });
  io.save('artifact-latest.json', artifact);
  return summary;
}

async function retry(api, io, release = 'v13') {
  assert.ok(['v13', 'v14'].includes(release));
  const receipt = io.load('response.json');
  assert.equal(receipt.status, 202);
  assert.equal(receipt.result?.data?.job?.kind, 'artifact.revise');
  const jobId = receipt.result.data.job.id;
  assert.match(jobId, /^job_[a-f0-9]+$/);
  if (io.exists('retry-' + release + '-request-sent.json')) return { alreadyAttempted: true, jobId };
  const [{ job }, { artifact }] = await Promise.all([
    read(api, '/teaching/jobs/' + jobId), read(api, '/teaching/artifacts/' + target.artifact),
  ]);
  assert.equal(job.id, jobId);
  assert.equal(job.kind, 'artifact.revise');
  assert.ok((release === 'v14' ? ['FAILED', 'CANCELED'] : ['FAILED']).includes(job.status));
  assert.equal(job.modelRoute?.actualModel, 'deepseek-v4-flash');
  assert.equal(job.modelRoute?.degraded, false);
  assert.equal(artifact.id, target.artifact);
  assert.equal(artifact.currentRevision, target.revision);
  assert.equal(artifact.status, 'READY');
  assert.equal(artifact.capabilities?.edit, true);
  const page = await api.get(base + '/teacher/artifacts/' + target.artifact, { maxRetries: 1 });
  assert.equal(page.status(), 200);
  const nonce = /['"]csrfNonce['"]\s*:\s*"([^"\r\n]+)"/.exec(await page.text())?.[1];
  assert.ok(nonce && nonce.length < 256, 'Authenticated framework nonce unavailable');
  const retryKey = key + '-retry-' + release;
  io.save('retry-' + release + '-job-before.json', job);
  io.writeOnce('retry-' + release + '-request-sent.json', { created: new Date().toISOString(), jobId, target, key: retryKey });
  const response = await api.post(apiBase + '/teaching/jobs/' + jobId + '/retry', {
    headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' },
    data: { idempotencyKey: retryKey }, maxRetries: 0,
  });
  const result = await response.json();
  io.save('retry-' + release + '-response.json', { status: response.status(), result });
  assert.ok([200, 202].includes(response.status()));
  assert.equal(result.success, true);
  assert.equal(result.data.job.id, jobId);
  assert.equal(result.data.replacedInPlace, true);
  return { jobId, artifactId: target.artifact, status: result.data.job.status, replacedInPlace: true };
}

async function cancel(api, io) {
  const receipt = io.load('response.json');
  assert.equal(receipt.status, 202);
  const jobId = receipt.result?.data?.job?.id;
  assert.match(jobId, /^job_[a-f0-9]+$/);
  const { job } = await read(api, '/teaching/jobs/' + jobId);
  assert.equal(job.id, jobId);
  assert.equal(job.kind, 'artifact.revise');
  if (!['RUNNING', 'QUEUED'].includes(job.status)) return { jobId, status: job.status, action: 'none' };
  if (io.exists('cancel-contract-request.json')) return { jobId, status: job.status, alreadyAttempted: true };
  const { artifact } = await read(api, '/teaching/artifacts/' + target.artifact);
  assert.equal(artifact.id, target.artifact);
  assert.equal(artifact.currentRevision, target.revision);
  assert.equal(artifact.capabilities?.edit, true);
  const page = await api.get(base + '/teacher/artifacts/' + target.artifact, { maxRetries: 1 });
  assert.equal(page.status(), 200);
  const nonce = /['"]csrfNonce['"]\s*:\s*"([^"\r\n]+)"/.exec(await page.text())?.[1];
  assert.ok(nonce && nonce.length < 256, 'Authenticated framework nonce unavailable');
  io.save('cancel-contract-before.json', job);
  io.writeOnce('cancel-contract-request.json', { created: new Date().toISOString(), jobId, target, action: 'cancel-for-contract-fix' });
  const response = await api.delete(apiBase + '/teaching/jobs/' + jobId, {
    headers: { 'CSRF-Token': nonce, 'Content-Type': 'application/json' }, data: {}, maxRetries: 0,
  });
  const result = await response.json();
  io.save('cancel-contract-response.json', { status: response.status(), result });
  assert.equal(response.status(), 200);
  assert.equal(result.success, true);
  assert.equal(result.data.job.id, jobId);
  return { jobId, status: result.data.job.status, action: 'cancel-requested' };
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 1 && ['--submit', '--observe', '--watch', '--retry-after-v13', '--retry-after-v14', '--cancel-for-contract-fix'].includes(args[0]));
  const fs = require('node:fs'), path = require('node:path');
  const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'cache/cinematic-controls/phase-sync-v12');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const io = {
    exists: name => fs.existsSync(path.join(dir, name)),
    load: name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    save: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 }),
    writeOnce: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }),
  };
  const api = await request.newContext({ storageState: path.join(root, 'cache/acceptance/browser-state.json'), timeout: 20000 });
  try {
    if (args[0] === '--submit') { console.log(JSON.stringify(await submit(api, io))); return; }
    if (args[0].startsWith('--retry-after-')) { console.log(JSON.stringify(await retry(api, io, args[0].slice('--retry-after-'.length)))); return; }
    if (args[0] === '--cancel-for-contract-fix') { console.log(JSON.stringify(await cancel(api, io))); return; }
    let signature;
    for (let sample = 0; sample < (args[0] === '--watch' ? 240 : 1); sample++) {
      const summary = await observe(api, io), next = JSON.stringify({ ...summary, observedAt: null });
      if (next !== signature) { console.log(JSON.stringify(summary)); signature = next; }
      if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(summary.status)) return;
      if (args[0] === '--watch' && sample < 239) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally { await api.dispose(); }
}

module.exports = { target, base, apiBase, instruction, key, submit, observe, retry, cancel };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped phase revision check did not complete; inspect the private receipt and current job before any further action' }));
  process.exitCode = 1;
});
