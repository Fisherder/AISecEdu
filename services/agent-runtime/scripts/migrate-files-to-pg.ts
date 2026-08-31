/**
 * Migrate existing file-based data into the PG database.
 * Run: STORAGE_BACKEND=pg npx tsx scripts/migrate-files-to-pg.ts
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, scryptSync } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = join(__dirname, '..');

async function main() {
  const { getDb } = await import(join(cwd, 'lib', 'server', 'db.ts'));
  const { ensureAppSchema } = await import(join(cwd, 'lib', 'server', 'schema.ts'));
  const db = await getDb();
  await ensureAppSchema(db);

  // Legacy user
  const existing = await db.query('SELECT id FROM users WHERE username = $1', ['legacy']);
  let uid = 'legacy-user';
  if (existing.rows.length === 0) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(randomBytes(32).toString('hex'), salt, 64).toString('hex');
    await db.query('INSERT INTO users (id, username, password_hash, role, created_at) VALUES ($1,$2,$3,$4,$5)', [uid, 'legacy', `${salt}:${hash}`, 'admin', Date.now()]);
    console.log('Created legacy user');
  } else { uid = existing.rows[0]!.id as string; }
  const ownerKey = `acct:${uid}`;

  // Lessons
  const lDir = join(cwd, 'data', 'lessons');
  let lc = 0;
  if (existsSync(lDir)) {
    for (const f of readdirSync(lDir).filter(f => f.endsWith('.json'))) {
      try {
        const lesson = JSON.parse(readFileSync(join(lDir, f), 'utf-8'));
        const now = Date.now();
        await db.query(
          `INSERT INTO app_lessons (id, owner_key, title, description, subject_profile, course_id, published_classroom_id, artifacts, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
          [lesson.id, ownerKey, lesson.title||f, lesson.description??null, lesson.subjectProfile??null, lesson.courseId??null, lesson.publishedClassroomId??null, JSON.stringify(lesson.artifacts??[]), lesson.createdAt??now, lesson.updatedAt??now]
        );
        lc++;
      } catch { /* skip */ }
    }
  }
  console.log(`Migrated ${lc} lessons`);

  // Classrooms
  const cDir = join(cwd, 'data', 'classrooms');
  let cc = 0;
  if (existsSync(cDir)) {
    for (const f of readdirSync(cDir).filter(f => f.endsWith('.json'))) {
      try {
        const c = JSON.parse(readFileSync(join(cDir, f), 'utf-8'));
        await db.query(
          `INSERT INTO app_classrooms (id, owner_key, stage, scenes, visibility, created_at) VALUES ($1,$2,$3,$4,'public',$5) ON CONFLICT (id) DO NOTHING`,
          [c.id, ownerKey, JSON.stringify(c.stage), JSON.stringify(c.scenes), Date.now()]
        );
        cc++;
      } catch { /* skip */ }
    }
  }
  console.log(`Migrated ${cc} classrooms`);

  const lv = await db.query('SELECT count(*) as cnt FROM app_lessons');
  const cv = await db.query('SELECT count(*) as cnt FROM app_classrooms');
  console.log(`\nDone. DB: ${lv.rows[0]!.cnt} lessons, ${cv.rows[0]!.cnt} classrooms`);
}

main().catch(console.error);
