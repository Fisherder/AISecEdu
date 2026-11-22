// Run with node --input-type=module inside the disposable agent-runtime container.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const model = 'teaching-fixture';
const secret = process.env.AISECEDU_SERVICE_SECRET;
assert.ok(typeof secret === 'string' && secret.trim().length >= 24, 'A fixture service credential is required');

const initialColors = {
  background: '#ffffff', foreground: '#172554', muted: '#334155',
  accent: '#1d4ed8', secondary: '#166534', surface: '#e2e8f0',
};
const expectedColors = {
  background: '#102531', foreground: '#f0fff9', muted: '#b6d9ca',
  accent: '#51ebc3', secondary: '#85aaff', surface: '#255248',
};
const page = {
  id: 'synthetic-release-fractions', schema: 'courseware-page-v2',
  title: 'Comparing fractions', objective: 'Compare shares of a common whole.',
  role: 'explanation', composition: 'wide', takeaway: 'Larger shares have larger bars.',
  supporting: [], beats: [], durationSeconds: 60,
  speakerNotes: 'PRIVATE_FIXTURE_WORKING_NOTES: Ask students to compare shares of an identical whole.',
  layout: {
    title: { box: { left: 30, top: 28, width: 940, height: 60 }, fontSize: 32, align: 'left' },
    takeaway: { box: { left: 30, top: 98, width: 940, height: 45 }, fontSize: 22, align: 'left' },
    supporting: [], visual: { left: 40, top: 165, width: 920, height: 348 },
  },
  visual: {
    kind: 'chart', chartType: 'bar', labels: ['One quarter', 'Three quarters'],
    series: [{ name: 'Percent of whole', values: [25, 75] }],
    unit: '%', basis: 'Synthetic fractions expressed as percentages.', illustrative: true,
  },
};
const theme = { name: 'Synthetic fractions', ...initialColors };
const artifact = {
  id: 'synthetic-release-artifact', type: 'slide', title: page.title, order: 0,
  content: {
    studio: { page, theme, assets: [] },
    background: { type: 'solid', color: initialColors.background },
    remark: 'PRIVATE_FIXTURE_REMARK',
  },
};
const job = {
  jobId: 'synthetic-release-palette', kind: 'artifact.revise',
  scope: { ownerId: 1, dojoId: 1, ordinaryTeaching: 'deck-revision' },
  modelRoute: { provider: 'deepseek', actual_model: model, required_model: model, allow_degraded: false },
  payload: {
    artifactType: 'slide-deck', revisionBackend: 'ordinary-deck-revision', artifactId: artifact.id,
    expectedRevision: 1, deckOperation: 'palette', instruction: '请将整个课件换成蓝绿色主题',
    sourceSnippet: 'PRIVATE_FIXTURE_SOURCE',
    currentContent: { lesson: { id: 'synthetic-release-lesson', title: page.title, artifacts: [artifact] } },
  },
};

function request(serviceToken) {
  return fetch('http://127.0.0.1:3000/agent-runtime/api/integration/jobs/ordinary-deck-revision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(serviceToken ? { 'X-AISecEdu-Service-Token': serviceToken } : {}),
    },
    body: JSON.stringify(job),
    redirect: 'manual',
    signal: AbortSignal.timeout(110_000),
  });
}

const anonymous = await request();
assert.equal(anonymous.status, 401, 'The palette route requires an internal service credential');
const response = await request(secret);
const result = await response.json();
assert.equal(response.status, 200, `Palette job failed (${result.errorCode ?? 'unknown'})`);
assert.equal(result.success, true);
assert.equal(result.model.actualModel, model);
assert.equal(result.model.executionMode, 'ordinary-deck-revision');
assert.equal(result.model.degraded, false);
assert.deepEqual(result.model.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
assert.equal(result.model.responseHash, createHash('sha256').update(JSON.stringify(result.result)).digest('hex'));

const { lesson, revisionMetadata } = result.result.content;
assert.equal(lesson.artifacts.length, 1);
const [revised] = lesson.artifacts;
assert.equal(revised.id, artifact.id);
assert.deepEqual(revised.content.studio, { page, assets: [], theme: { ...theme, ...expectedColors } });
assert.deepEqual(revised.content.background, { type: 'solid', color: expectedColors.background });
assert.equal(revised.content.remark, artifact.content.remark);
assert.equal(revisionMetadata.mode, 'ordinary-deck-revision');
assert.equal(revisionMetadata.operation, 'palette');
assert.equal(revisionMetadata.recomposed, false);
assert.deepEqual(revisionMetadata.pageIds, [page.id]);
assert.equal(revisionMetadata.renderEvidence.length, 1);

const [proof] = revisionMetadata.renderEvidence;
assert.equal(proof.pageId, page.id);
assert.equal(proof.mode, 'headless-chromium-dom-and-pixels');
assert.match(proof.sourceSha256, /^[a-f0-9]{64}$/);
assert.ok(Number.isFinite(Date.parse(proof.inspectedAt)));
assert.equal(proof.frames.length, 1);
const [frame] = proof.frames;
assert.equal(frame.step, -1);
assert.equal(frame.renderedCharts, 1, 'Chromium must render the actual chart');
assert.match(frame.screenshotSha256, /^[a-f0-9]{64}$/);
for (const expectedText of [page.title, page.takeaway]) {
  assert.ok(frame.text.some(item => item.text === expectedText && item.width > 0 && item.height > 0));
}

console.log(JSON.stringify({
  pageId: proof.pageId, model, palette: expectedColors, usage: result.model.usage,
  sourceSha256: proof.sourceSha256, screenshotSha256: frame.screenshotSha256,
}));
