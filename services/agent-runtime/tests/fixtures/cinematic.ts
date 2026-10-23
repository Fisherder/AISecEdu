import { parseCinematicScene } from '../../lib/cinematic/schema';

export const sceneFixture = () => parseCinematicScene({
  schemaVersion: 'cinematic-v1',
  title: '模型观察',
  subtitle: '处理器与内存的数据通路结构',
  duration: 60,
  objectives: ['从外观走进内部结构'],
  theme: { background: '#060b15', accent: '#5bdded', secondary: '#f6a755' },
  nodes: [
    { id: 'hero', kind: 'model', model: 'processor' },
    { id: 'bank', kind: 'model', model: 'memory-bank', position: [5, 0, 0] },
    { id: 'base', kind: 'box', position: [0, -2, 0] },
  ],
  tracks: [
    { target: 'hero', property: 'explode', keyframes: [{ at: 0, value: 0 }, { at: 60, value: 1 }] },
    { target: 'bank', property: 'position', keyframes: [{ at: 0, value: [5, 0, 0] }, { at: 60, value: [5, 2, 0] }] },
  ],
  shots: [
    { at: 0, position: [12, 8, 16], target: [0, 0, 0] },
    { at: 20, position: [8, 5, 10], target: [0, 0, 0] },
    { at: 40, position: [-8, 6, 8], target: [0, 0, 0] },
    { at: 60, position: [12, 8, 16], target: [0, 0, 0] },
  ],
  chapters: [0, 20, 40, 60].map((at, index) => ({ at, title: '章节' + index, caption: '观察内部结构、位置与镜头的变化', focus: ['hero'] })),
});

export const directorFixture = {
  title: '结构观察',
  visualThesis: '通过连续镜头从外壳深入芯片内部结构',
  artDirection: '深色工作室、金属材质、青色轮廓光和暖色细节',
  objectives: ['观察结构'],
  shots: [0, 1, 2, 3].map((index) => ({ title: '镜头' + index, purpose: '理解结构', visibleChange: '芯片层级逐步拆解显露内部', composition: '由整体俯视推进至层级特写' })),
};
