const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const project = path.resolve(__dirname, '..');
const rootDir = path.join(project, 'cache/cinematic-controls/generated/example-1');
const attemptArg = process.argv.find(value => value.startsWith('--attempt='));
assert.ok(!attemptArg || /^--attempt=[1-5]$/.test(attemptArg));
const attemptNumber = attemptArg ? Number(attemptArg.slice('--attempt='.length)) : null;
const dir = attemptNumber && attemptNumber > 1 ? path.join(rootDir, 'attempt-' + attemptNumber) : rootDir;
const generation = attemptNumber ? JSON.parse(fs.readFileSync(path.join(dir, 'generation.json'), 'utf8')) : null;
if (generation) {
  assert.equal(generation.index, 1);
  if (attemptNumber > 1) assert.equal(generation.attemptNumber, attemptNumber);
  assert.ok(generation.selectedAt && generation.artifactId && generation.jobs?.length, 'Observe a selected, already submitted generation only');
}
const outputRoot = attemptNumber ? path.join(dir, 'observation') : path.join(dir, 'v6-observation');
fs.mkdirSync(outputRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(outputRoot, 'run-'));
let jobId = generation ? generation.jobs.at(-1) : 'job_4adb204d66a949ce8b641592767b47da';
const artifactId = generation ? generation.artifactId : 'artifact_2400662e25b444dd98c6a9ca54faba6f';
const threadId = generation ? generation.threadId : 'thread_7b9f8ab313154828896f4eb5267026fc';
const report = { started: new Date().toISOString(), attemptNumber, candidateJobId: generation ? jobId : null, jobId, artifactId, threadId, outputDirectory: output, observations: [], requestErrors: [], submittedMutations: 0, outcome: 'OBSERVING' };
const requestedDeadline = process.argv.find(value => value.startsWith('--deadline='))?.slice('--deadline='.length);
const deadline = Math.min(Date.now() + 600000, requestedDeadline ? Date.parse(requestedDeadline) : Infinity);
assert.ok(Number.isFinite(deadline));
const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2));

(async () => {
  const api = await request.newContext({ storageState: path.join(project, 'cache/acceptance/browser-state.json') });
  const read = async route => {
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, 'Observation deadline reached');
    const response = await api.get('http://10.92.35.7:8080/pwncollege_api/v1' + route, { timeout: Math.min(15000, remaining) });
    assert.equal(response.status(), 200, route);
    return (await response.json()).data;
  };
  try {
    let previous;
    while (Date.now() < deadline) {
      let data;
      try { data = await read('/teaching/jobs/' + jobId); }
      catch (error) { report.requestErrors.push({ at: new Date().toISOString(), error: error.message }); }
      if (data) {
        const job = data.job;
        assert.equal(job.id, jobId);
        assert.equal(job.threadId, threadId);
        save(job.id + '.json', data);
        if (job.result?.materializationJobId && job.kind !== 'artifact.materialize') {
          assert.equal(job.result.artifactId, artifactId);
          report.candidateJob = job;
          jobId = job.result.materializationJobId;
          report.jobId = jobId;
          previous = undefined;
          save('observation-report.json', report);
          console.log(JSON.stringify({ observingMaterialization: jobId, artifactId, outputDirectory: output }));
          continue;
        }
        const observation = { at: new Date().toISOString(), jobId: job.id, status: job.status, stage: job.stage, progress: job.progress, attemptCount: job.attemptCount, modelRoute: job.modelRoute, updated: job.updated, completed: job.completed, error: job.error };
        report.observations.push(observation);
        const signature = JSON.stringify([job.status, job.stage, job.progress, job.attemptCount, job.modelRoute]);
        save('job-latest.json', data);
        if (signature !== previous) {
          save('job-observation-' + report.observations.length + '.json', data);
          console.log(JSON.stringify(observation));
          previous = signature;
        }
        save('observation-report.json', report);
        if (['SUCCEEDED', 'FAILED', 'CANCELED'].includes(job.status)) {
          report.outcome = job.status;
          report.terminalJob = job;
          save('job-terminal.json', data);
          const artifactData = await read('/teaching/artifacts/' + artifactId);
          assert.equal(artifactData.artifact.id, artifactId);
          save('artifact-terminal.json', artifactData);
          report.artifactStatus = artifactData.artifact.status;
          report.currentRevision = artifactData.artifact.currentRevision;
          const contents = artifactData.artifact.revision?.content?.lesson?.artifacts?.map(item => item.content) || [];
          report.contentSummary = contents.map(content => ({ renderingMode: content.renderingMode, hasSceneIR: Boolean(content.cinematicScene), hasHTML: Boolean(content.html) }));
          if (job.status === 'SUCCEEDED') {
            save('artifact.json', artifactData.artifact);
          }
          save('thread-terminal.json', await read('/teaching/threads/' + threadId));
          break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(15000, Math.max(0, deadline - Date.now()))));
    }
    if (report.outcome === 'OBSERVING') report.outcome = 'TIME_LIMIT_NO_RESUBMISSION';
  } catch (error) {
    report.observerFailure = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    report.finished = new Date().toISOString();
    save('observation-report.json', report);
    await api.dispose();
  }
  console.log(JSON.stringify({ outcome: report.outcome, artifactStatus: report.artifactStatus, currentRevision: report.currentRevision, observerFailure: report.observerFailure, report: path.join(output, 'observation-report.json') }));
})().catch(error => { console.error(error); process.exitCode = 1; });
