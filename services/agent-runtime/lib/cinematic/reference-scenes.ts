import type { CinematicNode, CinematicScene } from './schema';

type Vector = CinematicNode['position'];
type Track = CinematicScene['tracks'][number];
type NodeSpec = Pick<CinematicNode, 'id' | 'kind' | 'position'> & Partial<CinematicNode>;

const node = (spec: NodeSpec): CinematicNode => ({
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: '#91a8bd',
  emissive: 0,
  metalness: 0.55,
  roughness: 0.32,
  opacity: 1,
  params: {},
  ...spec,
});

const model = (
  id: string,
  kind: NonNullable<CinematicNode['model']>,
  position: Vector,
  scale: Vector,
  label: string,
  detail: string,
  color = '#91a8bd',
): CinematicNode => node({ id, kind: 'model', model: kind, position, scale, label, detail, color });

const animate = (
  target: string,
  property: Track['property'],
  frames: Array<[number, number | Vector]>,
  easing: Track['easing'] = 'smooth',
): Track => ({ target, property, easing, keyframes: frames.map(([at, value]) => ({ at, value })) });

const link = (
  id: string,
  from: string,
  to: string,
  via: Vector[],
  color: string,
  label: string,
): CinematicScene['connections'][number] => ({
  id, from, to, via, color, label, particles: 12, speed: 0.08, radius: 0.018,
});

