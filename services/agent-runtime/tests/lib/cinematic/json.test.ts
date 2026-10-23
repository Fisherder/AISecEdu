import { describe, expect, it } from 'vitest';
import { CinematicJsonError, parseCinematicJson } from '@/lib/cinematic/json';

describe('conservative cinematic JSON punctuation repair', () => {
  it('preserves valid scalar tokens, escapes and whitespace byte for byte', () => {
    const raw =
      '{ "s":"中文\\n\\\"{,}\\\"\\u0061", "n":-1.2300e+02, "b":false, "v":null, "a":[true,0,-0] }';
    const result = parseCinematicJson(raw);
    expect(result.json).toBe(raw);
    expect(result.value).toEqual(JSON.parse(raw));
    expect(result.repairs).toEqual([]);
  });
  it.each([
    ['{"a":1 "b":false}', { a: 1, b: false }],
    ['[1 2 true false null "中文"]', [1, 2, true, false, null, '中文']],
    ['[{"a":1}{"b":2}]', [{ a: 1 }, { b: 2 }]],
    ['{"a":[]"b":{}}', { a: [], b: {} }],
    ['{"a":[1,2,],"b":false,}', { a: [1, 2], b: false }],
    [
      '{"nodes":[{"id":"cpu" "roughness":0,}, {"id":"logic"},]}',
      { nodes: [{ id: 'cpu', roughness: 0 }, { id: 'logic' }] },
    ],
  ])('repairs only unambiguous commas: %s', (raw, expected) => {
    const result = parseCinematicJson(raw);
    expect(result.value).toEqual(expected);
    expect(result.repairs.length).toBeGreaterThan(0);
    let replay = raw;
    for (const repair of [...result.repairs].reverse()) {
      replay =
        repair.operation === 'insert-comma'
          ? replay.slice(0, repair.offset) + ',' + replay.slice(repair.offset)
          : replay.slice(0, repair.offset) + replay.slice(repair.offset + 1);
    }
    expect(replay).toBe(result.json);
    expect(parseCinematicJson(result.json).repairs).toEqual([]);
  });
  it('reports original response offsets and JSON Pointer paths for a single fenced payload', () => {
    const raw = ' \n```json\n{"a/b~":[true false,]}\n```\n';
    const result = parseCinematicJson(raw);
    expect(result.source.envelope).toBe('json-fence');
    expect(result.value).toEqual({ 'a/b~': [true, false] });
    expect(result.repairs).toEqual([
      { operation: 'insert-comma', offset: raw.indexOf('false'), path: '/a~1b~0' },
      { operation: 'remove-trailing-comma', offset: raw.indexOf(',]'), path: '/a~1b~0' },
    ]);
  });
  it('does not interpret punctuation, code fences or think tags inside strings', () => {
    const value = { caption: 'literal <think>{"a":1}</think> ```json , [ 1 2 ]', bool: true };
    const result = parseCinematicJson(JSON.stringify(value));
    expect(result.value).toEqual(value);
    expect(result.repairs).toEqual([]);
  });
  it.each([
    '[{"id":"complete"},{"id":"incomplete"',
    '{"nodes":[{"id":"a"}]',
    '{"a":"incomplete}',
    '{"a":"bad\\q"}',
    '{"a":"bad\\u123"}',
    '{"a":"raw\nnewline"}',
    '{"a":}',
    '{"a" 1}',
    '{"a":1,,"b":2}',
    '[1,,2]',
    '[,1]',
    '{,"a":1}',
    '{"a":[1,2}}',
    '{"a":01}',
    '{"a":1.}',
    '{"a":1e}',
    '{"a":1e+}',
    '{"a":+1}',
    '{"a":NaN}',
    '{"a":undefined}',
    '{"a":True}',
    '[truefalse]',
    '[1-2]',
    '["a""b"]',
    '{"a":"x""b":2}',
    '{"a":"CPU "core" section"}',
    '{"a":1 // comment\n}',
    '{"a":1;}',
    '{a:1}',
    "{'a':1}",
    '{"a":1}\n{"b":2}',
    '[] []',
    'result: {"a":1}',
    '{"a":1} explanation',
    '<think>{"a":1}</think>{"a":2}',
    '```json\n{"a":1}\n```\n```json\n{"b":2}\n```',
    '```json\n{"a":1}',
    '',
  ])('rejects ambiguous, lossy or truncated input: %s', (raw) => {
    expect(() => parseCinematicJson(raw)).toThrow(CinematicJsonError);
  });
  it.each([
    '{"a":1,"a":2}',
    '{"a":1 "a":2}',
    '{"a":1,"\\u0061":2,}',
    '{"nested":{"x":true,"x":false}}',
  ])('rejects duplicate decoded keys rather than taking a last value: %s', (raw) => {
    expect(() => parseCinematicJson(raw)).toThrow('DUPLICATE_KEY');
  });
  it('allows the same property name in separate objects and treats prototype names as data', () => {
    const raw = '[{"a":1,"__proto__":{"x":true}},{"a":2}]';
    expect(parseCinematicJson(raw).value).toEqual(JSON.parse(raw));
    expect(({} as { x?: boolean }).x).toBeUndefined();
  });
  it('enforces a bounded parser depth without attempting to shorten the document', () => {
    expect(() => parseCinematicJson('['.repeat(130) + '0' + ']'.repeat(130))).toThrow(
      'DEPTH_LIMIT',
    );
  });
});
