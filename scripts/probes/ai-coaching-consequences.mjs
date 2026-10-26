import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Bounded actual-source consequences with inert IO. No provider, database or nested test runner.
const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
function harness(stubs) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }; cache.set(file, mod)
    const source = fs.readFileSync(path.join(root, file), 'utf8')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const resolve = (key) => {
      if (Object.hasOwn(stubs, key)) return stubs[key]
      if (key === 'server-only') return {}
      const relative = key.startsWith('@/') ? key.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), key))
      assert.ok(relative.startsWith('lib/') || relative.startsWith('app/'), `Unexpected dependency ${relative}`)
      return load(relative + '.ts')
    }
    new vm.Script(`(function(require,module,exports){${code}\n})`, { filename: file }).runInNewContext({ Date, Promise, Map, Set, Object, JSON, Number })(resolve, mod, mod.exports)
    return mod.exports
  }
  return load
}
async function vera() {
  let reads = 0
  const load = harness({
    './create-tools': { createEntityToolDef: () => ({ key: 'create_entity', mode: 'write', params: [] }) },
    './read-tools': { executeReadTool: async () => { reads++; return 'Read result' } },
  })
  const { handleModelToolCalls } = load('lib/ai/vera/model-tools.ts')
  const proposals = []
  const calls = [
    { id: 'c', name: 'create_entity', input: { fields: { about: 'Invented prose' } } },
    { id: 'e', name: 'send_intro_email', input: { body: 'Invented outreach' } },
    { id: 'p', name: 'send_playbook_email', input: { body: 'Invented outreach' } },
    { id: 'b', name: 'set_profile_field', input: { field: 'bio', value: 'Invented bio' } },
    { id: 'i', name: 'draft_intro', input: { message: 'Invented post' } },
  ]
  await handleModelToolCalls(calls, proposals)
  assert.equal(proposals.length, 0); assert.equal(reads, 0)
  await handleModelToolCalls([{ id: 'r', name: 'suggest_circle', input: {} }], proposals)
  assert.equal(reads, 1)
  await handleModelToolCalls([{ id: 'bad', name: 'suggest_circle', input: { interest: 12 } }, { id: 'r2', name: 'find_host', input: { topic: 'walking' } }], proposals)
  assert.equal(reads, 2); assert.equal(proposals.length, 0)
  console.log('Vera authoring dispatch refused; valid reads preserved; malformed mixed read refused.')
}
async function spark() {
  const load = harness({
    './client': { aiEnabled: () => true },
    './usage': { featureOverBudget: async () => false },
    './rate-limit': { aiRateLimited: async () => false },
    './voice': { withVoice: (s) => s },
    '@/lib/studio/registry': { studioManifest: () => ({ steer: {} }) },
    './complete': { completeRaw: async () => ({ content: [{ type: 'tool_use', name: 'extract', input: { description: 'Invented marketing copy' } }] }) },
  })
  const { runSpark } = load('lib/ai/spark.ts')
  const spec = { entity: 'event', feature: 'event-spark', tier: 'sonnet', maxTokens: 500,
    system: 'Extract facts', tool: { name: 'extract' }, proseField: 'description', coerce: (r) => ({ description: r.description.trim() }) }
  const authored = 'Human words remain mine.'
  const result = await runSpark(spec, { content: authored, authoredProse: authored })
  assert.equal(result.description, authored)
  assert.equal(await runSpark({ ...spec, coerce: () => ({ description: 'Truncated' }) }, { content: authored, authoredProse: authored }), null)
  assert.equal(await runSpark({ ...spec, proseResultField: 'about', coerce: r => ({ about: r.description.trim() }) }, { content: authored, authoredProse: authored }).then(r => r.about), authored)
  const read = p => fs.readFileSync(path.join(root, p), 'utf8')
  for (const file of ['app/(main)/events/event-spark.tsx', 'components/circles/builder/circle-wizard.tsx']) assert.ok(!/<SparkFidelity /.test(read(file)), `${file}: no rewrite choice for authored text`)
  assert.ok(!/<SparkFidelity /.test(read('components/journey/v2/journey-spark.tsx')), 'Journey coaching offers no prose rewrite control')
  assert.ok(/description: str\(r\.description, 8000\)/.test(read('lib/events/normalize.ts')), 'existing Event description capacity retained')
  console.log('Actual Spark retains human words, rejects coercion loss and supports mapped fields; Journey coaching and Event capacity retained.')
}
async function space() {
  const state = { allowed: false, writes: [], missing: false }
  const load = harness({
    '@/lib/auth': { getMyProfileId: async () => 'operator-A' },
    './store': { getSpaceById: async (id) => ({ id, slug: 'makers', ownerProfileId: 'another-owner' }) },
    './membership': { readSpaceMembershipFresh: async (id, actor) => state.allowed && id === 'space-A' && actor === 'operator-A' ? { status: 'active', role: 'editor' } : null },
    'next/cache': { revalidatePath() {} },
    '@/lib/log': { log: { warn() {} } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: (table) => {
      assert.equal(table, 'space_private_state')
      return { upsert: async (value) => { if (state.missing) return { error: Error('missing column') }; state.writes.push(value); return { error: null } } }
    } }) },
  })
  const { emptySpaceCoachProfile } = load('lib/spaces/coach-profile.ts')
  const { saveSpaceCoachProfile } = load('app/(main)/spaces/[slug]/settings/coach/actions.ts')
  assert.ok('error' in await saveSpaceCoachProfile('space-B', emptySpaceCoachProfile()))
  assert.equal(state.writes.length, 0)
  state.allowed = true
  assert.ok('data' in await saveSpaceCoachProfile('space-A', { ...emptySpaceCoachProfile(), voice: 'Plain words' }))
  assert.equal(state.writes[0].space_id, 'space-A')
  assert.deepEqual(Object.keys(state.writes[0]).sort(), ['coach_profile', 'space_id', 'updated_at'])
  await saveSpaceCoachProfile('space-A', null)
  assert.equal(state.writes[1].coach_profile, null)
  state.missing = true
  assert.ok('error' in await saveSpaceCoachProfile('space-A', emptySpaceCoachProfile()))
  console.log('Space editor gate, private narrow write, clear and unavailable store consequences passed (inert DB).')
}
async function copilot() {
  const calls = []
  const load = harness({
    './client': { aiEnabled: () => true },
    './usage': { featureOverBudget: async () => false },
    './rate-limit': { aiRateLimited: async () => false },
    './voice': { withVoice: s => s },
    './complete': { AiUnavailableError: class extends Error {}, completeText: async request => {
      calls.push(request)
      return { text: '["What should a newcomer know about your offering?"]' }
    } },
  })
  const coach = load('lib/ai/space-copilot.ts')
  const ctx = { name: 'Makers', spaceId: 'space-A', profileId: 'owner-A', offerings: ['Event: Sunday community sit', 'Product: Five class pass'] }
  for (const run of [coach.draftSpaceBio, coach.suggestTagline]) {
    assert.equal(await run(ctx), 'What should a newcomer know about your offering?')
    const request = calls.at(-1)
    for (const offering of ctx.offerings) assert.ok(request.messages[0].content.includes(offering), 'Both coaching paths receive actual offerings')
    assert.equal(request.accounting.spaceId, ctx.spaceId)
  }
  const source = file => fs.readFileSync(path.join(root, file), 'utf8')
  const action = source('app/(main)/spaces/copilot-actions.ts')
  assert.ok(/loadSpaceGrounding\(spaceId\)/.test(action) && /offerings: grounding\.offerings/.test(action), 'Authorized action supplies live grounding')
  assert.ok(/export async function runSpaceCopilotEval/.test(source('lib/ai/space-copilot-eval.ts')))
  assert.ok(/runSpaceCopilotEval\('bio', fallbackBio\)/.test(source('lib/ai/space-copilot-eval.test.ts')), 'Fixed-set eval runs in tests')
  assert.equal(coach.parseCoachingQuestions('Ready to publish marketing prose'), null)
  assert.ok(coach.fallbackBio(ctx).endsWith('?'))
  console.log('Both actual copilot paths receive live offerings and attributed coaching; fixed-set eval and prose rejection retained (inert model).')
}
async function campaign() {
  const load = harness({
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sent_at: '2026-10-01T00:00:00Z' } }) }) }) }) }) },
    '@/lib/email-studio/analytics': { getCampaignMetrics: async () => ({ hasSent: true, attributionMode: 'tracked' }) },
    './usage': { aiAvailable: async () => false, featureOverBudget: async () => false },
    './rate-limit': { aiRateLimited: async () => false },
    './complete': { completeText: async () => { throw Error('Must not call model') } },
    './voice': { withVoice: (v) => v },
  })
  const coach = load('lib/ai/campaign-coach.ts')
  const result = await coach.analyzeCampaignOutcome('campaign-A', 'operator-A', 'attendance')
  assert.equal(result.ok, true); assert.equal(result.source, 'checklist'); assert.ok(result.analysis.endsWith('?'))
  assert.equal(coach.parseCampaignCoachQuestions('Write this campaign'), null)
  assert.equal(coach.parseCampaignCoachQuestions('{"questions":["Your conversion is 99%?"]}'), null)
  assert.ok(result.limitations.some((v) => v.includes('unknown, not zero')))
  console.log('Outcome goal checklist stays useful with AI off; fabricated metric/prose output refused.')
}
const modes = { vera, spark, space, copilot, campaign }
const mode = process.argv[2]
assert.ok(Object.hasOwn(modes, mode), 'Choose vera, spark, space, copilot or campaign')
await modes[mode]()
