/**
 * Cybersecurity curriculum data model.
 * Structured from BUPT 网络空间安全学院《信息安全专业培养方案》2021 版.
 */

export type CourseDomain = 'intro' | 'crypto' | 'network' | 'system';

export interface CourseRecord {
  /** 课程编号（来自培养方案） */
  id: string;
  /** 课程名称 */
  name: string;
  /** 开课学期（1-8） */
  semester: number;
  /** 学科子领域 */
  domain: CourseDomain;
  /** 是否核心必修 */
  core: boolean;
  /** 学分 */
  credits: number;
  /** 必修/选修 */
  type: '必修' | '选修';
  /** 该课程的知识点列表（生成大纲时注入 prompt） */
  knowledgePoints: string[];
  /** 先修课程名 */
  prerequisites: string[];
  /** 相关课程名 */
  relatedCourses: string[];
}
