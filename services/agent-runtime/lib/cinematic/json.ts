export interface CinematicJsonRepair {
  operation: 'insert-comma' | 'remove-trailing-comma';
  offset: number;
  path: string;
}

export interface CinematicJsonResult {
  value: unknown;
  json: string;
  repairs: CinematicJsonRepair[];
  source: { start: number; end: number; envelope: 'raw' | 'json-fence' };
}

export class CinematicJsonError extends SyntaxError {
  constructor(
    public readonly code: string,
    public readonly offset: number,
    detail: string,
  ) {
    super(`${code} at position ${offset}: ${detail}`);
    this.name = 'CinematicJsonError';
  }
}

type Token = { kind: string; start: number; end: number; value?: string };
const whitespace = (character: string) => /[ \t\r\n]/.test(character);
const valueStart = (token?: Token) => !!token && ['{', '[', 'string', 'value'].includes(token.kind);

export function parseCinematicJson(response: string): CinematicJsonResult {
  const fail = (code: string, offset: number, detail: string): never => {
    throw new CinematicJsonError(code, offset, detail);
  };
  if (typeof response !== 'string' || response.length > 2_000_000)
    fail('INVALID_INPUT', 0, '需要不超过200万字符的完整JSON响应');
  let start = 0,
    end = response.length;
  while (start < end && whitespace(response[start])) start++;
  while (end > start && whitespace(response[end - 1])) end--;
  let envelope: CinematicJsonResult['source']['envelope'] = 'raw';
  if (response.slice(start, start + 3) === '```') {
    const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(response.slice(start, end));
    if (!fenced)
      fail('AMBIGUOUS_ENVELOPE', start, '只接受单个完整JSON代码块，不提取多候选或说明文字');
    start += fenced![0].indexOf('\n') + 1;
    end = start + fenced![1].length;
    envelope = 'json-fence';
  }
  const tokens: Token[] = [];
  for (let cursor = start; cursor < end; ) {
    const at = cursor,
      character = response[cursor];
    if (whitespace(character)) {
      cursor++;
      continue;
    }
    if ('{}[]:,'.includes(character)) {
      tokens.push({ kind: character, start: cursor, end: ++cursor });
    } else if (character === '"') {
      cursor++;
      let closed = false;
      while (cursor < end) {
        if (response[cursor] === '\\') cursor += 2;
        else if (response[cursor++] === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) fail('TRUNCATED_STRING', at, '不补齐字符串或转义序列');
      let value: string;
      try {
        value = JSON.parse(response.slice(at, cursor)) as string;
      } catch {
        fail('INVALID_STRING', at, '字符串必须包含完整合法的JSON转义，不修改字符串内容');
      }
      tokens.push({ kind: 'string', start: at, end: cursor, value: value! });
    } else {
      const match = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
        response.slice(cursor, end),
      );
      if (!match) fail('INVALID_TOKEN', cursor, '只接受完整JSON token，不补值、不改数字或布尔值');
      cursor += match![0].length;
      tokens.push({ kind: 'value', start: at, end: cursor });
    }
    if (tokens.length > 200_000) fail('TOKEN_LIMIT', at, 'JSON token数量超出保守解析上限');
  }
  if (!tokens.length || !['{', '['].includes(tokens[0].kind))
    fail('INVALID_ROOT', start, '需要单个完整JSON对象或数组，不搜索文本中的候选');
  const repairs: CinematicJsonRepair[] = [];
  let index = 0;
  const expect = (kind: string) => {
    const token = tokens[index];
    if (!token || token.kind !== kind)
      fail('INCOMPLETE_STRUCTURE', token?.start ?? end, `需要 ${kind}，不补闭合结构或冒号`);
    index++;
    return token;
  };
  const missingComma = (path: string) => {
    const before = tokens[index - 1],
      after = tokens[index];
    if (
      before.end === after.start &&
      !['}', ']'].includes(before.kind) &&
      !['{', '['].includes(after.kind)
    )
      fail('AMBIGUOUS_TOKEN_BOUNDARY', after.start, '相邻标量没有明确边界，不猜测逗号或改写token');
    repairs.push({ operation: 'insert-comma', offset: after.start, path });
  };
  const parseValue = (path: string, depth: number): void => {
    if (depth > 128) fail('DEPTH_LIMIT', tokens[index]?.start ?? end, 'JSON嵌套过深');
    const token = tokens[index];
    if (!valueStart(token)) fail('MISSING_VALUE', token?.start ?? end, '不补造或删除JSON值');
    if (token.kind === 'string' || token.kind === 'value') {
      index++;
      return;
    }
    const object = token.kind === '{',
      close = object ? '}' : ']';
    index++;
    if (tokens[index]?.kind === close) {
      index++;
      return;
    }
    const keys = new Set<string>();
    let element = 0;
    while (index < tokens.length) {
      let childPath = `${path}/${element++}`;
      if (object) {
        const key = expect('string');
        if (keys.has(key.value!)) fail('DUPLICATE_KEY', key.start, '重复键有歧义，不选择覆盖值');
        keys.add(key.value!);
        childPath = `${path}/${key.value!.replace(/~/g, '~0').replace(/\//g, '~1')}`;
        expect(':');
      }
      parseValue(childPath, depth + 1);
      if (tokens[index]?.kind === close) {
        index++;
        return;
      }
      if (tokens[index]?.kind === ',') {
        const comma = tokens[index++];
        if (tokens[index]?.kind === close) {
          repairs.push({ operation: 'remove-trailing-comma', offset: comma.start, path });
          index++;
          return;
        }
      } else if (
        object
          ? tokens[index]?.kind === 'string' && tokens[index + 1]?.kind === ':'
          : valueStart(tokens[index])
      ) {
        missingComma(path);
      } else {
        fail('INCOMPLETE_STRUCTURE', tokens[index]?.start ?? end, `需要逗号或 ${close}，不补结构`);
      }
    }
    fail('TRUNCATED_STRUCTURE', end, `缺少 ${close}，不截断或补齐JSON`);
  };
  parseValue('', 0);
  if (index !== tokens.length)
    fail('MULTIPLE_JSON_CANDIDATES', tokens[index].start, '根结构之后仍有token，不挑选或拼接候选');
  let json = response.slice(start, end);
  for (const repair of [...repairs].sort((a, b) => b.offset - a.offset)) {
    const offset = repair.offset - start;
    json =
      repair.operation === 'insert-comma'
        ? json.slice(0, offset) + ',' + json.slice(offset)
        : json.slice(0, offset) + json.slice(offset + 1);
  }
  return {
    value: JSON.parse(json) as unknown,
    json,
    repairs: repairs.sort((a, b) => a.offset - b.offset),
    source: { start, end, envelope },
  };
}