const industrialLoop: CinematicScene = {
  schemaVersion: 'cinematic-v1',
  title: '视觉基准 · 工业闭环：状态、读数与独立复核',
  subtitle: '人工编写的渲染器基准／单元测试夹具，非正式 AI 生成示例；刻度与流程均为离线概念示意。',
  duration: 84,
  objectives: [
    '区分物理回路、显示读数与独立观测三条证据通道。',
    '从三个标记的相对位置识别读数偏差，而非根据装饰灯判断状态。',
    '理解校准后的一致性仍需结合测量来源解释。',
  ],
  theme: { background: '#070f1b', accent: '#65dceb', secondary: '#ffb65c', environment: 'laboratory' },
  learnerControls: [],
  nodes: [
    model('turbine-left', 'turbine', [-3.5, 0.3, -0.6], [0.76, 0.76, 0.76], '机组 A', '概念机组；结构拆解只展示部件层次，不代表真实设备操作。'),
    model('turbine-right', 'turbine', [3.5, 0.3, -0.6], [0.76, 0.76, 0.76], '机组 B', '固定空间参照，与机组 A 共同构成可观察的物理回路。'),
    model('control-rack', 'server-rack', [0, 0, -5.4], [0.6, 0.6, 0.6], '控制侧', '表示闭环中的控制侧角色；不含设备地址、协议命令或操作接口。'),
    model('display-rack', 'server-rack', [-7.1, 0, -3.9], [0.48, 0.48, 0.48], '显示通道', '蓝色标记代表显示读数，脚本故意让它在第三章保持旧位置。', '#6fb6d5'),
    model('reference-rack', 'server-rack', [7.1, 0, -3.9], [0.48, 0.48, 0.48], '独立观测', '绿色标记是额外观测通道；独立性在此为教学前提，不是实际测量认证。', '#80c9a4'),
    model('archive-rack', 'server-rack', [-6.7, -0.2, 2.2], [0.44, 0.44, 0.44], '记录参照', '保留观察顺序的背景角色，不连接外部服务。'),
    node({ id: 'equipment-plinth', kind: 'box', position: [0, -1.87, -0.8], params: { width: 10, height: 0.32, depth: 5.4 }, color: '#182c3f', roughness: 0.55 }),
    node({ id: 'supply-pipe', kind: 'tube', position: [0, 0, 0], points: [[-3.5, -0.9, -2.1], [-3.5, -0.9, -3.5], [0, -0.9, -3.8], [3.5, -0.9, -3.5], [3.5, -0.9, -2.1]], params: { radius: 0.13 }, color: '#627d91', metalness: 0.85 }),
    node({ id: 'return-pipe', kind: 'tube', position: [0, 0, 0], points: [[3.5, -0.9, 0.9], [3.5, -0.9, 1.8], [0, -0.9, 1.95], [-3.5, -0.9, 1.8], [-3.5, -0.9, 0.9]], params: { radius: 0.13 }, color: '#957450', metalness: 0.8 }),
    node({ id: 'flow-marker', kind: 'sphere', position: [-3.5, -0.67, 1.8], params: { radius: 0.15 }, color: '#ffb65c', emissive: 1.1, label: '流向示意', detail: '光点的位置随统一时间推进；速度不是实际流量。' }),
    node({ id: 'valve-ring', kind: 'torus', position: [-3.5, -0.9, -2.7], params: { radius: 0.3, tube: 0.065 }, color: '#d7a867', rotation: [0, 0, 0] }),
    node({ id: 'evidence-panel', kind: 'box', position: [0, -0.15, 3.3], params: { width: 4.8, height: 2.05, depth: 0.14 }, color: '#0e2235', roughness: 0.8, metalness: 0.15, label: '三通道归一化刻度', detail: '三行从上到下为实际状态、显示读数、独立观测；横坐标只用于比较。' }),
    ...[0.46, -0.08, -0.62].map((y, index) => node({ id: `evidence-rail-${index}`, kind: 'box', position: [0, y, 3.43], params: { width: 3.6, height: 0.025, depth: 0.025 }, color: '#46677e', emissive: 0.15 })),
    node({ id: 'actual-marker', kind: 'sphere', position: [-1.2, 0.46, 3.58], params: { radius: 0.14 }, color: '#ffb65c', emissive: 0.65, label: '实际状态 · 琥珀', detail: '第三章向右移动；它与显示读数分开，因此偏差可直接观察。' }),
    node({ id: 'display-marker', kind: 'sphere', position: [-1.2, -0.08, 3.58], params: { radius: 0.14 }, color: '#65dceb', emissive: 0.65, label: '显示读数 · 蓝', detail: '第三章保持旧位置；第五章校准后才与其他标记重新对齐。' }),
    node({ id: 'independent-marker', kind: 'sphere', position: [-1.2, -0.62, 3.58], params: { radius: 0.14 }, color: '#80e3ab', emissive: 0.18, label: '独立观测 · 绿', detail: '第四章亮起并移动至实际状态对应位置。' }),
  ],
  connections: [
    link('measurement-channel', 'turbine-left', 'display-rack', [[-5.3, 2.6, -0.8], [-7.1, 1.8, -2.4]], '#65dceb', '显示通道'),
    link('independent-channel', 'turbine-right', 'reference-rack', [[5.3, 2.6, -0.8], [7.1, 1.8, -2.4]], '#80e3ab', '独立通道'),
    link('control-channel', 'control-rack', 'turbine-left', [[0, 1.7, -3.8], [-2.5, 1.7, -2.2]], '#97b4cc', '控制关系示意'),
  ],
  tracks: [
    animate('flow-marker', 'position', [[0, [-3.5, -0.67, 1.8]], [12, [3.5, -0.67, 1.8]], [24, [3.5, -0.67, -3.5]], [36, [-3.5, -0.67, -3.5]], [48, [-3.5, -0.67, 1.8]], [60, [3.5, -0.67, 1.8]], [72, [3.5, -0.67, -3.5]], [84, [-3.5, -0.67, -3.5]]], 'linear'),
    animate('valve-ring', 'rotation', [[0, [0, 0, 0]], [16, [0, 0, 1.1]], [32, [0, 0, 1.1]], [64, [0, 0, 1.1]], [76, [0, 0, 0]], [84, [0, 0, 0]]]),
    animate('turbine-left', 'explode', [[0, 0], [16, 0], [22, 0.5], [26, 0.5], [32, 0], [84, 0]]),
    animate('actual-marker', 'position', [[0, [-1.2, 0.46, 3.58]], [32, [-1.2, 0.46, 3.58]], [40, [1.2, 0.46, 3.58]], [72, [1.2, 0.46, 3.58]], [80, [0, 0.46, 3.58]], [84, [0, 0.46, 3.58]]]),
    animate('display-marker', 'position', [[0, [-1.2, -0.08, 3.58]], [64, [-1.2, -0.08, 3.58]], [72, [1.2, -0.08, 3.58]], [80, [0, -0.08, 3.58]], [84, [0, -0.08, 3.58]]]),
    animate('independent-marker', 'position', [[0, [-1.2, -0.62, 3.58]], [48, [-1.2, -0.62, 3.58]], [56, [1.2, -0.62, 3.58]], [72, [1.2, -0.62, 3.58]], [80, [0, -0.62, 3.58]], [84, [0, -0.62, 3.58]]]),
    animate('independent-marker', 'emissive', [[0, 0.18], [48, 0.18], [52, 1.05], [64, 0.65], [84, 0.65]]),
  ],
  shots: [
    { at: 0, position: [8.8, 7.6, 15.2], target: [0, -0.1, -0.9], fov: 43 },
    { at: 16, position: [-6.8, 4.3, 7.2], target: [-3.5, 0.4, -0.6], fov: 43 },
    { at: 28, position: [-6.5, 5.1, 9.3], target: [-2.6, 0.3, 0], fov: 43 },
    { at: 32, position: [0, 2.5, 9], target: [0, -0.05, 3.4], fov: 41 },
    { at: 48, position: [2.8, 2.9, 9.1], target: [0, -0.05, 3.4], fov: 42 },
    { at: 64, position: [-2.1, 2.8, 9.3], target: [0, -0.05, 3.4], fov: 42 },
    { at: 80, position: [-8.8, 7.6, 15.2], target: [0, -0.1, -0.9], fov: 43 },
  ],
  chapters: [
    { at: 0, title: '建立共同基线', caption: '两台机组由实体管路连接；琥珀光点沿回路推进，阀环缓慢转动。前方三行刻度的标记具有相同横坐标，绿色观测尚未高亮。所有运动都是预设的概念示意。', focus: ['turbine-left', 'turbine-right', 'flow-marker'], question: '同一横坐标表示什么？显示通道与物理管路是否是同一种关系？' },
    { at: 16, title: '从外壳进入结构', caption: '左机组在 16–22 秒展开内部部件，短暂停留后于 32 秒前复位；右机组保持整体作为参照。拆解用于观察结构层次，不表示故障或真实维护操作。', focus: ['turbine-left'], question: '哪些部件在拆解时分开，哪些实体管路仍保持原位？' },
    { at: 32, title: '状态变化，读数滞留', caption: '读数板上，琥珀色实际状态标记向右移动，蓝色显示标记保持左侧。两者横坐标的差距就是本场景要观察的偏差，不能用背景光点是否仍在运动判断读数正确。', focus: ['actual-marker', 'display-marker'], question: '只看蓝色显示，会遗漏哪一项已经发生的变化？' },
    { at: 48, title: '加入独立观测', caption: '绿色观测标记亮起，并在 48–56 秒向右追上琥珀标记；蓝色仍留在原处。现在可见的是两条通道一致、另一条不同，而不是所有读数都已恢复正常。', focus: ['actual-marker', 'display-marker', 'independent-marker'], question: '哪条通道需要复核？为什么还要检查观测来源是否真正独立？' },
    { at: 64, title: '校准，再做共同变化检查', caption: '蓝色标记先追上另外两行；72 秒后三个标记共同移向中间刻度。此时相同横坐标是脚本中的校准结果，不意味着仅凭一致性就能排除共同误差。', focus: ['actual-marker', 'display-marker', 'independent-marker'], question: '三条读数再次一致，与证明它们都正确，有什么区别？' },
  ],
};

