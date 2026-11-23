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
    visual: choice('comparison', 'diagram', 'chart', 'scene') }), 2, 12),
});

const deckPage = record({
  title: string(3, 38), takeaway: string(8, 65), notes: string(80, 1000),
  rows: list(record({ label: string(2, 14), detail: string(5, 42), value: number(0, 1000000) }), 3, 5),
  chartUnit: string(1, 16),
});
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
  if (!value || !['intake', 'deck-page', 'simulation'].includes(value.phase)) return;
  const base = { phase: choice(value.phase), kind: choice('deck', 'simulation', 'stack'),
    brief: string(2, 4000), answers: list(record({ question: string(2, 180), answer: string(1, 750) }), 0, 6),
    round: integer(0, 2), pageCount: integer(0, 12) };
  if (Object.hasOwn(value, 'requiredVisuals')) {
    base.requiredVisuals = list(choice('comparison', 'diagram', 'chart', 'scene'), 0, 4);
  }
  const authoring = value.phase === 'intake' ? {} : { plan: outline,
    ...(value.phase === 'deck-page' ? { page: integer(0, 11) } : {}) };
  if (!valid(record({ ...base, ...authoring }), value) ||
      (value.phase === 'deck-page' && (value.kind !== 'deck' || value.page >= value.plan.pages.length)) ||
      (value.phase === 'simulation' && value.kind === 'deck')) return;
  return value;
}

function stage(input) {
  if (input.phase === 'intake') return {
    name: 'design_teaching_material', schema: outline,
    description: '提交完整设计。写清目标和学生水平。每页选择不同的表达形式，按教学顺序组织。',
  };
  if (input.phase === 'deck-page') return {
    name: 'write_courseware_page', schema: deckPage,
    description: '交付指定课件页。用可落在画面中的具体内容，至少80字教师讲稿。每条给短标签、解释文字。仅在图表页填写有意义的数字和单位，其余行把 value 填0。',
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
    input.phase === 'intake' && input.requiredVisuals?.length
      ? `页级设计必须包含每一种教师明确指定的 visual 类型：${input.requiredVisuals.join('、')}。`
      : '',
    input.phase === 'deck-page'
      ? '只写 plan.pages[page] 指定的那一页。图表需要真实依据或在讲稿里明确说明数据是示意。关系图应表示明确的顺序。末页给一个能在课堂验证的任务。'
      : '',
    input.phase === 'simulation'
      ? '单摆选 pendulum，输入用米或厘米，周期用秒。周期应符合小振幅下的近似关系。其余主题选 trend，横轴为调节量，纵轴为观测量。'
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
          if (input.phase === 'deck-page' && input.plan.pages[input.page].visual === 'chart' &&
              new Set(value.rows.map(row => row.value)).size < 2) throw Error('A chart requires distinct observation values');
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
          produced.value = { [input.phase === 'intake' ? 'plan' : input.phase === 'deck-page' ? 'page' : 'simulation']: value };
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
