// Real-browser regression: labels must remain next to small, transformed parts.
// Usage: PLAYWRIGHT_MODULE=... node tests/cinematic-label-bounds.cjs scene.html vendor.js output-directory
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [input, vendor, output] = process.argv.slice(2);
assert(input && vendor && output, 'Provide compiled HTML, cinematic Three.js vendor and an output directory');
(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.INSPECTOR_CHROMIUM_PATH ? {executablePath: process.env.INSPECTOR_CHROMIUM_PATH, chromiumSandbox: true} : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 960}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<body></body>');
    await page.addScriptTag({content: fs.readFileSync(vendor, 'utf8')});
    await page.setContent(fs.readFileSync(input, 'utf8').replace('<script src="aisecedu:three"></script>', ''));
    await page.waitForFunction(() => globalThis.__cinematic?.getState().renderer === 'webgl');
    const measurements = await page.evaluate(() => {
      const samples = [];
      for (const fraction of [.37, .51, .65, .82, .37]) {
        __cinematic.seek(__cinematic.scene.duration * fraction);
        const facts = __cinematic.getFrameDiagnostics(), height = facts.viewport[1];
        for (const label of document.querySelectorAll('.node-label:not([hidden])')) {
          const node = facts.nodes.find(node => node.id === label.dataset.nodeId);
          if (!node || node.kind !== 'cylinder') continue;
          samples.push({fraction, id: node.id, actualTop: parseFloat(label.style.top), expectedTop: (1 - node.ndc.top) * height / 2});
        }
      }
      return samples;
    });
    assert(measurements.length >= 4, 'The regression needs visible labels on small components');
    for (const sample of measurements) assert(Math.abs(sample.actualTop - sample.expectedTop) < 1, JSON.stringify(sample));
    assert.deepEqual(measurements.filter(sample => sample.fraction === .37).slice(0, measurements.filter(sample => sample.fraction === .37).length / 2), measurements.filter(sample => sample.fraction === .37).slice(measurements.filter(sample => sample.fraction === .37).length / 2));
    assert.deepEqual(errors, []);
    fs.mkdirSync(output, {recursive: true});
    await page.evaluate(() => __cinematic.seek(__cinematic.scene.duration * .65));
    await page.screenshot({path: path.join(output, 'labels.png')});
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({passed: true, measurements, errors}, null, 2));
    console.log(JSON.stringify({passed: true, measuredLabels: measurements.length, errors}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