const memoryCall: CinematicScene = {
  schemaVersion: 'cinematic-v1',
  title: '视觉基准 · 栈帧显微镜：一次调用的生命周期',
  subtitle: '人工编写的渲染器基准／单元测试夹具，非正式 AI 生成示例；内存分层为概念图，不对应真实地址。',
  duration: 84,
  objectives: ['区分调用者帧、被调用者帧和返回值的生命周期。', '通过上下层标记的不同运动观察局部值的独立性。', '识别返回值已经传出而临时帧被释放的状态。'],
  theme: { background: '#0a0d20', accent: '#83aaff', secondary: '#f1b466', environment: 'circuit' },
  learnerControls: [],
  nodes: [
    model('processor', 'processor', [-5.8, 0.1, -2.2], [0.7, 0.7, 0.7], '处理器', '取指和调用位置的空间参照；不执行真实机器代码。', '#8da7ca'),
    model('instruction-bank', 'memory-bank', [-5.8, 0.1, 3.3], [0.5, 0.5, 0.5], '指令区', '紫色取指标记从这里向处理器移动，代表一次读取事件。'),
    model('caller-frame', 'memory-bank', [0, -0.7, 0], [0.65, 0.36, 0.58], '调用者帧', '下层帧贯穿整个示例；蓝色局部值标记不会随上层局部值一起移动。', '#759bd1'),
    model('callee-frame', 'memory-bank', [0, -0.7, -5.4], [0.65, 0.36, 0.58], '被调用者帧', '开始停在后方示意待用区，调用时移到上层，返回后退出。这个移动不是实际内存搬运。', '#d5a375'),
    model('result-bank', 'memory-bank', [5.8, 0.1, 3.3], [0.5, 0.5, 0.5], '结果观察区', '绿色返回值标记到达后保持可见，即使被调用者帧已经退出。', '#8cccb6'),
    model('register-bank', 'memory-bank', [5.8, 0.1, -2.2], [0.52, 0.52, 0.52], '上下文参照', '背景参照模块；不模拟某个体系结构的真实寄存器布局。'),
    node({ id: 'logic-board', kind: 'box', position: [0, -1.88, -0.5], params: { width: 15.5, height: 0.3, depth: 11.6 }, color: '#14253c', roughness: 0.58 }),
    node({ id: 'stack-pedestal', kind: 'box', position: [0, -1.6, 0], params: { width: 4.3, height: 0.25, depth: 3.7 }, color: '#283d58' }),
    node({ id: 'stack-guide-left', kind: 'box', position: [-2.1, 0.5, -1.4], params: { width: 0.035, height: 4.4, depth: 0.035 }, color: '#7095c9', emissive: 0.5 }),
    node({ id: 'stack-guide-right', kind: 'box', position: [2.1, 0.5, -1.4], params: { width: 0.035, height: 4.4, depth: 0.035 }, color: '#7095c9', emissive: 0.5 }),
    node({ id: 'caller-value-rail', kind: 'box', position: [0, 0.38, 1.8], params: { width: 3, height: 0.04, depth: 0.06 }, color: '#537aac' }),
    node({ id: 'callee-value-rail', kind: 'box', position: [0, 2.72, 1.8], params: { width: 3, height: 0.04, depth: 0.06 }, color: '#967249', opacity: 0.05 }),
    node({ id: 'instruction-token', kind: 'sphere', position: [-5.8, 1.7, 3.3], params: { radius: 0.16 }, color: '#b697ff', emissive: 1, label: '取指／调用标记', detail: '轨迹只表达事件先后，不表示真实总线传输速度。' }),
    node({ id: 'caller-value', kind: 'box', position: [-0.9, 0.52, 1.8], params: { width: 0.28, height: 0.28, depth: 0.28 }, color: '#83aaff', emissive: 0.55, label: '调用者局部值', detail: '在整个调用期间保持原位置，作为上下层状态独立的参照。' }),
    node({ id: 'callee-value', kind: 'box', position: [-0.9, -0.1, -4.8], params: { width: 0.28, height: 0.28, depth: 0.28 }, color: '#f1b466', emissive: 0.6, opacity: 0.05, label: '被调用者局部值', detail: '第三章沿上层槽移动；第五章随临时帧退出，不修改下层的蓝色块。' }),
    node({ id: 'return-token', kind: 'sphere', position: [0.9, 3.12, 1.8], params: { radius: 0.19 }, color: '#8ce2bd', emissive: 0.9, opacity: 0.05, label: '返回值', detail: '第四章从上层局部值位置传到结果区；临时帧退出后仍保留。' }),
    node({ id: 'instruction-bus', kind: 'tube', position: [0, 0, 0], points: [[-5.8, -1.15, 2.1], [-4.1, -1.15, 1.2], [-4.1, -1.15, -1.7], [-5.8, -1.15, -2.2]], params: { radius: 0.045 }, color: '#8078b9', emissive: 0.25 }),
  ],
  connections: [
    link('context-bus', 'processor', 'register-bank', [[-3, -1.2, -3.5], [3, -1.2, -3.5]], '#738fc7', '固定上下文关系'),
    link('result-bus', 'register-bank', 'result-bank', [[7.4, -1.1, -1], [7.4, -1.1, 2.2]], '#8ce2bd', '结果观察通道'),
  ],
  tracks: [
    animate('instruction-token', 'position', [[0, [-5.8, 1.7, 3.3]], [12, [-5.8, 2.05, -2.2]], [16, [-5.8, 2.05, -2.2]], [24, [0, 3.2, 0]], [32, [0, 3.2, 0]], [48, [0, 3.2, 0]], [64, [-5.8, 2.05, -2.2]], [84, [-5.8, 2.05, -2.2]]]),
    animate('processor', 'explode', [[0, 0], [6, 0.18], [12, 0.18], [16, 0], [84, 0]]),
    animate('callee-frame', 'position', [[0, [0, -0.7, -5.4]], [16, [0, -0.7, -5.4]], [24, [0, 1.5, 0]], [64, [0, 1.5, 0]], [76, [0, -0.7, -5.4]], [84, [0, -0.7, -5.4]]]),
    animate('callee-frame', 'opacity', [[0, 0.16], [16, 0.16], [24, 1], [64, 1], [76, 0.16], [84, 0.16]]),
    animate('callee-value', 'position', [[0, [-0.9, -0.1, -4.8]], [16, [-0.9, -0.1, -4.8]], [24, [-0.9, 2.88, 1.8]], [32, [-0.9, 2.88, 1.8]], [40, [0.9, 2.88, 1.8]], [64, [0.9, 2.88, 1.8]], [76, [0.9, -0.1, -4.8]], [84, [0.9, -0.1, -4.8]]]),
    animate('callee-value', 'rotation', [[0, [0, 0, 0]], [32, [0, 0, 0]], [40, [0, 1.57, 0]], [64, [0, 1.57, 0]], [76, [0, 0, 0]], [84, [0, 0, 0]]]),
    animate('callee-value', 'opacity', [[0, 0], [16, 0], [24, 1], [64, 1], [76, 0], [84, 0]]),
    animate('callee-value-rail', 'opacity', [[0, 0], [16, 0], [24, 1], [64, 1], [76, 0], [84, 0]]),
    animate('return-token', 'position', [[0, [0.9, 3.12, 1.8]], [48, [0.9, 3.12, 1.8]], [52, [2.8, 3.5, 2.2]], [58, [5.8, 1.7, 3.3]], [84, [5.8, 1.7, 3.3]]]),
    animate('return-token', 'opacity', [[0, 0], [48, 0], [50, 1], [84, 1]]),
  ],
  shots: [
    { at: 0, position: [8.5, 10.5, 15.8], target: [0, 0.25, -0.5], fov: 43 },
    { at: 16, position: [-1.2, 10.6, 17.8], target: [0, 0.7, -0.3], fov: 43 },
    { at: 24, position: [2.5, 5.1, 9.5], target: [0, 1.15, 0.35], fov: 42 },
    { at: 36, position: [1.4, 4.1, 8.3], target: [0, 1.45, 1], fov: 42 },
    { at: 52, position: [5.7, 6.5, 13], target: [2.1, 1.4, 1.1], fov: 43 },
    { at: 68, position: [4.5, 7.1, 13.5], target: [1.65, 1, -0.4], fov: 43 },
    { at: 80, position: [-8.5, 10.5, 15.8], target: [0, 0.25, -0.5], fov: 43 },
  ],
  chapters: [
    { at: 0, title: '从取指开始', caption: '紫色标记从左前方指令区移向处理器，处理器结构轻微展开后复位。中间下层是已有的调用者帧；后方半透明模块表示尚未建立的临时帧。', focus: ['processor', 'instruction-token'], question: '哪一个模块表示当前已有的调用上下文？' },
    { at: 16, title: '建立上层调用帧', caption: '临时帧从后方示意待用区移到调用者上方并变为不透明；橙色局部值块与上层槽同步出现。空间移动表达帧的建立，不表示真实内存被搬到另一个地址。', focus: ['caller-frame', 'callee-frame', 'callee-value'], question: '调用建立后，哪一层负责保存被调用者的局部状态？' },
    { at: 32, title: '局部值各有归属', caption: '橙色块沿上层槽由左向右移动并转动；下层蓝色块始终不动。两个标记代表不同帧中的局部状态，不是同一个变量的两种显示。', focus: ['callee-value', 'caller-value'], question: '上层局部状态变化，为什么不要求下层蓝色块一起移动？' },
    { at: 48, title: '把结果传出调用帧', caption: '绿色返回值从上层位置显现，沿弧形折线移向右前方结果区，58 秒到达。临时帧和橙色局部值此时仍在上层，先传出结果，再结束生命周期。', focus: ['return-token', 'result-bank'], question: '返回值到达时，被调用者帧是否已经退出？' },
    { at: 64, title: '临时帧退出，结果保留', caption: '上层帧移回后方并淡出；橙色块和上层槽一起消失。调用者帧及蓝色块保持原位，绿色返回值仍停在结果区。临时存储的生命周期与返回结果由此区分。', focus: ['caller-frame', 'return-token', 'callee-frame'], question: '哪个结果在临时帧退出之后仍然可以被观察？' },
  ],
};

