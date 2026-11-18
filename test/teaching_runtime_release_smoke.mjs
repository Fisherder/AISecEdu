// Run against the two production images on an isolated CI network.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function fixtureOrigin(value, hosts, segment) {
  assert.ok(value, 'A fixture service origin is required');
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && hosts.includes(url.hostname), 'Use only the internal CI fixture services');
  assert.ok(!url.username && !url.password && !url.search && !url.hash, 'Fixture origins must contain no credentials or query');
  assert.ok(url.pathname.replace(/\/$/, '') === segment, 'Incorrect fixture service base path');
  return url.origin + segment;
}

const loopback = ['127.0.0.1', 'localhost', '[::1]'];
const runtime = fixtureOrigin(process.env.NEXT_RUNTIME_ORIGIN, [...loopback, 'agent-runtime'], '/agent-runtime');
const inspector = fixtureOrigin(process.env.COURSEWARE_INSPECTOR_ORIGIN, [...loopback, 'courseware-inspector'], '');
const secret = process.env.AISECEDU_SERVICE_SECRET;
assert.ok(typeof secret === 'string' && secret.trim().length >= 24, 'An internal fixture service credential is required');
const service = { 'X-AISecEdu-Service-Token': secret };
const digest = (value) => createHash('sha256').update(value).digest('hex');

const chart = {
  theme: {
    name: 'Synthetic fractions', background: '#ffffff', foreground: '#172554', muted: '#334155',
    accent: '#1d4ed8', secondary: '#166534', surface: '#e2e8f0',
  },
  assets: [],
  page: {
    id: 'synthetic-release-fractions', schema: 'courseware-page-v2',
    title: 'Comparing fractions', objective: 'Compare shares of a common whole.',
    role: 'explanation', composition: 'wide', takeaway: 'Larger shares have larger bars.',
    supporting: [], beats: [], durationSeconds: 60,
    speakerNotes: 'Ask students to compare shares of an identical whole by reading the bars and explaining which share is larger.',
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
  },
};

function request(url, init = {}) {
  return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(85_000) });
}

async function inspect(payload) {
  const body = JSON.stringify(payload);
  const reply = await request(inspector + '/inspect', {
    method: 'POST', headers: { ...service, 'Content-Type': 'application/json' }, body,
  });
  assert.equal(reply.status, 200, 'The production Chromium inspection must complete');
  const { issues, evidence } = await reply.json();
  assert.deepEqual(issues, [], 'The synthetic page must pass browser inspection');
  assert.equal(evidence.mode, 'headless-chromium-dom-and-pixels');
  assert.equal(evidence.sourceSha256, digest(body), 'Inspection must bind the exact synthetic input');
  assert.ok(Number.isFinite(Date.parse(evidence.inspectedAt)), 'The inspection receipt needs a timestamp');
  assert.equal(evidence.frames.length, 1, 'An ordinary static slide has only its initial frame');
  const [frame] = evidence.frames;
  assert.equal(frame.step, -1);
  assert.equal(frame.renderedCharts, 1, 'The chart must render to Chromium SVG or canvas');
  assert.match(frame.screenshotSha256, /^[0-9a-f]{64}$/);
  for (const expected of [payload.page.title, payload.page.takeaway]) {
    assert.ok(frame.text.some((item) => item.text === expected && item.width > 0 && item.height > 0),
      'The inspector must locate the visible synthetic title and takeaway');
  }
  return { sourceSha256: evidence.sourceSha256, screenshotSha256: frame.screenshotSha256 };
}

const runtimeHealth = await request(runtime + '/api/health');
assert.equal(runtimeHealth.status, 200, 'Production runtime health must be reachable under /agent-runtime');
const inspectorHealth = await request(inspector + '/health', { headers: service });
assert.equal(inspectorHealth.status, 200, 'Authenticated production inspector health must be reachable');

const anonymousLesson = await request(runtime + '/api/lessons/synthetic-release-fractions');
assert.equal(anonymousLesson.status, 401);
assert.equal((await anonymousLesson.json()).errorCode, 'AISECEDU_SESSION_REQUIRED');

const render = runtime + '/internal/courseware-render';
const anonymousRender = await request(render);
if (anonymousRender.status === 307) {
  const target = new URL(anonymousRender.headers.get('location'), runtime);
  assert.equal(target.pathname, '/teacher');
  assert.equal(target.searchParams.get('agentSession'), 'required');
} else {
  assert.equal(anonymousRender.status, 401);
}
const authorizedRender = await request(render, { headers: service });
assert.equal(authorizedRender.status, 200);
assert.match(authorizedRender.headers.get('content-type') ?? '', /text\/html/);
assert.match(await authorizedRender.text(), /data-courseware-render-surface/);

const anonymousInspect = await request(inspector + '/inspect', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chart),
});
assert.equal(anonymousInspect.status, 403);

const original = await inspect(chart);
const changed = structuredClone(chart);
changed.page.visual.series[0].values = [50, 75];
const variant = await inspect(changed);
assert.notEqual(variant.screenshotSha256, original.screenshotSha256, 'Changing only a chart value must change the rendered pixels');

console.log(JSON.stringify({
  runtimeHealth: runtimeHealth.status,
  inspectorHealth: inspectorHealth.status,
  anonymousLesson: anonymousLesson.status,
  anonymousRender: anonymousRender.status,
  anonymousInspect: anonymousInspect.status,
  authenticatedRender: authorizedRender.status,
  chromiumMode: 'headless-chromium-dom-and-pixels',
  renderedChart: true,
  chartPixelChange: true,
  original,
  variant,
}));
