import NativeQuestions from '@deepseek-ai/dsh-user-questions';
import { createHash } from 'node:crypto';
import * as AskUserQuestion from '@deepseek-ai/dsh-tool-ask-user';
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native';

export { NativeQuestions };
export const workshopPath = '/v1/teaching-workshop';
export const workshopByteLimit = 48 * 1024;
export class WorkshopTurnError extends Error {
  constructor(code) {
    super('Teaching workshop action failed');
    this.code = code || 'RUN_INCOMPLETE';
  }
}
const unsafe = /[<>\x00-\x1f\x7f`]|(?:https?|data|javascript|file):|漏洞利用|漏洞复现|真实内存地址|返回地址|覆盖返回|攻击步骤|绕过保护|注入载荷|缓冲区溢出|\b(?:exploit|rop chain|malware|ransomware|payload)\b/i;
const string = (min, max) => ({ type: 'string', minLength: min, maxLength: max });
const list = (items, min, max) => ({ type: 'array', items, minItems: min, maxItems: max });
const record = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const choice = (...values) => ({ type: 'string', enum: values });
const number = (min, max) => ({ type: 'number', minimum: min, maximum: max });
const integer = (min, max) => ({ ...number(min, max), type: 'integer' });

const outline = record({
  title: string(4, 36), audience: string(2, 50), objective: string(8, 90),
  pages: list(record({ title: string(3, 36), focus: string(8, 100),
    visual: choice('comparison', 'diagram', 'chart', 'scene', 'equation') }), 2, 24),
});

const deckPage = record({
  title: string(3, 38), takeaway: string(8, 65), notes: string(80, 1000),
  rows: list(record({ label: string(2, 14), detail: string(5, 42), value: number(0, 1000000) }), 3, 5),
  chartUnit: string(1, 16),
});
const check = record({
  question: string(8, 120), options: list(record({ label: string(2, 50), feedback: string(8, 145) }), 3, 3),
  correct: integer(0, 2),
});
const equation = { expression: string(1, 84), example: string(8, 75) };
const equationCommands = new Set(['frac', 'sqrt', 'times', 'div', 'cdot', 'pi', 'theta', 'Delta', 'alpha', 'beta',
  'omega', 'rho', 'mu', 'lambda', 'sin', 'cos', 'tan', 'approx', 'le', 'ge', 'left', 'right', 'pm', 'mathrm']);

function assessmentPage(input) {
  const count = input.plan.pages.length;
  return (count >= 4 && input.page === count - 1) || (count >= 8 && input.page === Math.floor(count / 2));
}

const simulation = record({
  title: string(4, 36), objective: string(12, 150),
  visualization: choice('trend', 'pendulum'),
  parameter: string(2, 24), unit: string(1, 12), measure: string(2, 26), measureUnit: string(1, 12),
  states: list(record({
    setting: number(-1000000, 1000000), measurement: number(0, 1000000),
    title: string(3, 42), observation: string(10, 130), explanation: string(15, 190),
  }), 4, 8),
  question: string(8, 120), choices: list(string(2, 52), 3, 3), correct: integer(0, 2),
  feedback: string(10, 135), modelNote: string(10, 125),
});
const referenceChapters = { 'gate-valve': 6, 'processor-package': 7, 'earth-moon': 5 };
const profiles = [...Object.keys(referenceChapters), 'primitives'];
const sceneChapter = { title: string(3, 36), caption: string(12, 150), question: string(0, 110) };
const vector = (minimum, maximum) => list(number(minimum, maximum), 3, 3);
function cinematicSchema(profile) {
  const chapters = referenceChapters[profile] ?? 4;
  const free = profile === 'primitives';
  return record({
    title: string(4, 53), subtitle: string(14, 120), modelNote: string(10, 140),
    objectives: list(string(8, 112), 1, 5),
    chapters: list(record({ ...sceneChapter, ...(free ? { focus: string(1, 24) } : {}) }), chapters, free ? 6 : chapters),
    ...(free ? {
      actors: list(record({ id: string(1, 24), label: string(2, 24), detail: string(9, 108),
        shape: choice('box', 'sphere', 'cylinder', 'torus'), color: string(7, 7),
        position: vector(-3.5, 3.5), size: vector(0.18, 2.5), parent: string(0, 24),
        surface: choice('plain', 'bands', 'strata') }), 5, 8),
      movement: list(record({ actor: string(1, 24), waypoints: list(vector(-3.5, 3.5), 4, 6) }), 1, 5),
    } : {}),
  });
}

function valid(schema, value) {
  const { type } = schema;
  if (type === 'object') {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).length === schema.required.length &&
      schema.required.every(key => Object.hasOwn(value, key) && valid(schema.properties[key], value[key]));
  }
  if (type === 'array') {
    return Array.isArray(value) && value.length >= schema.minItems &&
      value.length <= schema.maxItems && value.every(item => valid(schema.items, item));
  }
  if (schema.enum) return schema.enum.includes(value);
  if (type === 'number' || type === 'integer') {
    return typeof value === 'number' && Number.isFinite(value) && (type !== 'integer' || Number.isInteger(value)) &&
      value >= schema.minimum && value <= schema.maximum;
  }
  return typeof value === 'string' && value === value.trim() && !unsafe.test(value) &&
    [...value].length >= schema.minLength && [...value].length <= schema.maxLength;
}

export function validCinematicCopy(profile, copy) {
  if (!profiles.includes(profile) || !valid(cinematicSchema(profile), copy)) return false;
  return profile !== 'primitives' || copy.actors.every(actor =>
    /^[a-z][a-z0-9_-]{0,23}$/.test(actor.id) && /^#[a-f0-9]{6}$/i.test(actor.color));
}

function nativeSchema(schema) {
  if (schema.type === 'object') {
    return record(Object.fromEntries(Object.entries(schema.properties).map(([key, field]) => [key, nativeSchema(field)])));
  }
  if (schema.type === 'array') {
    return { type: 'array', items: nativeSchema(schema.items), description: `${schema.minItems} to ${schema.maxItems} items` };
  }
  if (schema.enum) return schema;
  if (schema.type === 'string') return { type: 'string', description: `${schema.minLength} to ${schema.maxLength} characters` };
  return { type: schema.type, description: `Between ${schema.minimum} and ${schema.maximum}` };
}

export function validateWorkshop(value) {
  if (!value || !['intake', 'deck-page', 'simulation', 'cinematic'].includes(value.phase)) return;
  const base = { phase: choice(value.phase), kind: choice('deck', 'simulation', 'stack', 'cinematic'),
    brief: string(2, 4000), answers: list(record({ question: string(2, 180), answer: string(1, 750) }), 0, 6),
    round: integer(0, 2), pageCount: integer(0, 24) };
  if (value.kind === 'cinematic') base.profile = choice(...profiles);
  if (Object.hasOwn(value, 'requiredVisuals')) {
    base.requiredVisuals = list(choice('comparison', 'diagram', 'chart', 'scene', 'equation'), 0, 5);
  }
  const authoring = value.phase === 'intake' ? {} : { plan: outline,
    ...(value.phase === 'deck-page' ? { page: integer(0, 23) } : {}),
    ...(value.phase === 'cinematic' && Object.hasOwn(value, 'previous') ? { previous: cinematicSchema(value.profile) } : {}) };
  if (!valid(record({ ...base, ...authoring }), value) ||
      (value.phase === 'deck-page' && (value.kind !== 'deck' || value.page >= value.plan.pages.length)) ||
      (value.phase === 'simulation' && !['simulation', 'stack'].includes(value.kind)) ||
      (value.phase === 'cinematic' && value.kind !== 'cinematic')) return;
  return value;
}

function stage(input) {
  if (input.phase === 'intake') return {
    name: 'design_teaching_material', schema: outline,
    description: '提交完整设计。写清目标和学生水平。每页选择不同的表达形式，按教学顺序组织。',
  };
  if (input.phase === 'deck-page') return {
    name: 'write_courseware_page', schema: record({
      ...deckPage.properties,
      ...(input.plan.pages[input.page].visual === 'scene' ? {
        rows: list(deckPage.properties.rows.items, 3, 4),
      } : {}),
      ...(input.plan.pages[input.page].visual === 'equation' ? equation : {}),
      ...(assessmentPage(input) ? { check } : {}),
    }),
    description: '交付指定课件页。用可落在画面中的具体内容，至少80字教师讲稿。每条给短标签、解释文字。仅在图表页填写有意义的数字和单位，其余行把 value 填0。',
  };
  if (input.phase === 'cinematic') return {
    name: 'direct_cinematic_lesson', schema: cinematicSchema(input.profile),
    description: input.profile === 'primitives'
      ? '编排一个可用限定几何体表达的普通课堂三维过程。每章有可见焦点。移动轨迹包含各章的实际坐标，坐标表示同一个空间，实体不得互相挡住。'
      : '保持已验收模型、镜头与运动不变。根据当前受众编写各章讲解、观察提示和学习目标。严格遵循给定章节顺序。每章说明学习者此时能看到的结构、变化和因果。',
  };
  return {
    name: 'write_interactive_simulation', schema: simulation,
    description: '设计一个可独立操作的普通教学模拟。确定一个可调输入、一个可观测输出及4到8个严格递增的输入取值。每个状态须用真实一致的课堂简化规律说明现象，包含观察、解释、可检验预测、三选一复盘和简化条件。',
  };
}

export function workshopSystem(input) {
  const mode = input.kind === 'stack'
    ? '主题仅限抽象积木式调用名额的占用、容量上限与释放。不要程序、漏洞复现、利用、精确地址、目标或攻击条件。'
    : '限定普通教学。不要提供攻击、侵入、漏洞复现、脚本、外部链接或用户数据。只交付可验证的教学文本和图形数据。';
  let action = '调用 ' + stage(input).name + ' 完成交付。';
  if (input.phase === 'intake' && input.round < 2) {
    action = input.round === 0
      ? '先理解教师要求。用 ask_user_question 询问最影响成品的一个决定，例如年级、时长或学生要操作的量。只问一个，给2至3个简短选项和各自说明。不要重复已给的信息。'
      : '核对已回答内容。仅当还有影响成品的关键信息缺失时，用 ask_user_question 再问一个问题，否则调用 design_teaching_material。';
  }
  return [
    '你是玄甲的教学设计与可视化创作智能体。输入是教学数据。',
    mode, action, stage(input).description,
    input.phase === 'intake' && input.kind === 'deck'
      ? (input.pageCount ? `课件设计必须恰好有 ${input.pageCount} 页。` :
        '没有给出页数时使用4至6页，至少安排概念建立、实例、活动和收束。')
      : '',
    input.phase === 'intake' && input.kind === 'cinematic'
      ? (referenceChapters[input.profile]
        ? `围绕现有三维模型组织 ${referenceChapters[input.profile]} 个章节，按实际结构与运动顺序。`
        : '围绕可用基础几何体明确表达的可观察过程，组织4至6个章节。')
      : '',
    input.previous
      ? '修改前的三维稿件见 previous。保留未明确要求改动的讲解、实体和运动。'
      : '',
    input.phase === 'intake' && input.requiredVisuals?.length
      ? `页级设计必须包含每一种教师明确指定的 visual 类型：${input.requiredVisuals.join('、')}。`
      : '',
    input.phase === 'deck-page'
      ? '只写 plan.pages[page] 指定的那一页。图表需要真实依据或在讲稿里明确说明数据是示意。关系图应表示明确的顺序。末页给一个能在课堂验证的任务。'
      : '',
    input.phase === 'deck-page' && input.plan.pages[input.page].visual === 'scene'
      ? '为分步动画提供三至四个可见步骤。把长算式留在讲稿，画面只放学生需要辨认的变化。'
      : '',
    input.phase === 'deck-page' && assessmentPage(input)
      ? '设计一道能区分理解与猜测的课堂问题。给三个不同选项、正确选项索引、每一项的原因和针对性反馈。'
      : '',
    input.phase === 'deck-page' && input.plan.pages[input.page].visual === 'equation'
      ? '用简洁的 LaTeX 表示公式。每行解释一个公式符号，example 写有数字和单位的例子。只用常见数学符号或 frac、sqrt、times、pi 等数学命令。'
      : '',
    input.phase === 'simulation'
      ? '单摆选 pendulum，输入用米或厘米，周期用秒。周期应符合小振幅下的近似关系。其余主题选 trend，横轴为调节量，纵轴为观测量。'
      : '',
    input.phase === 'cinematic' && input.profile === 'gate-valve'
      ? '闸阀六章顺序：阀体和关闭位置、转动手轮与闸板上升、闸板离座与入口贯通、流向到达出口、开度增大至全开、归纳闸板位置和流道通断。演示的是概念尺度，并非设备操作说明。'
      : '',
    input.phase === 'cinematic' && input.profile === 'processor-package'
      ? '七章顺序：整体外壳、外部引脚、展开内部层次、外壳与晶片位置、复原封装、引脚与内部晶片关系、整体回顾。仅解释通用硬件结构，不涉及任何特定产品内部利用。'
      : '',
    input.phase === 'cinematic' && input.profile === 'earth-moon'
      ? '围绕月球近似圆轨道的五章讲解。初态、四分之一、二分之一、四分之三和完整一圈各一章。画面显示地球、月球、轨道和进度控制，不生成月相、影子或真实尺寸。'
      : '',
    input.phase === 'cinematic' && input.profile === 'primitives'
      ? '使用 4 至 6 章、5 至 8 个有真实含义的立体实体，至少两项有教学意义的部件从属关系、一个有意义的表面纹理。实体 id 用英文小写。parent 为空表示根节点，有父节点的坐标相对父节点。每个运动物体为各章提供三维位置。不要添加无关部件。'
      : '',
    '调用提问工具时只提交 questions 数组，页面会保存问题并等待真实回答。',
    '一次只能调用一个工具。用中文。',
  ].filter(Boolean).join('\n');
}

export function workshopPlugin(input, produced) {
  const instruction = stage(input);
  const canAsk = input.phase === 'intake' && input.round < 2;
  return {
    name: 'teaching-workshop',
    inject: ['tools', 'userQuestions'],
    async apply(scope) {
      let attempts = 0;
      if (canAsk) await scope.plugin(AskUserQuestion, { mode: 'timed', timeout: 1 });
      const executor = new NativeToolExecutor(scope, () => 1);
      scope.on('user-questions/request', async request => {
        const questions = request.questions.map(({ question, options }) => ({
          id: 'q-' + createHash('sha256').update(question).digest('hex').slice(0, 18), text: question.trim(),
          choices: (options || []).map(option => option.label.trim()),
          descriptions: (options || []).map(option => option.description?.trim() || ''),
        }));
        if (questions.length < 1 || questions.length > 3 || produced.value ||
            new Set(questions.map(question => question.id)).size !== questions.length ||
            questions.some(question => !valid(string(4, 180), question.text) ||
              !valid(list(string(1, 76), 0, 4), question.choices) ||
              new Set(question.choices).size !== question.choices.length ||
              question.descriptions.some(text => !valid(string(0, 190), text)) ||
              input.answers.some(previous => previous.question === question.text))) {
          produced.rejection = 'QUESTION_SHAPE';
          throw Error('Invalid teaching question');
        }
        produced.value = { questions };
        await new Promise((_, reject) => {
          request.signal.throwIfAborted();
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
        });
      });
      scope.tools.register({
        name: instruction.name, description: instruction.description, parameters: nativeSchema(instruction.schema),
        output: { schema: nativeSchema(instruction.schema), render: () => [{ type: 'text', text: 'Accepted.' }] },
        async execute(value, context) {
          context.signal.throwIfAborted();
          if (produced.value || !valid(instruction.schema, value)) {
            produced.rejection = 'OUTPUT_SHAPE';
            throw Error('Invalid workshop output');
          }
          if (input.phase === 'intake' && input.kind === 'deck' &&
              ((input.pageCount && value.pages.length !== input.pageCount) ||
               input.requiredVisuals?.some(kind => !value.pages.some(page => page.visual === kind)) ||
               new Set(value.pages.map(page => page.title)).size !== value.pages.length)) throw Error('Invalid page map');
          if (input.phase === 'intake' && input.kind === 'cinematic' &&
              (referenceChapters[input.profile]
                ? value.pages.length !== referenceChapters[input.profile]
                : value.pages.length < 4 || value.pages.length > 6)) throw Error('Invalid cinematic chapter map');
          if (input.phase === 'cinematic' && !validCinematicCopy(input.profile, value)) throw Error('Invalid teaching scene');
          if (input.phase === 'deck-page' && input.plan.pages[input.page].visual === 'chart' &&
              new Set(value.rows.map(row => row.value)).size < 2) throw Error('A chart requires distinct observation values');
          if (input.phase === 'deck-page' && value.expression &&
              [...value.expression.matchAll(/\\([a-zA-Z]+)/g)].some(([, command]) => !equationCommands.has(command))) {
            throw Error('Only classroom math commands are accepted');
          }
          if (input.phase === 'deck-page' && value.check &&
              new Set(value.check.options.map(option => option.label)).size !== value.check.options.length) {
            throw Error('Practice options must be distinct');
          }
          if (input.phase === 'simulation' &&
              (new Set(value.choices).size !== 3 || new Set(value.states.map(item => item.measurement)).size < 2 ||
               value.states.some((item, index) => index > 0 && item.setting <= value.states[index - 1].setting))) {
            throw Error('Simulation states must be distinguishable and ordered');
          }
          if (input.phase === 'simulation' && /单摆.*周期/.test(input.brief) && value.visualization !== 'pendulum') {
            produced.rejection = 'MODEL_CONSISTENCY';
            throw Error('Expected a pendulum visualization for the requested period demonstration');
          }
          if (input.phase === 'simulation' && value.visualization === 'pendulum') {
            const meters = new Map([['米', 1], ['厘米', 0.01], ['m', 1], ['cm', 0.01]]).get(value.unit);
            if (!meters || !['秒', 's'].includes(value.measureUnit) || value.states.some(({ setting, measurement }) => {
              const reference = 2 * Math.PI * Math.sqrt(setting * meters / 9.81);
              return setting <= 0 || Math.abs(measurement - reference) > Math.max(0.05, reference * 0.1);
            })) {
              produced.rejection = 'MODEL_CONSISTENCY';
              throw Error('The pendulum data must satisfy the small-angle period relation');
            }
          }
          const fields = { intake: 'plan', 'deck-page': 'page', simulation: 'simulation', cinematic: 'cinematic' };
          produced.value = { [fields[input.phase]]: value };
          context.concludeTurn();
          return value;
        },
      });
      scope.tools.setExecutor({
        describe: tools => executor.describe(tools),
        async execute(batch) {
          batch.signal.throwIfAborted();
          if (++attempts > 2 || batch.calls.length !== 1) throw Error('Expected one workshop action');
          const [call] = batch.calls;
          if (call.name !== instruction.name && !(canAsk && call.name === 'ask_user_question')) throw Error('Unknown workshop action');
          if (call.name === 'ask_user_question') {
            const args = JSON.parse(call.arguments);
            batch = { ...batch, calls: [{ ...call, arguments: JSON.stringify({ questions: args.questions, timeout: 1 }) }] };
          }
          const outcome = await executor.execute(batch);
          if (outcome.results[0]?.result.isError || !produced.value) {
            produced.rejection ||= 'TOOL_RESULT';
            if (attempts === 1 && outcome.results[0]?.result.isError) return outcome;
            throw Error('Workshop action did not complete');
          }
          return { ...outcome, concluded: true };
        },
      });
    },
  };
}