const basePairs = [
  { left: 'A', right: 'T', y: 2.25, leftColor: '#61deca', rightColor: '#f5c475' },
  { left: 'G', right: 'C', y: 1.2, leftColor: '#9ca6ff', rightColor: '#f392b5' },
  { left: 'T', right: 'A', y: 0.15, leftColor: '#f5c475', rightColor: '#61deca' },
  { left: 'C', right: 'G', y: -0.9, leftColor: '#f392b5', rightColor: '#9ca6ff' },
] as const;

const molecularPairing: CinematicScene = {
  schemaVersion: 'cinematic-v1',
  title: '视觉基准 · 双螺旋窗口：分离、模板与互补配对',
  subtitle: '人工编写的渲染器基准／单元测试夹具，非正式 AI 生成示例；形状和尺寸为符号模型，不是分子动力学。',
  duration: 88,
  objectives: ['区分双螺旋整体、骨架与碱基配对三个观察层次。', '识别分离后仍沿单侧骨架保留的碱基顺序。', '通过 A–T、G–C 的重新配对检验互补关系。'],
  theme: { background: '#100d22', accent: '#66ddce', secondary: '#eca1cb', environment: 'laboratory' },
  learnerControls: [],
  nodes: [
    model('dna-overview-left', 'dna', [-4.9, 0.6, -1.2], [0.64, 0.64, 0.64], '双螺旋整体', '左侧整体作为中央放大窗口的上下文；中央四组基对由独立几何体表示，不依赖模型内部命名。', '#79c7c4'),
    model('dna-overview-right', 'dna', [4.9, 0.6, -1.2], [0.64, 0.64, 0.64], '整体结构参照', '保持双螺旋外观以对照中央平面展开的符号片段。', '#c4a4d5'),
    model('atom-scale-left', 'atom', [-7, 0.1, 3.5], [0.43, 0.43, 0.43], '原子尺度符号', '仅作不同观察尺度的视觉参照；此通用原子图不是一个完整碱基分子。', '#7cbbd4'),
    model('atom-scale-inner-left', 'atom', [-2.6, 0, 5.2], [0.4, 0.4, 0.4], '原子尺度参照 A', '轨道外观是示意图；不用于描述电子真实轨迹或碱基化学组成。', '#9e9edb'),
    model('atom-scale-inner-right', 'atom', [2.6, 0, 5.2], [0.4, 0.4, 0.4], '原子尺度参照 B', '与双螺旋处于不同示意尺度，不表示相邻分子的实际大小比例。', '#cca2c7'),
    model('atom-scale-right', 'atom', [7, 0.1, 3.5], [0.43, 0.43, 0.43], '原子尺度符号', '通用原子模型作为前景细节，不参与中央配对机制的计算。', '#89c9bb'),
    node({ id: 'molecular-plinth', kind: 'box', position: [0, -1.87, 0], params: { width: 9.6, height: 0.3, depth: 5.2 }, color: '#211e38', roughness: 0.55 }),
    node({ id: 'pairing-backdrop', kind: 'box', position: [0, 0.65, -0.62], params: { width: 5.7, height: 4.4, depth: 0.06 }, color: '#17192b', roughness: 0.9, metalness: 0.08 }),
    node({ id: 'left-strand', kind: 'group', position: [-1.1, 0, 0] }),
    node({ id: 'right-strand', kind: 'group', position: [1.1, 0, 0] }),
    node({ id: 'left-backbone', kind: 'tube', parent: 'left-strand', position: [0, 0, 0], points: [[-0.12, -1.4, 0], [0, -0.9, 0], [-0.1, 0.15, 0], [0, 1.2, 0], [-0.1, 2.25, 0], [0, 2.8, 0]], params: { radius: 0.085 }, color: '#77cec7', metalness: 0.35, emissive: 0.16, label: '左侧骨架', detail: '骨架作为连续结构左右移动；基对分离并不使它断裂。' }),
    node({ id: 'right-backbone', kind: 'tube', parent: 'right-strand', position: [0, 0, 0], points: [[0.12, -1.4, 0], [0, -0.9, 0], [0.1, 0.15, 0], [0, 1.2, 0], [0.1, 2.25, 0], [0, 2.8, 0]], params: { radius: 0.085 }, color: '#c5a6dd', metalness: 0.35, emissive: 0.16, label: '右侧骨架', detail: '与左侧形成互补配对；此夹具不模拟完整复制过程。' }),
    ...basePairs.flatMap((pair, index) => [
      node({ id: `base-left-${index}`, kind: 'box', parent: 'left-strand', position: [0.45, pair.y, 0], params: { width: 0.7, height: 0.3, depth: 0.36 }, color: pair.leftColor, roughness: 0.27, metalness: 0.25, emissive: 0.16, label: `${pair.left} · 左 ${index + 1}`, detail: `从上到下第 ${index + 1} 个符号碱基 ${pair.left}，与右侧 ${pair.right} 配对。` }),
      node({ id: `base-right-${index}`, kind: 'box', parent: 'right-strand', position: [-0.45, pair.y, 0], params: { width: 0.7, height: 0.3, depth: 0.36 }, color: pair.rightColor, roughness: 0.27, metalness: 0.25, emissive: 0.16, label: `${pair.right} · 右 ${index + 1}`, detail: `与左侧 ${pair.left} 互补；几何块不表示实际分子形状。` }),
      node({ id: `pair-bond-${index}`, kind: 'cylinder', position: [0, pair.y, 0], rotation: [0, 0, Math.PI / 2], params: { top: 0.035, bottom: 0.035, height: 0.6 }, color: '#e9dceb', emissive: 0.3, metalness: 0.1, detail: `${pair.left}–${pair.right} 的配对关系标记；连杆数量不表示氢键数量。` }),
    ]),
  ],
  connections: [],
  tracks: [
    animate('dna-overview-left', 'rotation', [[0, [0, -0.25, 0]], [16, [0, 0.3, 0]], [64, [0, 0.3, 0]], [88, [0, -0.25, 0]]]),
    animate('dna-overview-right', 'rotation', [[0, [0, 0.25, 0]], [16, [0, -0.3, 0]], [64, [0, -0.3, 0]], [88, [0, 0.25, 0]]]),
    animate('left-strand', 'position', [[0, [-1.1, 0, 0]], [16, [-1.1, 0, 0]], [28, [-2, 0, 0]], [48, [-2, 0, 0]], [62, [-1.1, 0, 0]], [88, [-1.1, 0, 0]]]),
    animate('right-strand', 'position', [[0, [1.1, 0, 0]], [16, [1.1, 0, 0]], [28, [2, 0, 0]], [48, [2, 0, 0]], [62, [1.1, 0, 0]], [88, [1.1, 0, 0]]]),
    ...basePairs.flatMap((_, index) => [
      animate(`pair-bond-${index}`, 'opacity', [[0, 1], [16 + index * 2, 1], [18 + index * 2, 0], [64 + index * 2, 0], [66 + index * 2, 1], [88, 1]]),
      animate(`base-left-${index}`, 'emissive', [[0, 0.16], [8, 0.38], [16, 0.16], [32 + index * 2, 0.16], [34 + index * 2, 0.95], [36 + index * 2, 0.25], [64, 0.25], [66 + index * 2, 0.7], [76, 0.7], [84, 0.16], [88, 0.16]]),
      animate(`base-right-${index}`, 'emissive', [[0, 0.16], [8, 0.38], [16, 0.16], [64 + index * 2, 0.16], [66 + index * 2, 0.7], [76, 0.7], [84, 0.16], [88, 0.16]]),
    ]),
  ],
  shots: [
    { at: 0, position: [7.6, 7.4, 16.4], target: [0, 0.65, 1.1], fov: 43 },
    { at: 12, position: [0, 3.2, 10.6], target: [0, 0.7, 0], fov: 42 },
    { at: 26, position: [-2.2, 3, 9.3], target: [0, 0.7, 0], fov: 42 },
    { at: 38, position: [-0.8, 2.6, 8.7], target: [0, 0.7, 0], fov: 42 },
    { at: 54, position: [1.8, 2.9, 9.2], target: [0, 0.7, 0], fov: 42 },
    { at: 70, position: [0, 2.6, 8.7], target: [0, 0.7, 0], fov: 42 },
    { at: 84, position: [-7.6, 7.4, 16.4], target: [0, 0.65, 1.1], fov: 43 },
  ],
  chapters: [
    { at: 0, title: '整体与局部使用不同尺度', caption: '两侧双螺旋模型缓慢转动，中央四组配对提高亮度。中央从上到下是 A–T、G–C、T–A、C–G；前景原子图只提供尺度意象，不代表这些碱基的实际组成。', focus: ['dna-overview-left', 'base-left-0', 'base-right-0'], question: '中央展开的几何块，与两侧完整双螺旋，分别帮助观察什么？' },
    { at: 16, title: '配对分离，骨架保持连续', caption: '中央两条骨架向左右移开，四条配对标记从上到下逐次淡出；碱基块仍连接在各自骨架上。这里分离的是配对关系，没有把骨架剪断。', focus: ['left-backbone', 'right-backbone', 'base-left-0', 'base-right-0'], question: '分离后，哪些连接仍然保留？' },
    { at: 32, title: '沿单侧读取模板顺序', caption: '左侧碱基从上到下依次高亮，顺序仍为 A、G、T、C；两条骨架保持分开，配对连杆继续隐藏。右侧未同步高亮，用来突出单侧模板的观察路径。', focus: ['base-left-0', 'base-left-1', 'base-left-2', 'base-left-3'], question: '移动到两侧以后，左侧碱基顺序改变了吗？' },
    { at: 48, title: '互补位置重新靠近', caption: '左右骨架缓慢回到中央，各层碱基保持原来的高度，在 62 秒恢复初始间距。配对连杆此时仍隐藏：空间上靠近，与已经显示配对关系，是两个不同的观察状态。', focus: ['base-left-0', 'base-right-0', 'base-left-1', 'base-right-1'], question: '看到两块靠近，是否就等于已经看到配对标记恢复？' },
    { at: 64, title: '重新配对并逐层复核', caption: '四条配对标记从上到下重新出现，对应的两侧碱基共同高亮；随后高亮降低、镜头回到整体。仍是 A–T 与 G–C 的互补关系，不表示本场景完成了 DNA 复制。', focus: ['base-left-0', 'base-right-0', 'base-left-1', 'base-right-1'], question: '恢复后每层的配对是否与开始一致？这个示意没有呈现哪些真实分子过程？' },
  ],
};

