import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.DOJO_BASE || 'http://10.92.35.7:8080';
const OUT_DIR = '/srv/aisecedu-dojo/.cache/construction';
const OUT_FILE = `${OUT_DIR}/accounts.json`;
const PASSWORD = process.env.CONSTRUCTION_TEACHER_PASSWORD;
if (!PASSWORD) throw new Error('Set CONSTRUCTION_TEACHER_PASSWORD before provisioning test teachers.');;
const PORT = Number(process.env.CDP_PORT || 9225);

export const TEACHERS = [
  { key: 'lead', name: 'build-lead', role: 'coordinator', realName: '建设统筹·李老师', course: '计算机网络基础' },
  { key: 'author', name: 'build-author', role: 'author', realName: '课件创作·王老师', course: '网络课程创作空间' },
  { key: 'peer', name: 'build-peer', role: 'reviewer', realName: '同行复核·赵老师', course: '网络课程互审空间' },
  { key: 'final', name: 'build-final', role: 'reviewer', realName: '课程终审·陈老师', course: '网络课程终审空间' },
];

async function register(page, teacher) {
  await page.goto(`${BASE}/register`);
  await page.check('input[name="role"][value="teacher"]');
  await page.fill('#name', teacher.name);
  await page.fill('#email', `${teacher.name}@example.invalid`);
  await page.fill('#password', PASSWORD);
  await page.check('#commitment-input');
  await page.click('#register-submit');
  await delay(2500);
  const body = await page.text('body');
  if (await page.url().then(u => u.includes('/register'))) {
    throw new Error(`注册失败 ${teacher.name}: ${body.slice(0, 200)}`);
  }
}

async function login(page, teacher) {
  await page.goto(`${BASE}/login`);
  await page.fill('#name', teacher.name);
  await page.fill('#password', PASSWORD);
  await page.click('#_submit');
  await delay(2500);
  if ((await page.url()).includes('/login')) throw new Error(`登录失败 ${teacher.name}`);
}

async function createCourse(page, teacher) {
  await page.goto(`${BASE}/teacher/courses/new`);
  await page.waitForReady();
  await page.fill('#manual-name', teacher.course);
  await page.fill('#manual-description', `${teacher.course}——建设任务端到端测试使用的教师创作空间。`);
  await page.check('input[name="access"][value="private"]');
  await page.click('#manual-primary-submit');
  await page.waitFor(
    `document.body.innerText.includes('已创建') || document.body.innerText.includes('失败')`,
    { timeout: 30000, message: '等待课程创建结果' },
  );
  const text = await page.text('body');
  if (!text.includes('已创建')) throw new Error(`课程创建失败：${text.slice(-400)}`);
  const href = await page.evaluate(`(() => {
    const a = [...document.querySelectorAll('a')].find(x => (x.getAttribute('href')||'').includes('/teacher/courses?dojo='));
    return a ? a.getAttribute('href') : null;
  })()`);
  return { href, reference: href ? decodeURIComponent(new URL(href, BASE).searchParams.get('dojo')) : null };
}

const browser = await Browser.launch({ port: PORT, profileDir: `${OUT_DIR}/chrome-teachers` });
mkdirSync(OUT_DIR, { recursive: true });
const results = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : {};

try {
  for (const teacher of TEACHERS) {
    console.log(`--- ${teacher.name} ---`);
    const page = await browser.newPage();
    try {
      await page.clearCookies();
      await page.goto(`${BASE}/login`);
      await page.fill('#name', teacher.name);
      await page.fill('#password', PASSWORD);
      await page.click('#_submit');
      await delay(2000);
      if ((await page.url()).includes('/login')) {
        console.log('  not registered, registering…');
        await register(page, teacher);
      } else {
        console.log('  login ok');
      }
      const { href, reference } = await createCourse(page, teacher);
      results[teacher.key] = { ...teacher, password: PASSWORD, courseReference: reference, courseHref: href };
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      console.log(`  courseReference=${reference}`);
      await page.screenshot(`${OUT_DIR}/teacher-${teacher.key}.png`);
    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      console.error('  page errors:', page.errors().slice(0, 3));
      throw error;
    } finally {
      await page.send('Target.closeTarget', { targetId: page.targetId }).catch(() => {});
    }
  }
  console.log('\n=== accounts ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
