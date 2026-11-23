// PROG-E8D: the cached head of a Vera turn can be measured in real tokens, by hand, and the thing
// measured is the thing sent.
//
// This probe RUNS the shipped reading (scripts/vera-prefix-tokens.mjs over lib/ai/vera/cached-prefix.ts,
// the repo's own code, nothing replaced but `server-only`) against a recorder in place of the SDK
// client, so no network call is made and no key is read. It fails unless:
//   1. a reading sends exactly two token count requests, on the model the tier is configured for, and the
//      first carries Vera's tools and one system block with the cache marker; the second is the message alone;
//   2. that system block is byte for byte the stable block `buildVeraSystem` gives a real turn, and the tools
//      are the ones `veraTurnTools` gives the turn (the live loop takes its tools from the same function);
//   3. the prefix is deterministic: built twice, at two different clock times, the bytes are identical;
//   4. the answer is the difference of the two counts against the tier's minimum, in both directions, and a
//      reply that is not a count is refused, never printed;
//   5. the reading is hand-run only: no package.json script and no workflow names it.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const scriptFile = path.join(root, 'scripts/vera-prefix-tokens.mjs')
assert.ok(fs.existsSync(scriptFile), 'there is no hand-run reading of the cached prefix')
const { loadPrefixModule, takeReading, describePrefix } = await import(pathToFileURL(scriptFile).href)
const mod = await loadPrefixModule()
const at = (file) => import(pathToFileURL(path.join(root, file)).href)
const { MODELS, CACHE_MIN_TOKENS } = await at('lib/ai/models.ts')
const { buildVeraSystem, veraTurnTools } = await at('lib/ai/vera/agent-claude.ts')
const { DEFAULT_VERA_CONFIG } = await at('lib/ai/vera/config.ts')

const recorder = (replies) => {
  const sent = []
  return { sent, messages: { countTokens: async (params, options) => { sent.push({ params, options }); return { input_tokens: replies[sent.length - 1] } } } }
}

// 1 + 2. What a reading sends, per tool set.
assert.ok(mod.VERA_PREFIX_VARIANTS.length >= 3, 'the member, Space manager and operator tool sets are each read')
for (const { name, access } of mod.VERA_PREFIX_VARIANTS) {
  const floor = CACHE_MIN_TOKENS.haiku
  const client = recorder([floor + 250, 9])
  const reading = await takeReading(client, mod, 'haiku', access)
  assert.equal(client.sent.length, 2, `${name}: a reading is two count requests`)
  const [first, second] = client.sent.map((s) => s.params)
  assert.equal(first.model, MODELS.haiku, `${name}: counted on the tier's configured model`)
  assert.equal(second.model, MODELS.haiku)
  assert.deepEqual(Object.keys(second).sort(), ['messages', 'model'], `${name}: the second request is the message alone`)
  assert.deepEqual(first.messages, second.messages)
  assert.equal(first.system.length, 1, `${name}: one system block`)
  assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral' }, `${name}: the block carries the cache marker`)
  // A real turn, with a member, a support history and an operator viewer: same stable bytes.
  const live = buildVeraSystem({ facts: { interests: ['surfing'], goals: ['meet people'] } }, { ...DEFAULT_VERA_CONFIG, register: 'hot' }, 'two open tickets', { isOperator: true, roleLabel: 'janitor' })
  assert.equal(first.system[0].text, live.stable, `${name}: the counted block is the stable block a turn sends`)
  assert.ok(live.stable.length > 1000 && !live.stable.includes('surfing') && !live.stable.includes('two open tickets'))
  assert.equal(JSON.stringify(first.tools), JSON.stringify(veraTurnTools(access.spaceManager, access.operator)), `${name}: the counted tools are the tools a turn sends`)
  assert.ok(first.tools.length > 0)
  // 4. The answer.
  assert.deepEqual(reading, { tier: 'haiku', prefixTokens: floor + 241, floor, margin: 241, cached: true })
}
const turn = fs.readFileSync(path.join(root, 'lib/ai/vera/agent-claude.ts'), 'utf8')
assert.match(turn, /const tools = veraTurnTools\(/, 'the live turn takes its tools from veraTurnTools')
assert.equal(turn.match(/VERA_TOOLS\.filter\(/g)?.length, 1, 'one place picks the tools a turn sends')

const short = await takeReading(recorder([CACHE_MIN_TOKENS.haiku + 8, 9]), mod, 'haiku', {})
assert.equal(short.cached, false, 'a prefix one token under the minimum reads as not cached')
assert.equal(short.margin, -1)
assert.equal((await takeReading(recorder([CACHE_MIN_TOKENS.haiku + 8, 9]), mod, 'sonnet', {})).floor, CACHE_MIN_TOKENS.sonnet, 'the minimum follows the tier')
for (const bad of [[undefined, 9], [5, 9], ['4000', 9], [-1, -2]]) {
  await assert.rejects(takeReading(recorder(bad), mod, 'haiku', {}), `a reply of ${JSON.stringify(bad)} is not a reading`)
}

// 3. Deterministic across time.
const RealDate = Date
const frozen = (iso) => class extends RealDate { constructor(...a) { super(...(a.length ? a : [iso])) } static now() { return new RealDate(iso).getTime() } }
const prints = []
for (const iso of ['2026-01-01T00:00:00Z', '2031-07-19T13:37:42Z']) {
  globalThis.Date = frozen(iso)
  try { prints.push(mod.VERA_PREFIX_VARIANTS.map((v) => describePrefix(mod, v.access).sha256).join()) } finally { globalThis.Date = RealDate }
}
assert.equal(prints[0], prints[1], 'the prefix changes with the clock: it would never be read back from the cache')
assert.equal(new Set(prints[0].split(',')).size, mod.VERA_PREFIX_VARIANTS.length, 'each tool set is its own prefix')

// 5. Hand-run only.
const named = (file) => fs.readFileSync(file, 'utf8').includes('vera-prefix-tokens')
assert.ok(!named(path.join(root, 'package.json')), 'the reading must not be a package.json script (it would reach the build or CI)')
const flows = path.join(root, '.github/workflows')
for (const f of fs.existsSync(flows) ? fs.readdirSync(flows) : []) assert.ok(!named(path.join(flows, f)), `workflow ${f} must not run the reading`)
