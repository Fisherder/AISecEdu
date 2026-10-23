const assert = require('node:assert/strict');
const target = Object.freeze({
  artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b',
  materialization: 'job_de31ef062be0472483c295bbe61b048a',
  revision: 2,
});
const base = 'http://10.92.35.7:8080';
const apiBase = base + '/pwncollege_api/v1';
const instruction = "请仅修正这份已有三维阀门作品的真实装配布局与取景，不改成二维、幻灯片或替代示例，保留原六个精细阀门/管路模型、法兰端口接合、七个教学阶段、剖切拆解复原、对照装置、独立示意标记及全部原教学要求。真实浏览器在24秒近景中发现：四个金色管夹位于管身下方而没有套住管身，自建支撑柱顶面与管身下缘有明显空隙，和章节说明不符。根因要按资产规范化后的真实端口/几何计算，不能把pipe-assembly根节点中心当成管身轴线。当前主装置上游管路世界轴线的Y约为-0.7967458836、Z约为2.2029295346，对照装置相同Y、Z约为-2.1970704654；请结合真实资产几何验证，而非照抄错误原始中心坐标。将各自两个管夹调整为与对应管路同轴，内径匹配管身外径且保留必要间隙；让圆柱支撑底面坐落共用基座、顶面真正承托管身下缘，必要时调整这些基础几何的尺寸与位置，同时保留比较装置显隐轨道。不要删除构件或只改说明来掩盖悬空。全部法兰仍须端口对齐。首尾全景应让装置更清晰地占据画面，同时完整覆盖应观察的主体，近景不要裁切所讲解构件；保留旋转、缩放、画质切换、时间轴及自由探索。原作品标题和其余正确内容保持不变，完成后仍为教师草稿。";
const key = 'cinematic-v15-valve-support-alignment-r2';

async function read(api, route) {
  const response = await api.get(apiBase + route, { maxRetries: 1 });
  assert.equal(response.status(), 200, 'Scoped API HTTP ' + response.status());
  const result = await response.json();
  assert.equal(result.success, true);
  return result.data;
}

async function submit(api, io, configuration = { target, instruction, key, status: 'READY', prerequisiteKind: 'artifact.materialize' }) {
  const { target, instruction, key, status, prerequisiteKind } = configuration;
  if (io.exists('request-sent.json')) return { alreadyAttempted: true, policy: 'Inspect the saved response and current job; do not automatically resubmit' };
  const [{ job }, { artifact }] = await Promise.all([
    read(api, '/teaching/jobs/' + target.materialization),
    read(api, '/teaching/artifacts/' + target.artifact),
  ]);
  assert.equal(job.id, target.materialization);
  assert.equal(job.kind, prerequisiteKind);
  assert.equal(job.status, 'SUCCEEDED');
  assert.equal(job.modelRoute?.actualModel, 'deepseek-v4-flash');
  assert.equal(job.modelRoute?.degraded, false);
  assert.equal(artifact.id, target.artifact);
  assert.equal(artifact.status, status);
  assert.equal(artifact.currentRevision, target.revision);
  assert.ok(!artifact.activeJob, 'An existing artifact job must finish first');
  assert.equal(artifact.capabilities?.edit, true);
  const content = artifact.revision?.content?.lesson?.artifacts?.[0]?.content;
  assert.equal(content?.renderingMode, 'cinematic-v1');
  assert.equal(content.cinematicScene.nodes.filter(node => node.kind === 'model').length, configuration.expectedModelCount ?? 6);
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

async function observe(api, io, configuration = { target }) {
  const { target } = configuration;
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


async function main() {
  assert.ok(process.argv.length === 3 && ['--submit', '--observe'].includes(process.argv[2]));
  const fs = require('node:fs'), path = require('node:path');
  const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const root = path.resolve(__dirname, '..');
  const dir = path.join(root, 'cache/cinematic-controls/valve-assembly-v15');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const io = {
    exists: name => fs.existsSync(path.join(dir, name)),
    load: name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')),
    save: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 }),
    writeOnce: (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' }),
  };
  const api = await request.newContext({ storageState: path.join(root, 'cache/acceptance/browser-state.json'), timeout: 20000 });
  try { console.log(JSON.stringify(await (process.argv[2] === '--submit' ? submit : observe)(api, io))); }
  finally { await api.dispose(); }
}

module.exports = { target, base, apiBase, instruction, key, submit, observe };
if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ failure: error.name, message: 'Scoped valve revision did not complete; inspect saved receipt before submitting again' }));
  process.exitCode = 1;
});
