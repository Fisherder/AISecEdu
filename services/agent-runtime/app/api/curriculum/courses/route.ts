import { listCourseNames } from '@/lib/curriculum';
import { apiSuccess } from '@/lib/server/api-response';

/**
 * Return the list of cybersecurity course names from the structured
 * 培养方案 data. Consumed by the client-side course selector on the home
 * generation form (the loader is server-only — it imports `fs`).
 */
export async function GET() {
  return apiSuccess({ courses: listCourseNames() });
}
