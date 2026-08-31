// Test cybersecurity outline generation across multiple courses.
// POSTs to /api/generate/scene-outlines-stream with subjectProfile + courseId,
// parses the SSE stream, prints courseTitle / languageDirective / scene types.
const BASE = 'http://localhost:3001';
const COURSES = [
  ['网络安全', 'DDoS攻击原理与防护'],
  ['软件安全', '栈溢出与控制流劫持'],
  ['操作系统', '访问控制与权限安全'],
  ['现代密码学', '公钥密码 RSA 原理'],
  ['汇编语言与逆向工程', '恶意代码静态分析流程'],
];

async function genOne(courseId, topic) {
  const res = await fetch(`${BASE}/api/generate/scene-outlines-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requirements: {
        requirement: `为《${courseId}》课程的「${topic}」生成一节互动课堂`,
        subjectProfile: 'cybersecurity',
        courseId,
      },
    }),
  });
  if (!res.ok || !res.body) return { error: `HTTP ${res.status}` };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let courseTitle = '', languageDirective = '';
  const outlines = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const m = line.match(/^data: (.+)$/);
      if (!m) continue;
      try {
        const evt = JSON.parse(m[1]);
        if (evt.type === 'courseTitle') courseTitle = evt.data;
        else if (evt.type === 'languageDirective') languageDirective = String(evt.data).slice(0, 70);
        else if (evt.type === 'outline') outlines.push({ type: evt.data.type, title: evt.data.title });
      } catch {}
    }
  }
  return { courseTitle, languageDirective, outlines };
}

(async () => {
  for (const [courseId, topic] of COURSES) {
    process.stdout.write(`\n=== ${courseId} · ${topic} ===\n`);
    try {
      const r = await genOne(courseId, topic);
      if (r.error) { console.log('  ERROR:', r.error); continue; }
      console.log(`  courseTitle: ${r.courseTitle}`);
      console.log(`  lang: ${r.languageDirective}`);
      const types = r.outlines.map((o) => o.type);
      const tally = types.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {});
      console.log(`  scenes: ${types.length} | types: ${JSON.stringify(tally)}`);
      r.outlines.slice(0, 3).forEach((o) => console.log(`    - [${o.type}] ${o.title}`));
    } catch (e) {
      console.log('  ERROR:', e.message);
    }
  }
})();
