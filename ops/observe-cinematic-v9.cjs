const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const targets = [
  { example: 1, job: 'job_de31ef062be0472483c295bbe61b048a', artifact: 'artifact_7356dac10ff44d27a103da6b39f9208b' },
  { example: 2, job: 'job_af3f6da7f8644907be4698f7d2670f44', artifact: 'artifact_1a218d1fed7a42d2b1928376e39c260c' },
];
const watch = process.argv.includes('--watch');
assert.ok(process.argv.slice(2).every(arg => ['--watch', '--once', '--release=v9', '--release=v10', '--release=v11', '--release=v12'].includes(arg)));
const releases = process.argv.slice(2).filter(arg => arg.startsWith('--release='));
assert.ok(releases.length <= 1);
const release = releases[0]?.slice('--release='.length) || 'v9';
const projectRoot = path.resolve(__dirname, '..');
const root = path.join(projectRoot, 'cache/cinematic-controls/retry-' + release);
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const dir = fs.mkdtempSync(path.join(root, 'observation-'));
const save = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
const states = new Map();

(async () => {
  const api = await request.newContext({ storageState: path.join(projectRoot, 'cache/acceptance/browser-state.json'), timeout: 20000 });
  try {
    const read = async route => {
      const response = await api.get('http://10.92.35.7:8080/pwncollege_api/v1' + route, { maxRetries: 1 });
      assert.equal(response.status(), 200, 'Scoped API HTTP ' + response.status());
      const result = await response.json();
      assert.equal(result.success, true);
      return result.data;
    };
    console.log(JSON.stringify({ evidence: dir, policy: 'Read-only API; original two v8 failed artifacts; no mutation or browser UI' }));
    for (let sample = 0; sample < (watch ? 180 : 1); sample++) {
      const current = await Promise.all(targets.map(async target => {
        const [{ job }, { artifact }] = await Promise.all([
          read('/teaching/jobs/' + target.job), read('/teaching/artifacts/' + target.artifact),
        ]);
        assert.equal(job.id, target.job);
        assert.equal(job.kind, 'artifact.materialize');
        assert.equal(artifact.id, target.artifact);
        const summary = {
          observedAt: new Date().toISOString(), example: target.example, jobId: job.id,
          status: job.status, stage: job.stage, progress: job.progress, attemptCount: job.attemptCount,
          maxAttempts: job.maxAttempts, modelRoute: job.modelRoute, updatedAt: job.updated,
          artifactId: artifact.id, artifactStatus: artifact.status, revision: artifact.currentRevision,
          title: artifact.title, hasLesson: Boolean(artifact.revision?.content?.lesson),
        };
        const signature = JSON.stringify({ ...summary, observedAt: null });
        if (states.get(target.example) !== signature) {
          states.set(target.example, signature);
          console.log(JSON.stringify(summary));
          save(`example-${target.example}-sample-${sample}.json`, { summary, result: job.result });
        }
        if (summary.hasLesson) save(`example-${target.example}-content.json`, {
          artifactId: artifact.id, title: artifact.title, revision: artifact.currentRevision,
          content: artifact.revision.content,
        });
        save(`example-${target.example}-latest.json`, { summary, result: job.result });
        return summary;
      }));
      if (current.every(item => ['SUCCEEDED', 'FAILED', 'CANCELED', 'COMPLETED'].includes(item.status))) break;
      if (watch && sample < 179) await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally { await api.dispose(); }
})().catch(error => { console.error(JSON.stringify({ failure: error.name, message: /^Scoped API HTTP \d+$/.test(error.message) ? error.message : 'Scoped observation failed; inspect server or saved receipt' })); process.exitCode = 1; });
