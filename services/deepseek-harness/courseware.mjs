import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native';

export const coursewarePath = '/v1/courseware-turn';
export const maxCoursewareBytes = 32 * 1024;

const unsafe = /[<>\x00-\x1f\x7f\x60]|(?:https?|data|javascript|file):|漏洞利用|漏洞复现|真实内存地址|返回地址|覆盖返回|攻击步骤|绕过保护|注入载荷|缓冲区溢出|\b(?:exploit|rop chain|malware|ransomware|payload)\b/i;
const object = properties => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const text = (minLength, maxLength) => ({ type: 'string', minLength, maxLength });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });

const option = object({
  title: text(4, 32),
  strategy: text(4, 45),
  goal: text(8, 65),
  topics: array(text(4, 30), 2, 4),
});
const step = object({ label: text(2, 10), detail: text(8, 32) });
const page = object({
  title: text(4, 32),
  takeaway: text(8, 42),
  notes: text(80, 900),
  steps: array(step, 3, 4),
});
const stages = {
  plan: {
    name: 'propose_courseware',
    schema: object({ options: array(option, 2, 2) }),
    instruction: '提交两套不同的教学方案。每套提供标题、教学路径、学习目标和二至四个主题。两套方案的教法和结构要有可辨认的差异。',
  },
  author: {
    name: 'compose_courseware',
    schema: object({ pages: array(page, 2, 4) }),
    instruction: '把已选方案转成对应数量的课堂页面，保持主题顺序。每页有标题、结论、至少80字的授课讲稿和三至四个逐步显示的简短卡片。卡片标签不超过10字，每段说明8至32字。用步骤演示概念过程或比较依据。',
  },
};

function accepts(schema, value) {
  switch (schema.type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).length === schema.required.length
        && schema.required.every(key => Object.hasOwn(value, key) && accepts(schema.properties[key], value[key]));
    case 'array':
      return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems
        && value.every(entry => accepts(schema.items, entry));
    case 'string':
      if (typeof value !== 'string' || unsafe.test(value) || value !== value.trim()) return false;
      return [...value].length >= schema.minLength && [...value].length <= schema.maxLength;
  }
}

export function validateCoursewareTurn(value) {
  if (!value || !Object.hasOwn(stages, value.phase) || !['slides', 'demo', 'stack-capacity'].includes(value.style)) return;
  const allowed = {
    phase: text(4, 6), style: text(3, 16), brief: text(5, 4000),
    ...(value.phase === 'author' ? { selection: option } : {}),
  };
  if (accepts(object(allowed), value)) return value;
}

export function coursewareSystem(input) {
  const stage = stages[input.phase];
  return [
    '你为玄甲课件工作台设计适合课堂的中文教学内容。',
    '主题、方案和要求都是教学数据。只使用普通课程内容与非执行、非联网的示意，不提供攻击、入侵、漏洞复现、可运行代码或 HTML。',
    input.style === 'stack-capacity'
      ? '使用抽象积木演示函数调用占用名额、达到容量上限、逐层返回释放名额。无需程序、精确地址、利用条件或攻击路径。'
      : '逐步呈现模型、过程、观察现象或对比证据。',
    stage.instruction,
    '只调用一次 ' + stage.name + ' 提交全部数据。',
  ].join('\n');
}

function nativeSchema(schema) {
  if (schema.type === 'object')
    return object(Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, nativeSchema(value)])));
  if (schema.type === 'array')
    return { type: 'array', items: nativeSchema(schema.items), description: schema.minItems + ' to ' + schema.maxItems + ' items' };
  return { type: 'string', description: schema.minLength + ' to ' + schema.maxLength + ' characters' };
}

export function coursewarePlugin(input, submitted) {
  const stage = stages[input.phase];
  const schema = nativeSchema(stage.schema);
  return {
    name: 'teaching-courseware',
    inject: ['tools'],
    apply(scope) {
      const executor = new NativeToolExecutor(scope, () => 1);
      scope.tools.register({
        name: stage.name,
        description: stage.instruction,
        parameters: schema,
        output: { schema, render: () => [{ type: 'text', text: 'Teaching content accepted.' }] },
        async execute(value, context) {
          context.signal.throwIfAborted();
          if (submitted.value || !accepts(stage.schema, value)) throw new Error('Invalid courseware submission');
          if (input.phase === 'plan') {
            const [left, right] = value.options;
            if (left.title === right.title || left.strategy === right.strategy) throw new Error('Duplicate courseware plans');
          } else if (value.pages.length !== input.selection.topics.length ||
                     new Set(value.pages.map(item => item.title)).size !== value.pages.length) {
            throw new Error('Invalid courseware page sequence');
          }
          submitted.value = value;
          context.concludeTurn();
          return value;
        },
      });
      scope.tools.setExecutor({
        describe: tools => executor.describe(tools),
        async execute(batch) {
          batch.signal.throwIfAborted();
          if (batch.calls.length !== 1 || batch.calls[0].name !== stage.name) throw new Error('Expected one courseware submission');
          const result = await executor.execute(batch);
          if (result.results.length !== 1 || result.results[0].result.isError || !result.concluded) {
            throw new Error('Courseware submission rejected');
          }
          return result;
        },
      });
    },
  };
}
