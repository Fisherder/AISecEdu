import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.DOJO_BASE || 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const SHOTS = `${DIR}/shots`;
mkdirSync(SHOTS, { recursive: true });
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const PORT = Number(process.env.CDP_PORT || 9330);

const MODE = process.env.MODE || 'dark';
const PALETTE = MODE === 'dark' ? 'midnight' : 'academy';

const ADMIN = process.env.ADMIN === '1';
const PAGES = ADMIN ? [
  ['/admin', '平台总览'],
  ['/admin/users', '用户管理'],
  ['/admin/dojos', '课程管理'],
  ['/admin/challenges', '题目管理'],
  ['/admin/submissions', '提交管理'],
  ['/admin/config', '平台配置'],
] : [
  ['/teacher/construction', '建设任务中心'],
  ['/teacher/library', '素材库'],
  ['/teacher/projects', '生成项目合集'],
  ['/teacher/courses', '教师课程中心'],
  ['/teacher/courses/new', '新建课程'],
  ['/teacher', 'AI 共创'],
];

const SCAN = `(() => {
  const parse = value => {
    const m = String(value).match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const opaque = el => {
    let node = el;
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg;
      node = node.parentElement;
    }
    return parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const path = el => {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 5) {
      let s = node.tagName.toLowerCase();
      if (node.id) s += '#' + node.id;
      else if (node.className && typeof node.className === 'string') s += '.' + node.className.trim().split(/\\s+/).slice(0, 2).join('.');
      parts.unshift(s);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.3) continue;
    const bg = opaque(el);
    const size = parseFloat(cs.fontSize) || 16;
    const weight = +cs.fontWeight || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const min = large ? 3 : 4.5;
    const value = ratio(fg, bg);
    if (value < min) {
      out.push({ selector: path(el), ratio: Math.round(value * 100) / 100, min,
                 color: cs.color, bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')',
                 size: Math.round(size), text: (el.textContent || '').trim().slice(0, 40) });
    }
  }
  return out;
})()`;

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-contrast-${process.pid}` });
const page = await browser.newPage();
const report = {};
let failures = 0;

try {
  await page.goto(`${BASE}/login`);
  if (ADMIN) {
    await page.fill('#name', process.env.ADMIN_USER || 'admin');
    await page.fill('#password', process.env.ADMIN_PASSWORD);
  } else {
    await page.fill('#name', accounts.author.name);
    await page.fill('#password', accounts.author.newPassword);
  }
  await page.click('#_submit');
  await delay(2500);

  for (const [path, label] of PAGES) {
    await page.goto(`${BASE}${path}`);
    await page.evaluate(`(() => {
      document.documentElement.dataset.aiseceduPalette = '${PALETTE}';
      document.documentElement.dataset.aiseceduTheme = '${MODE}';
      document.documentElement.style.colorScheme = '${MODE}';
    })()`);
    await delay(2500);
    const violations = await page.evaluate(SCAN);
    report[label] = violations;
    const worst = violations.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 4);
    console.log(`${violations.length === 0 ? 'PASS' : 'FAIL'}  ${label}（${MODE === 'dark' ? '深色' : '浅色'}）— 低对比元素 ${violations.length} 个`);
    for (const v of worst) {
      console.log(`        ${v.ratio} (需 ${v.min}) ${v.selector}  ${v.color} on ${v.bg}  「${v.text}」`);
    }
    if (violations.length) {
      failures += violations.length;
      await page.screenshot(`${SHOTS}/50-dark-${path.replace(/[^a-z]+/gi, '-')}.png`).catch(() => {});
    }
  }

  writeFileSync(`${DIR}/contrast-report-${MODE}${ADMIN ? '-admin' : ''}.json`, JSON.stringify(report, null, 2));
  console.log(`\n合计低对比元素：${failures}`);
  if (failures) process.exitCode = 2;
} catch (error) {
  console.error('FATAL:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
