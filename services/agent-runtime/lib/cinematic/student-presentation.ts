import type { CinematicScene } from './schema';

export const CINEMATIC_STUDENT_PRESENTATION_BRIEF = `学生界面只保留帮助理解学科内容的文字。不要主动生成“概念可视化，不是物理数值仿真”“教学示意，不代表真实电气连通”“不模拟化学反应”“不使用个人数据”等泛泛的排除式声明，也不要为这些话创建常驻标牌、学习目标或展示要求。模型假设在内部设计中核对；确实影响理解的比例、观察性分离等区别，用一句具体、正面的说明放在modelNote，例如“为看清连接，图中把两条链暂时分开”。modelNote默认可省略，不能为了填字段堆免责声明。科学知识中的否定、对比、限制条件仍须准确保留，不能机械删除所有“不”字。
每个教学对象只使用一套名称标注：优先把简短名称写到真实对象的node.label，把解释写到detail，由播放器统一排版和跟随运动。不要再为同一名称创建box/plane文字牌。surfaceText只用于确实作为教学对象的屏幕、刻度、铭牌或必要的独立注释；同一对象已有标注时不重复建立另一套。介绍直接解释功能和关系，不讲标牌放在哪里，不把操作说明、画质参数或工程状态写进学生内容。旧稿中的冗余声明不是必须继承的学习目标，调整时也按此规则重新审查。`;

// Match presentation boilerplate, not ordinary negation in scientific explanations.
const boilerplate = [
  /^(?:本|该|这[个段次]?)?(?:演示|模型|场景|平台|系统|作品|动画|短片|画面)?(?:中|是|为|仅为|只是|仅是|用于|采用)?(?:概念可视化(?:演示)?|教学(?:示意|概念)(?:模型)?|示意模型|概念比例|仅供教学(?:演示)?|仅展示空间结构|只展示空间结构)$/,
  /^(?:而|也|并|但)?(?:(?:本|该|这[个段次]?)(?:演示|模型|场景|平台|系统|作品|动画|短片|画面))?(?:不(?:是|做|提供|进行|支持|涉及|执行|模拟|控制|包含|使用|收集|代表)|并非|非)(?:任何)?(?:真实的?|实际的?)?(?:物理(?:数值)?(?:仿真|计算|求解)|化学反应|电气(?:连通|连接)|分子尺寸|个人(?:遗传)?数据|网络请求|外部网络(?:请求)?|系统命令|平台功能|设备|系统|工业设备)(?:等比例(?:放大|呈现))?$/,
  /^(?:非等比例真实分子尺寸|非真实分子尺寸|不按真实分子尺寸等比例放大|无外部网络请求|仅浏览器内演示数据)$/,
];

export function cleanStudentPresentationText(value: string): string {
  let changed = false;
  const cleaned = value.split(/([。！？；\n])/).map((sentence, index) => {
    if (index % 2) return sentence;
    const parts = sentence.split(/[，,]/);
    const kept = parts.filter(part => {
      const text = part.trim().replace(/^(?:常驻提醒|安全边界|声明|模型说明)[：:]\s*/, '').replace(/^(?:这是|本演示是)/, '');
      return !boilerplate.some(pattern => pattern.test(text));
    });
    if (kept.length === parts.length) return sentence;
    changed = true;
    return kept.join('，');
  }).join('');
  return changed ? cleaned.replace(/^[。！？；\s]+/, '').replace(/([。！？；])[。！？；]+/g, '$1').trim() : value.trim();
}

export function studentPresentationTextIssues(units: Array<{ field: string; text: string }>) {
  return units.filter(unit => cleanStudentPresentationText(unit.text) !== unit.text.trim())
    .map(unit => ({ field: unit.field, message: '删除与知识理解无关的泛泛声明；必要区别用具体、正面的学科说明表达，保留其他有效知识。' }));
}

export function cinematicStudentTextIssues(scene: CinematicScene) {
  return studentPresentationTextIssues([
    { field: 'title', text: scene.title }, { field: 'subtitle', text: scene.subtitle },
    { field: 'modelNote', text: scene.modelNote ?? '' },
    ...scene.chapters.flatMap((chapter, i) => ['title', 'caption', 'question'].map(key => ({ field: `chapters.${i}.${key}`, text: chapter[key as 'title' | 'caption' | 'question'] ?? '' }))),
    ...scene.nodes.flatMap((node, i) => [
      { field: `nodes.${i}.label`, text: node.label ?? '' }, { field: `nodes.${i}.detail`, text: node.detail ?? '' },
      ...(node.surfaceText?.lines ?? []).map((text, j) => ({ field: `nodes.${i}.surfaceText.lines.${j}`, text })),
    ]),
  ]);
}

type NodePresentation = {
  geometry: 'keep' | 'anchor';
  label: string;
  detail: string;
  surfaceLines?: string[];
  aliasOf?: string;
};

const nameKey = (value: string) => value.normalize('NFKC').replace(/[\s·・—–-]/g, '')
  .replace(/(?:文字牌|说明牌|铭牌|标签板|标牌|标记)$/, '').toLowerCase();
const annotation = (node: CinematicScene['nodes'][number]) => Boolean(node.surfaceText && !node.surfaceText.chapterTitle &&
  node.role !== 'primary' && /标牌|标签板|说明牌|铭牌|文字牌|声明牌|(?:^|[-_])(?:label|plate|plaque)(?:$|[-_])/i.test([node.id, node.label, node.represents].join(' ')));

export function cinematicStudentPresentation(scene: CinematicScene) {
  const nodes: Record<string, NodePresentation> = {};
  for (const node of scene.nodes) {
    const lines = node.surfaceText?.lines.map(cleanStudentPresentationText).filter(Boolean);
    const isAnnotation = annotation(node);
    const emptySign = Boolean(node.surfaceText && !lines?.length && !node.surfaceText.chapterTitle);
    const geometry = isAnnotation || emptySign ? 'anchor' : 'keep';
    const label = emptySign || node.role === 'decoration' || (node.kind === 'points' && node.role !== 'primary') ? '' :
      isAnnotation ? lines?.[0] ?? '' : node.surfaceText ? '' : cleanStudentPresentationText(node.label ?? '');
    nodes[node.id] = { geometry, label, detail: cleanStudentPresentationText(node.detail ?? ''),
      ...(lines ? { surfaceLines: lines } : {}) };
  }
  for (const node of scene.nodes) {
    const entry = nodes[node.id];
    if (entry.geometry !== 'anchor' || !entry.label || node.surfaceText?.chapterTitle) continue;
    const matches = scene.nodes.filter(other => other.id !== node.id && nodes[other.id].geometry === 'keep' &&
      nodes[other.id].label && nameKey(nodes[other.id].label) === nameKey(entry.label));
    // Only an unambiguous entity or the actual parent owns a redundant annotation.
    const owner = matches.find(other => other.id === node.parent) ?? (matches.length === 1 ? matches[0] : undefined);
    if (owner) { entry.aliasOf = owner.id; entry.label = ''; }
  }
  return {
    version: 'student-presentation-v1',
    title: cleanStudentPresentationText(scene.title),
    subtitle: cleanStudentPresentationText(scene.subtitle),
    modelNote: cleanStudentPresentationText(scene.modelNote ?? ''),
    chapters: scene.chapters.map(chapter => ({ ...chapter, title: cleanStudentPresentationText(chapter.title),
      caption: cleanStudentPresentationText(chapter.caption), question: cleanStudentPresentationText(chapter.question ?? '') })),
    nodes,
  };
}
