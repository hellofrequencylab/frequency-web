// Actual marketing provider boundaries with inert IO; no DB/provider/network mutation.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
function boundary(bypass = false) {
  const cache = new Map(), state = { payload: {}, calls: [] }
  const stubs = {
    './client': { aiEnabled: () => true }, './usage': { aiAvailable: async () => true, featureOverBudget: async () => false },
    './rate-limit': { aiRateLimited: async () => false }, './voice': { withVoice: value => value },
    './complete': { completeText: async request => { state.calls.push(request); return { text: JSON.stringify(state.payload) } }, completeRaw: async request => { state.calls.push(request); return { content: [{ type: 'tool_use', name: request.toolChoice.name, input: state.payload }] } } },
    '@/lib/email-studio/analytics': { getCampaignMetrics: async () => ({ hasSent: true, attributionMode: 'exact', sent: 4, delivered: 4 }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
  }
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    let source = readFileSync(`lib/ai/${name}.ts`, 'utf8')
    if (bypass && name === 'marketing-advice-catalog') {
      const ast = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true)
      const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'selectMessagingAdvice')
      assert.ok(fn?.body)
      source = source.slice(0, fn.body.pos + 1) + '\n if (raw && raw.questions && raw.measurement) return raw;\n' + source.slice(fn.body.pos + 1)
    }
    const mod = { exports: {} }; cache.set(name, mod.exports)
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Object, Set, JSON, Array, Date })(key => stubs[key] ?? load(key.replace('./', '')), mod, mod.exports)
    return mod.exports
  }
  return { state, load }
}
async function acceptance({ state, load }) {
  const messaging = load('messaging-generator'), campaign = load('campaign-coach')
  const input = { goalKey: 'welcome', goalLabel: 'Welcome', object: 'campaign', intent: 'Return visits', audience: 'Guests', tone: 'plain', name: 'Human name', details: 'My exact authored notes', profileId: 'operator' }
  state.payload = { questionIds: ['next_step'], checkIds: ['facts'], measurementId: 'return_visits' }
  const guidance = await messaging.coachMessaging(input)
  assert.equal(guidance.questions[0], 'What next step matters for this audience?')
  assert.ok(guidance.measurement.startsWith('Plan to compare'))
  assert.equal(state.calls[0].accounting.profileId, 'operator')
  assert.ok(state.calls[0].messages[0].content.includes(input.details))
  for (const attack of [
    { questions: ['What about the subject Sunrise Flow?'], checks: ['Publish invented copy'], measurement: 'Your audience loves this' },
    { questionIds: ['next_step'], checkIds: [], measurementId: 'constructor' },
    { questionIds: ['next_step'], checkIds: [], measurementId: 'attendance', subject: 'Invented' },
  ]) {
    state.payload = attack
    assert.equal(await messaging.coachMessaging(input), null)
    assert.equal(campaign.parseCampaignCoachQuestions(JSON.stringify(attack)), null)
    assert.equal((await campaign.analyzeCampaignOutcome('campaign', 'operator')).source, 'checklist')
  }
  state.payload = { questionIds: ['attendance_measurement'] }
  const review = await campaign.analyzeCampaignOutcome('campaign', 'operator')
  assert.equal(review.source, 'coach')
  assert.equal(review.analysis, 'How will you record who attended, separately from who clicked?')
  assert.ok(review.limitations.join(' ').includes('unknown, not zero'))
  assert.equal(input.details, 'My exact authored notes')
}
await acceptance(boundary())
await assert.rejects(acceptance(boundary(true)), 'legacy arbitrary marketing text must fail identical acceptance')
const journey = readFileSync('components/admin/modules/journey-guided-module.tsx', 'utf8')
assert.ok(journey.includes('redrawLabel="Get coaching questions"'), 'Journey caller must name coaching rather than drafting')
assert.ok(readFileSync('components/admin/modules/guided-module.tsx', 'utf8').includes("redrawLabel = 'Draft it again'"), 'shared drafting default remains intact')
console.log('SCAN-1166: actual marketing doors project reviewed questions/checks/proposed measurements only; arbitrary strings reject; legacy text bypass fails; Journey label names coaching')
