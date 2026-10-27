// Local Zod3 backport of the early upper-size gate in official Zod PR6652.
// Bounded inputs only; these tests do not attempt memory exhaustion.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const expoRequire = createRequire(require.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
const zodEntry = cliRequire.resolve('zod');
const loaders = {
  cjs: async () => cliRequire('zod'),
  esm: async () => import(pathToFileURL(path.join(path.dirname(zodEntry), 'index.js')).href),
};

for (const [format, load] of Object.entries(loaders)) {
  test(`${format}: actual Expo Zod3 upper bounds stop element and outer refinements`, async () => {
    const z = await load();
    assert.equal(cliRequire('zod/package.json').version, '3.25.76');
    let elements = 0, refinements = 0;
    const schema = z.array(z.string().refine(() => { elements++; return true; }))
      .max(2, 'bounded fixture').refine(() => { refinements++; return true; });
    const result = schema.safeParse(Array(64).fill('synthetic'));
    assert.equal(result.success, false);
    assert.equal(elements, 0);
    assert.equal(refinements, 0);
    assert.deepEqual(result.error.issues, [{ code: 'too_big', maximum: 2, type: 'array',
      inclusive: true, exact: false, message: 'bounded fixture', path: [] }]);
  });

  test(`${format}: oversized exact arrays and sets stop before element work`, async () => {
    const z = await load();
    let arrayCalls = 0, setCalls = 0;
    const array = z.object({ values: z.array(z.string().refine(() => { arrayCalls++; return true; })).length(2, 'exact cap') });
    const set = z.set(z.string().refine(() => { setCalls++; return true; })).max(2, 'set cap');
    const arrayResult = array.safeParse({ values: ['a', 'b', 'c'] });
    const setResult = set.safeParse(new Set(['a', 'b', 'c']));
    assert.equal(arrayCalls, 0);
    assert.equal(setCalls, 0);
    assert.equal(arrayResult.success, false);
    assert.equal(setResult.success, false);
    assert.deepEqual(arrayResult.error.issues, [{ code: 'too_big', minimum: undefined, maximum: 2,
      type: 'array', inclusive: true, exact: true, message: 'exact cap', path: ['values'] }]);
    assert.deepEqual(setResult.error.issues, [{ code: 'too_big', maximum: 2, type: 'set',
      inclusive: true, exact: false, message: 'set cap', path: [] }]);
  });

  test(`${format}: asynchronous oversized input schedules no element or outer refinements`, async () => {
    const z = await load();
    let elements = 0, outer = 0;
    const result = await z.array(z.string().refine(async () => { elements++; return true; }))
      .max(2).refine(async () => { outer++; return true; }).safeParseAsync(Array(64).fill('synthetic'));
    assert.equal(result.success, false);
    assert.equal(elements, 0);
    assert.equal(outer, 0);
  });

  test(`${format}: valid transforms, lower bounds, invalid items, and preprocessing retain behavior`, async () => {
    const z = await load();
    let calls = 0;
    const element = z.string().transform(value => { calls++; return value.toUpperCase(); });
    assert.deepEqual(z.array(element).max(2).parse(['a', 'b']), ['A', 'B']);
    assert.equal(calls, 2);
    assert.deepEqual([...z.set(element).max(2).parse(new Set(['a']))], ['A']);
    assert.deepEqual(z.array(element).length(2).parse(['a', 'b']), ['A', 'B']);
    const tooShort = z.array(element).length(2, 'too short').safeParse(['a']);
    assert.equal(tooShort.success, false);
    assert.equal(tooShort.error.issues[0].code, 'too_small');
    assert.equal(tooShort.error.issues[0].message, 'too short');
    assert.equal(z.array(z.string()).min(2).safeParse(['a']).success, false);
    assert.equal(z.set(z.string()).min(2).safeParse(new Set(['a'])).success, false);
    assert.equal(z.array(z.string()).max(2).safeParse([1]).success, false);
    assert.equal(z.array(z.string()).max(2).safeParse('invalid').success, false);
    assert.deepEqual(z.preprocess(values => values.slice(0, 2), z.array(z.string()).max(2)).parse(['a', 'b', 'c']), ['a', 'b']);
    assert.deepEqual(await z.array(z.string()).max(2).parseAsync(['a']), ['a']);
  });
}
