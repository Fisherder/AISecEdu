// Run with installed agent-runtime dependencies and Chromium:
// node test/browser/tutor-teaching-image.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../..');
const runtimeRequire = createRequire(resolve(root, 'services/agent-runtime/package.json'));
const { chromium } = runtimeRequire('@playwright/test');
const scripts = resolve(root, 'dojo_theme/static/js/dojo');
const source = readFileSync(resolve(scripts, 'learning-tutor.js'), 'utf8');
for (const alias of ['learning-tutor.dev.js', 'learning-tutor.min.js']) {
  assert.equal(readFileSync(resolve(scripts, alias), 'utf8'), source);
}
const markup = readFileSync(resolve(root, 'dojo_theme/templates/components/learning_tutor.html'), 'utf8')
  .replace(/\{%[^%]+%\}/g, '').replace(/\{\{[^}]+\}\}/g, 'synthetic');

const browserSetup = `
  window.fixture = { requests: [], posts: [], gets: [], turns: [] };
  const queue = function(list, metadata) {
    return new Promise((resolve, reject) => list.push({resolve, reject, metadata}));
  };
  window.DojoLearning = {
    request(path, options) {
      fixture.requests.push(path);
      return queue(fixture.gets, options);
    },
    json(method, path, body, options) {
      fixture.posts.push({method, path, body, options});
      return queue(fixture.turns);
    },
    escapeHtml(value) {
      const node = document.createElement('div');
      node.textContent = value;
      return node.innerHTML;
    },
    errorMessage(value, fallback) { return value.error || fallback; },
  };
`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const network = [];
    await page.route('**/*', async route => {
      network.push(route.request().url());
      await route.abort();
    });
    await page.setContent('<!doctype html>' + markup + '<script>' + browserSetup + '</script><script>' + source + '</script>');
    const selector = page.locator('[data-tutor-illustration]');
    const checkbox = page.locator('[data-tutor-image-consent]');
    const group = page.locator('[data-tutor-image-options]');
    const notice = page.locator('[data-tutor-image-notice]');
    const question = page.locator('[data-tutor-question]');
    const send = page.locator('[data-tutor-send]');
    const count = kind => page.evaluate(name => fixture[name].length, kind);
    const posts = () => page.evaluate(() => fixture.posts);
    const waitForCount = (kind, length) => page.waitForFunction(([name, count]) => fixture[name].length === count, [kind, length]);
    const resolveGet = (index, value) => page.evaluate(([n, body]) => fixture.gets[n].resolve(body), [index, value]);
    const resolveTurn = (index, value) => page.evaluate(([n, body]) => fixture.turns[n].resolve(body), [index, value]);
    const navigate = () => page.evaluate(() => window.dispatchEvent(new Event('dojo:attempt-changed')));
    const deck = {
      attempt: { id:'attempt-a', epoch:2, dojoId:'plants', moduleId:'water', challengeId:'observations', tutorMessages:[] },
      success:true,
      illustrations:[
        { classroomId:'published-plants', revision:7, pageId:'leaf', label:'叶片图' },
        { classroomId:'published-plants', revision:7, pageId:'stem', label:'茎的插图', dataUrl:'PRIVATE-NOT-PACKET' },
      ],
    };

    await page.locator('.learning-tutor-toggle').click();
    await waitForCount('gets',1);
    await resolveGet(0,deck);
    assert.match(await page.locator('[data-tutor-full-link]').getAttribute('href'), /course=plants/);
    await selector.selectOption('0');
    await question.fill('说明这张插图');
    await send.click();
    assert.equal(await count('posts'),0);
    assert.match(await notice.textContent(), /请确认发送所选插图/);
    assert.equal(await checkbox.evaluate(node => document.activeElement === node),true);
    await checkbox.check();
    await selector.selectOption('1');
    assert.equal(await checkbox.isChecked(),false);
    await checkbox.check();
    await send.click();
    await waitForCount('posts',1);
    assert.equal(await selector.inputValue(),'');
    assert.equal(await checkbox.isChecked(),false);
    await send.dispatchEvent('click');
    assert.equal(await count('posts'),1);
    assert.deepEqual((await posts())[0], {
      method:'POST', path:'/learning/tutor',
      body:{question:'说明这张插图',attemptId:'attempt-a',
        teachingImage:{classroomId:'published-plants',revision:7,pageId:'stem',consent:true}},
      options:{timeoutMs:240000,retries:0},
    });

    await resolveTurn(0,{success:true,reply:{teachingImage:{sent:false,note:'图像未发送，请参考文字答复。'}}});
    await waitForCount('gets',2);
    await resolveGet(1,deck);
    assert.equal(await notice.textContent(),'图像未发送，请参考文字答复。');
    await selector.selectOption('0');
    await checkbox.check();
    await question.fill('确认后再询问');
    await send.click();
    await waitForCount('posts',2);
    await page.evaluate(() => fixture.turns[1].reject(new Error('synthetic offline')));
    await page.waitForFunction(() => !document.querySelector('[data-tutor-send]').disabled);
    assert.equal(await selector.inputValue(),'');
    assert.equal(await checkbox.isChecked(),false);
    await send.click();
    await waitForCount('posts',3);
    assert.deepEqual((await posts())[2].body,{question:'确认后再询问',attemptId:'attempt-a'});

    await navigate();
    await waitForCount('gets',3);
    await navigate();
    await waitForCount('gets',4);
    const next = {success:true,attempt:{id:'attempt-b',epoch:3,tutorMessages:[]},illustrations:[]};
    await resolveGet(3,next);
    await resolveGet(2,deck);
    await resolveTurn(2,{success:true,reply:{teachingImage:{sent:true}}});
    await page.waitForFunction(() => !document.querySelector('[data-tutor-send]').disabled);
    assert.equal(await count('gets'),4);
    assert.equal(await group.isHidden(),true);
    assert.equal(await question.inputValue(),'');
    await question.fill('仅文字');
    await send.click();
    await waitForCount('posts',4);
    assert.deepEqual((await posts())[3].body,{question:'仅文字',attemptId:'attempt-b'});
    await resolveTurn(3,{success:true,reply:{}});
    await waitForCount('gets',5);
    await resolveGet(4,deck);
    await selector.selectOption('0');
    await checkbox.check();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await group.isHidden(),true);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
    await waitForCount('gets',6);
    await resolveGet(5,deck);
    assert.equal(await selector.inputValue(),'');
    assert.equal(await checkbox.isChecked(),false);
    assert.ok((await page.evaluate(() => fixture.requests)).every(path => path === '/learning/tutor/context'));
    assert.deepEqual(network,[]);
    console.log('Tutor teaching image browser regression passed');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
