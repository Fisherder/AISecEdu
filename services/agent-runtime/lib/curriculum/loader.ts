import fs from 'fs';
import path from 'path';
import type { CourseRecord } from './types';

const DATA_FILE = path.join(process.cwd(), 'lib', 'curriculum', 'curriculum.json');

let cache: CourseRecord[] | undefined;

/** Load the full curriculum dataset (cached after first read). */
export function loadCurriculum(): CourseRecord[] {
  if (!cache) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    cache = Object.freeze(JSON.parse(raw)) as CourseRecord[];
  }
  return cache;
}

/** Find a course by exact name. Returns undefined when unknown. */
export function getCourse(name: string): CourseRecord | undefined {
  return loadCurriculum().find((c) => c.name === name);
}

/** All course names (for UI dropdowns). */
export function listCourseNames(): string[] {
  return loadCurriculum().map((c) => c.name);
}