const centrifugeCascade: CinematicScene = {
  schemaVersion: 'cinematic-v1',
  title: '视觉基准 · 离心机级联：显示状态与物理状态分离',
  subtitle: '人工编写的交互式三维基准／单元测试夹具，非正式 AI 生成示例；转速区间与后果只表达概念状态，不是设备标定或破坏预测。',
  duration: 76,
  objectives: [
    '操作实验输入并观察三台机壳内部转子的可见旋转。',
    '比较保持旧值的显示通道与持续变化的物理状态通道。',
    '在暂停、复位和视角旋转后，仍能根据条纹和证据标记复核状态。',
  ],
  theme: { background: '#06111b', accent: '#57d8e8', secondary: '#ff9f5b', environment: 'laboratory' },
  learnerControls: [
    {
      id: 'rotor-input', type: 'range', label: '实验输入', min: 1000, max: 5000, step: 100,
      defaultValue: 1000, unit: 'RPM（概念）', timeRange: [0, 76],
      feedback: [
        { min: 1000, max: 1999, label: '基线区', detail: '三条示踪带缓慢转动，显示与物理标记保持一致。', tone: 'success' },
        { min: 2000, max: 3499, label: '偏差区', detail: '物理标记开始偏移，显示通道仍保留旧状态。', tone: 'warning' },
        { min: 3500, max: 5000, label: '临界区', detail: '转子条纹明显加速，独立观测与显示通道出现可见差异。', tone: 'danger' },
      ],
    },
    { id: 'run-experiment', type: 'button', label: '开始注入', action: 'play-from', at: 0 },
    { id: 'pause-experiment', type: 'button', label: '暂停', action: 'pause' },
    { id: 'emergency-stop', type: 'button', label: '紧急停机', action: 'seek', at: 64 },
    { id: 'reset-experiment', type: 'button', label: '重置', action: 'reset' },
  ],
  nodes: [
    model('controller', 'industrial-controller', [-5.3, 0, -3.8], [0.7, 0.7, 0.7], '控制输入', '输入只驱动本地确定性时间线，不连接真实控制系统。', '#62899a'),
    model('drive', 'industrial-drive', [-5, 0, 3.5], [0.76, 0.76, 0.76], '驱动侧', '表示控制命令进入设备侧的概念位置。', '#6c8c91'),
    node({ id: 'centrifuge-a', kind: 'model', model: 'centrifuge-housing', position: [-2.7, 0, 0], scale: [0.88, 0.88, 0.88], color: '#97a9b0', params: { detail: 2, speed: 1, cutaway: true }, role: 'primary', assetRole: 'centrifuge-teaching-enclosure', label: '级联单元 A', detail: '剖开的前半壳体让内部转子和示踪带始终可见。' }),
    node({ id: 'centrifuge-b', kind: 'model', model: 'centrifuge-housing', position: [0, 0, 0], scale: [0.88, 0.88, 0.88], color: '#97a9b0', params: { detail: 2, speed: 1, cutaway: true }, role: 'primary', assetRole: 'centrifuge-teaching-enclosure', label: '级联单元 B', detail: '转子与机壳是不同实体；拖动视角可检查其装配关系。' }),
    node({ id: 'centrifuge-c', kind: 'model', model: 'centrifuge-housing', position: [2.7, 0, 0], scale: [0.88, 0.88, 0.88], color: '#97a9b0', params: { detail: 2, speed: 1, cutaway: true }, role: 'primary', assetRole: 'centrifuge-teaching-enclosure', label: '级联单元 C', detail: '偏心纵向示踪带用于辨认轴对称转子的角位移。' }),
    model('observer', 'server-rack', [5.3, 0, -3.8], [0.62, 0.62, 0.62], '独立观测', '绿色标记代表独立于显示通道的教学观测。', '#70ae9d'),
    ...[-2.7, 0, 2.7].flatMap((_, index) => {
      const suffix = String.fromCharCode(97 + index);
      return [
        node({ id: `rotor-${suffix}`, kind: 'cylinder', parent: `centrifuge-${suffix}`, position: [0, 0.2947, 0.0265], params: { top: 0.34, bottom: 0.34, height: 2.42 }, color: '#9fb4be', metalness: 0.8, roughness: 0.2, role: 'primary', represents: `单元${suffix.toUpperCase()}内部转子`, label: `转子 ${suffix.toUpperCase()}`, detail: '独立圆柱转子在机壳空腔内绕 Y 轴转动。' }),
        node({ id: `rotor-${suffix}-stripe`, kind: 'box', parent: `rotor-${suffix}`, position: [0, 0, 0.38], params: { width: 0.045, height: 2.18, depth: 0.045 }, color: index === 1 ? '#ffb05f' : '#5de0e5', emissive: 0.75, metalness: 0.1, roughness: 0.28, role: 'logic', represents: `转子${suffix.toUpperCase()}偏心纵向示踪条纹` }),
      ];
    }),
    node({ id: 'evidence-panel', kind: 'box', position: [0, -0.25, 4.05], params: { width: 5.1, height: 1.7, depth: 0.12 }, color: '#0c2737', roughness: 0.78, metalness: 0.15, label: '双通道证据板', detail: '上方橙色代表物理状态，下方蓝色代表显示状态；横向差距表示偏差。' }),
    node({ id: 'actual-state', kind: 'sphere', position: [-1.4, 0.08, 4.24], params: { radius: 0.15 }, color: '#ff9f5b', emissive: 0.85, role: 'logic', represents: '物理真实转速指针', label: '物理真实状态', detail: '随实验输入向右移动。' }),
    node({ id: 'displayed-state', kind: 'sphere', position: [-1.4, -0.48, 4.24], params: { radius: 0.15 }, color: '#57d8e8', emissive: 0.7, role: 'logic', represents: 'HMI显示转速指针', label: 'HMI 显示状态', detail: '偏差阶段保持旧值，最后才恢复一致。' }),
    node({ id: 'independent-state', kind: 'sphere', position: [-1.4, 0.62, 4.24], params: { radius: 0.13 }, color: '#79dfad', emissive: 0.2, role: 'logic', label: '独立观测', detail: '在复核章节亮起并跟随物理状态。' }),
    ...[
      ['debris-c-1', [-0.42, 0.85, 0.48], '#d9e3e8'], ['debris-c-2', [0.35, 0.62, 0.55], '#91a8b3'],
      ['debris-c-3', [-0.28, -0.1, 0.58], '#ff9f5b'], ['debris-c-4', [0.42, 0.05, 0.5], '#a9bac2'],
      ['debris-c-5', [-0.12, 1.35, 0.32], '#78929f'], ['debris-c-6', [0.18, -0.55, 0.42], '#d4a469'],
    ].map(([id, position, color]) => node({id:id as string,kind:'box',parent:'centrifuge-c',position:position as Vector,
      params:{width:.26,height:.14,depth:.2},color:color as string,opacity:.02,metalness:.72,roughness:.24,role:'primary',
      represents:`离心机 C 物理解体碎片 ${String(id).at(-1)}`,label:`碎片 ${String(id).at(-1)}`,
      detail:'从机壳附近显现并沿独立三维轨道飞散，用于核对级联破坏是否真正发生在实体几何上。'})),
  ],
  connections: [
    link('command-link', 'controller', 'drive', [[-6.2, -1.3, -1.2], [-6.2, -1.3, 2.1]], '#57d8e8', '控制输入路径'),
    link('drive-cascade', 'drive', 'centrifuge-a', [[-3.9, -1.2, 2.5], [-3.5, -1.2, 0.8]], '#f0b268', '驱动路径示意'),
    link('observation-link', 'centrifuge-c', 'observer', [[3.8, 1.6, -0.3], [4.6, 1.6, -2.4]], '#79dfad', '独立观测路径'),
  ],
  tracks: [
    animate('rotor-a', 'rotation', [[0, [0, 0, 0]], [16, [0, Math.PI * 4, 0]], [32, [0, Math.PI * 10, 0]], [48, [0, Math.PI * 20, 0]], [64, [0, Math.PI * 36, 0]], [70, [0, Math.PI * 38, 0]], [76, [0, Math.PI * 38.5, 0]]], 'linear'),
    animate('rotor-b', 'rotation', [[0, [0, 0, 0]], [16, [0, Math.PI * 5, 0]], [32, [0, Math.PI * 12, 0]], [48, [0, Math.PI * 23, 0]], [64, [0, Math.PI * 38, 0]], [70, [0, Math.PI * 40, 0]], [76, [0, Math.PI * 40.5, 0]]], 'linear'),
    animate('rotor-c', 'rotation', [[0, [0, 0, 0]], [16, [0, Math.PI * 4.5, 0]], [32, [0, Math.PI * 11, 0]], [48, [0, Math.PI * 21.5, 0]], [64, [0, Math.PI * 36, 0]], [70, [0, Math.PI * 38, 0]], [76, [0, Math.PI * 38.5, 0]]], 'linear'),
    animate('actual-state', 'position', [[0, [-1.4, 0.08, 4.24]], [20, [-1.4, 0.08, 4.24]], [42, [1.35, 0.08, 4.24]], [64, [1.35, 0.08, 4.24]], [76, [0, 0.08, 4.24]]]),
    animate('independent-state', 'position', [[0, [-1.4, 0.62, 4.24]], [36, [-1.4, 0.62, 4.24]], [48, [1.35, 0.62, 4.24]], [64, [1.35, 0.62, 4.24]], [76, [0, 0.62, 4.24]]]),
    animate('independent-state', 'emissive', [[0, 0.2], [36, 0.2], [40, 1.15], [64, 0.75], [76, 0.45]]),
    animate('displayed-state', 'position', [[0, [-1.4, -0.48, 4.24]], [56, [-1.4, -0.48, 4.24]], [68, [1.35, -0.48, 4.24]], [76, [0, -0.48, 4.24]]]),
    animate('centrifuge-c', 'explode', [[0, 0], [47.9, 0], [54, .7], [76, .7]]),
    ...[
      ['debris-c-1', [-.42,.85,.48], [-1.5,2.05,1.55]], ['debris-c-2', [.35,.62,.55], [1.55,1.72,1.68]],
      ['debris-c-3', [-.28,-.1,.58], [-1.7,-.35,1.72]], ['debris-c-4', [.42,.05,.5], [1.82,.08,1.45]],
      ['debris-c-5', [-.12,1.35,.32], [-.35,2.9,.92]], ['debris-c-6', [.18,-.55,.42], [.72,-1.65,1.28]],
    ].flatMap(([id,start,end])=>[
      animate(id as string,'opacity',[[0,.02],[47.9,.02],[48.2,.92],[76,.92]]),
      animate(id as string,'position',[[0,start as Vector],[47.9,start as Vector],[58,end as Vector],[76,end as Vector]]),
    ]),
  ],
  shots: [
    { at: 0, position: [0, 7, 16.5], target: [0, 0, -0.2], fov: 43 },
    { at: 16, position: [-4.8, 3.6, 8.2], target: [-2.7, 0.2, 0], fov: 41, frame: { nodes: ['centrifuge-a', 'rotor-a'], padding: 1.28 } },
    { at: 30, position: [3.8, 3.2, 7.6], target: [0, 0.25, 0], fov: 39, frame: { nodes: ['centrifuge-b', 'rotor-b'], padding: 1.22 } },
    { at: 44, position: [2.5, 2.7, 8], target: [0, 0.05, 4.05], fov: 40, frame: { nodes: ['evidence-panel', 'actual-state', 'displayed-state', 'independent-state'], padding: 1.25 } },
    { at: 58, position: [5.8, 3.8, 8.8], target: [2.7, 0.45, 0.45], fov: 41, frame: { nodes: ['centrifuge-c', 'debris-c-1', 'debris-c-2', 'debris-c-3', 'debris-c-4'], padding: 1.28 } },
    { at: 68, position: [-2.5, 2.6, 8], target: [0, 0.05, 4.05], fov: 40, frame: { nodes: ['evidence-panel', 'actual-state', 'displayed-state', 'independent-state'], padding: 1.25 } },
    { at: 76, position: [0, 7, -16.5], target: [0, 0, -0.2], fov: 43 },
  ],
  chapters: [
    { at: 0, title: '建立三维基线', caption: '三台剖面机壳内都能看到独立圆柱转子和偏心示踪带。拖动视角、滚轮缩放后，条纹仍可用于确认角位移；此阶段三条证据标记保持一致。', focus: ['centrifuge-a', 'centrifuge-b', 'centrifuge-c', 'rotor-a', 'rotor-b', 'rotor-c'], question: '哪些实体在旋转，哪些外壳保持固定？' },
    { at: 16, title: '输入映射到真实动作', caption: '实验输入映射到统一时间线，三根转子的真实 Y 轴旋转轨道继续推进。示踪带与转子属于同一父子层级，因此不会脱离转子表面。', focus: ['controller', 'rotor-a', 'rotor-b', 'rotor-c'], question: '怎样从偏心条纹判断转子确实发生了角位移？' },
    { at: 32, title: '显示值与物理状态分离', caption: '橙色物理状态向右移动，蓝色显示状态仍停留在旧值。转子没有因为显示值不变而停止；需要同时观察实体动作和证据板。', focus: ['actual-state', 'displayed-state', 'rotor-b'], question: '只读蓝色显示会遗漏哪项可见证据？' },
    { at: 48, title: '级联物理破坏与独立观测', caption: '离心机 C 的机壳真实展开，六块实体碎片从隐藏状态显现并沿不同三维轨道飞散；同时绿色独立观测追上橙色物理状态，蓝色显示仍保留旧值。暂停后可旋转视角核对碎片、来源机壳和三条读数证据。', focus: ['centrifuge-c', 'rotor-c', 'debris-c-1', 'debris-c-2', 'debris-c-3', 'actual-state', 'displayed-state', 'independent-state'], question: '哪些可见几何变化证明发生了物理解体，而不是字幕或闪光效果？' },
    { at: 64, title: '紧急停机与复位', caption: '紧急停机跳到受控减速段，三根转子明显降速并接近停住；显示标记开始追上物理与独立观测。重置按钮会回到初始输入、时间、转子角度和证据位置。', focus: ['displayed-state', 'actual-state', 'independent-state', 'rotor-c'], question: '紧急停机与重置分别改变了哪些状态？' },
  ],
  coverage: {objects: [
    {name:'三台可交互离心机及独立转子',nodes:['centrifuge-a','centrifuge-b','centrifuge-c','rotor-a','rotor-b','rotor-c']},
    {name:'离心机 C 物理解体碎片',nodes:['debris-c-1','debris-c-2','debris-c-3','debris-c-4','debris-c-5','debris-c-6']},
  ], interactions: [
    {description:'HMI显示转速与物理真实转速分离',chapter:2,targets:['displayed-state','actual-state','independent-state'],properties:['position']},
    {description:'离心机级联物理破坏与碎片飞散',chapter:3,targets:['centrifuge-c','debris-c-1','debris-c-2','debris-c-3','debris-c-4'],properties:['explode','position','opacity']},
    {description:'紧急停机后转子受控减速',chapter:4,targets:['rotor-a','rotor-b','rotor-c'],properties:['rotation']},
  ]},
};

export const referenceScenes: CinematicScene[] = [industrialLoop, memoryCall, molecularPairing, centrifugeCascade];
