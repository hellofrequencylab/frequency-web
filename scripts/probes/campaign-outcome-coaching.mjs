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
async function campaign() {
  const load = harness({
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { sent_at: '2026-10-01T00:00:00Z' } }) }) }) }) }) },
    '@/lib/email-studio/analytics': { getCampaignMetrics: async () => ({ hasSent: true, attributionMode: 'exact' }) },
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
  console.log('Outcome checklist works with AI off; malformed prose and numeric metric examples are rejected.')
}
await campaign()
