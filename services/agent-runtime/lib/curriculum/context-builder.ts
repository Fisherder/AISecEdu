import { getCourse } from './loader';

/**
 * Build a curriculum-context string injected into the outline-generation
 * prompt so generated classrooms align to the real course syllabus.
 *
 * Returns an empty string for unknown/absent courses so callers can pass the
 * result straight into the prompt variables without conditional handling.
 */
export function buildCurriculumContext(courseName: string | undefined): string {
  if (!courseName) return '';
  const course = getCourse(courseName);
  if (!course) return '';

  const kps = course.knowledgePoints.map((k) => `- ${k}`).join('\n');
  const prereqs = course.prerequisites.length
    ? course.prerequisites.join('、')
    : '无';
  const related = course.relatedCourses.length
    ? course.relatedCourses.join('、')
    : '无';

  return [
    `## 课程上下文：${course.name}（第${course.semester}学期 · ${course.domain}）`,
    '',
    '### 必须覆盖的知识点（生成的大纲应围绕这些知识点）',
    kps,
    '',
    `### 先修课程：${prereqs}`,
    `### 相关课程：${related}`,
  ].join('\n');
}
