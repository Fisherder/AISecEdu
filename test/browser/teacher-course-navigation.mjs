import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Browser} from './cdp.mjs';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');
const [template, courses, selection, styles] = await Promise.all([
  read('dojo_theme/templates/teacher_courses.html'),
  read('dojo_theme/static/js/dojo/teacher-courses.js'),
  read('dojo_theme/static/js/dojo/core/bulk-selection.js'),
  read('dojo_theme/static/css/course-hub.css'),
]);
const markup = template.split('{% block content %}')[1].split('{% endblock %}')[0];
const html = `<!doctype html><meta charset="utf-8"><style>${styles}</style>
<body class="teacher-course-center-page">${markup}
<script>
const courseRows = [{id: 1, referenceId: 'alpha', name: 'Course Alpha'}, {id: 2, referenceId: 'beta', name: 'Course Beta'}];
const pending = new Map();
const mutations = [];
let confirmRotation;
const success = data => ({success: true, data});
const hold = key => new Promise(resolve => pending.set(key, resolve));
const finish = (key, data) => { pending.get(key)(success(data)); pending.delete(key); };
const go = url => { history.pushState(null, '', url); dispatchEvent(new PopStateEvent('popstate')); };
window.AISecEduUI = {confirm: () => new Promise(resolve => { confirmRotation = resolve; }), notify() {}};
window.DojoLearning = {
  escapeHtml: value => { const node = document.createElement('div'); node.textContent = value ?? ''; return node.innerHTML; },
  showNotice: (node, message) => { node.textContent = message; node.hidden = !message; },
  errorMessage: (_, fallback) => fallback,
  request: async path => {
    const {pathname, searchParams} = new URL(path, location.origin);
    if (pathname === '/teaching/courses') return success({items: courseRows});
    const course = courseRows.find(row => pathname.split('/').includes(row.referenceId));
    if (pathname.endsWith('/workspace')) {
      return success({course, materials: [{id: course.id, title: course.name + ' material'}]});
    }
    if (pathname.endsWith('/assignments')) return success({assignments: []});
    if (pathname.endsWith('/content')) return hold(course.referenceId + ':' + searchParams.get('kind'));
    throw new Error('Unexpected fixture request ' + path);
  },
  json: async (method, path, body) => {
    const course = path.split('/')[3];
    mutations.push({method, course, regenerate: body.regenerate});
    return hold(course + ':code');
  },
};
</script><script src="/selection.js"></script><script src="/courses.js"></script>`;
const assets = {'/selection.js': selection, '/courses.js': courses};
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/teacher/courses') {
    response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}).end(html);
  } else if (assets[url.pathname]) {
    response.writeHead(200, {'Content-Type': 'text/javascript; charset=utf-8'}).end(assets[url.pathname]);
  } else {
    response.writeHead(404).end();
  }
});

const profileDir = await mkdtemp(join(tmpdir(), 'teacher-courses-'));
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await Browser.launch({port: Number(process.env.CHROME_DEBUG_PORT || 9232), profileDir});
  for (const width of [1440, 390]) {
    const page = await browser.newPage({width, height: 900});
    await page.goto(`http://127.0.0.1:${server.address().port}/teacher/courses`);
    await page.waitFor('document.querySelector("[data-course-card=alpha] a")', {timeout: 5000});
    await page.evaluate(() => document.querySelector('[data-course-card=alpha] a').click());
    await page.waitFor('location.search.includes("dojo=alpha")', {timeout: 5000});
    await page.evaluate(() => {
      document.querySelector('[data-cs-tab=courseware]').click();
      document.querySelector('[data-cs-tab=questions]').click();
      document.querySelector('#cs-course-code-trigger').click();
    });
    await page.waitFor('["materials", "courseware", "questions", "code"].every(key => pending.has("alpha:" + key))', {timeout: 5000});

    await page.evaluate(() => go('/teacher/courses?dojo=beta'));
    await page.waitFor('document.querySelector("#cs-course-title").textContent === "Course Beta" && !document.querySelector(".course-hub-main").hidden', {timeout: 5000});
    await page.evaluate(() => document.querySelector('#cs-course-code-trigger').click());
    await page.waitFor('pending.has("beta:code")', {timeout: 5000});
    await page.evaluate(async () => {
      finish('beta:code', {code: 'BETA-CODE'});
      finish('alpha:materials', {items: [{id: 1, title: 'Late Alpha material'}]});
      finish('alpha:courseware', {items: []});
      finish('alpha:questions', {items: [], counts: {total: 99}});
      finish('alpha:code', {code: 'ALPHA-CODE'});
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.match(await page.evaluate(() => document.querySelector('#cs-material-list').textContent), /Course Beta material/);
    assert.equal(await page.evaluate(() => document.querySelector('#cs-question-result-count').textContent.includes('99')), false);
    assert.equal(await page.text('#cs-course-code'), 'BETA-CODE');
    assert.equal(await page.evaluate(() => document.querySelector('#cs-material-list').hasAttribute('aria-busy')), false);

    await page.evaluate(() => document.querySelector('#cs-regenerate-course-code').click());
    await page.waitFor('typeof confirmRotation === "function"', {timeout: 5000});
    await page.evaluate(() => go('/teacher/courses?dojo=alpha'));
    await page.waitFor('document.querySelector("#cs-course-title").textContent === "Course Alpha" && !document.querySelector(".course-hub-main").hidden', {timeout: 5000});
    await page.evaluate(async () => {
      confirmRotation(true);
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(await page.evaluate(() => mutations.some(item => item.regenerate)), false);
    assert.deepEqual(page.pageErrors, []);
    await browser.closePage(page);
  }
  console.log('Teacher course navigation keeps delayed content, course codes and confirmations in their originating workspace.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profileDir, {recursive: true, force: true});
}
