import { execFileSync } from 'node:child_process';

const CONTAINER = process.env.DOJO_CONTAINER || 'pwncollege-dojo';
const BATCH = process.env.BATCH_NAME || '建设任务端到端验收批次';

function sql(query) {
  const out = execFileSync('docker', ['exec', '-i', CONTAINER, 'dojo', 'db', '-qAt', '-F', '\u0001', '-c', query], { encoding: 'utf8' });
  return out.trim().split('\n').filter(Boolean).map(line => line.split('\u0001'));
}

const rows = (query) => sql(query).map(cols => Object.fromEntries(cols.map((v, i) => [i, v])));

const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

const [batch] = sql(`SELECT id, name, status FROM construction_batches WHERE name='${BATCH}'`);
if (!batch) throw new Error(`找不到批次 ${BATCH}`);
const batchId = batch[0];

const members = sql(`SELECT u.name, m.role, m.activated IS NOT NULL, m.workspace_id FROM construction_members m JOIN users u ON u.id=m.user_id WHERE m.batch_id='${batchId}' ORDER BY m.role, u.name`);
check('批次含 4 位已激活教师', members.length === 4 && members.every(r => r[2] === 't'),
  members.map(r => `${r[0]}(${r[1]}${r[2] === 't' ? '·已激活' : '·未激活'})`).join('、'));

const courses = sql(`SELECT c.code, c.name, c.final_user_id, count(t.id) FROM construction_courses c LEFT JOIN construction_tasks t ON t.course_id=c.id WHERE c.batch_id='${batchId}' GROUP BY c.id, c.code, c.name, c.final_user_id`);
check('课程规划与任务卡已建立', courses.length === 1 && Number(courses[0][3]) >= 2, `${courses[0]?.[0]} ${courses[0]?.[1]}，任务 ${courses[0]?.[3]} 个`);

const tasks = sql(`SELECT t.code, t.kind, t.status, t.owner_id, t.material_id FROM construction_tasks t JOIN construction_courses c ON c.id=t.course_id WHERE c.batch_id='${batchId}' ORDER BY t.code`);
for (const [code, kind, status, owner, material] of tasks) {
  check(`任务 ${code}（${kind}）`, status === 'released' && Boolean(material), `状态 ${status}，主责人 ${owner || '—'}，素材 ${material || '—'}`);
}

const submissions = sql(`SELECT s.number, s.peer->>'decision', s.final->>'decision', left(s.content_hash, 12) FROM construction_submissions s JOIN construction_tasks t ON t.id=s.task_id JOIN construction_courses c ON c.id=t.course_id WHERE c.batch_id='${batchId}' ORDER BY s.number`);
const decided = submissions.filter(r => r[1] === 'pass');
const returned = submissions.filter(r => r[1] === 'return');
check('每次提交都有复核结论，通过版本均完成终审',
  submissions.length >= 1 && submissions.every(r => ['pass', 'return'].includes(r[1])) && decided.every(r => r[2] === 'pass'),
  submissions.map(r => `第${r[0]}次 peer=${r[1] || '—'} final=${r[2] || '—'}`).join('；') + `（退回 ${returned.length} 次）`);

const releases = sql(`SELECT r.material_id, r.version, r.revoked FROM construction_releases r JOIN construction_submissions s ON s.id=r.submission_id JOIN construction_tasks t ON t.id=s.task_id JOIN construction_courses c ON c.id=t.course_id WHERE c.batch_id='${batchId}' ORDER BY r.version`);
check('验收记录已生成且未撤销', releases.length >= 1 && releases.some(r => r[2] === 'f'), releases.map(r => `v${r[1]}${r[2] === 't' ? '(已撤销)' : ''}`).join('、'));

const frozen = sql(`SELECT sp.course_id FROM construction_spaces sp JOIN construction_submissions s ON s.id=sp.submission_id JOIN construction_tasks t ON t.id=s.task_id JOIN construction_courses c ON c.id=t.course_id WHERE c.batch_id='${batchId}'`);
check('固定版本审核副本已冻结留档', frozen.length >= 1, frozen.map(r => r[0]).join('、'));

const items = sql(`SELECT i.id, i.title, i.version, i.visibility, i.content_type FROM material_library_items i WHERE i.id IN (SELECT material_id FROM construction_releases)`);
for (const [id, title, version, visibility, type] of items) {
  check(`素材「${title}」可被教师检索`, visibility === 'teachers', `版本 v${version}，类型 ${type}，可见范围 ${visibility}`);
}

const versions = sql(`SELECT item_id, count(*) FROM material_library_versions WHERE item_id IN (SELECT r.material_id FROM construction_releases r JOIN construction_submissions s ON s.id=r.submission_id JOIN construction_tasks t ON t.id=s.task_id JOIN construction_courses c ON c.id=t.course_id WHERE c.batch_id='${batchId}') GROUP BY item_id`);
check('素材版本历史已保留', versions.every(r => Number(r[1]) >= 1), versions.map(r => `${r[0].slice(-8)}×${r[1]}`).join('、'));

const imports = sql(`SELECT i.owner_id, count(*) FROM material_library_imports i GROUP BY i.owner_id`);
check('入库素材已被其他教师采用', imports.length >= 1, imports.map(r => `教师 ${r[0]} 采用 ${r[1]} 次`).join('、'));

const events = sql(`SELECT action, count(*) FROM construction_events WHERE batch_id='${batchId}' GROUP BY action ORDER BY 2 DESC`);
check('审计事件完整', events.length >= 6, events.map(r => `${r[0]}×${r[1]}`).join('、'));

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length} / ${checks.length} 项通过`);
if (failed.length) process.exitCode = 2;
