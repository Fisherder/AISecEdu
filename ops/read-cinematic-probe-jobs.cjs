const fs = require('node:fs');
const { request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://10.92.35.7:8080/pwncollege_api/v1';
const redact = value => String(value || '').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]{12,}/g, '[redacted]').slice(0, 1000);

(async () => {
  const api = await request.newContext({ storageState: 'cache/acceptance/browser-state.json', timeout: 20000 });
  try {
    for (let example = 1; example <= 3; example++) {
      const file = `cache/cinematic-controls/generated/example-${example}/generation.json`;
      if (!fs.existsSync(file)) continue;
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const id of report.jobs || []) {
        const response = await api.get(`${base}/teaching/jobs/${id}`, { maxRetries: 2 });
        if (response.status() !== 200) { console.log(JSON.stringify({ example, id, http: response.status() })); continue; }
        const job = (await response.json()).data.job;
        console.log(JSON.stringify({ example, id, kind: job.kind, status: job.status, stage: job.stage, progress: job.progress, error: redact(job.error), model: job.model, updated: job.updatedAt || job.updated }));
      }
    }
  } finally { await api.dispose(); }
})().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
