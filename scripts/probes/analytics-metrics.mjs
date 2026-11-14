import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function sourceModule(path, stubs, globals = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const loaded = { exports: {} }
  const resolve = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    throw new Error('Unexpected dependency: ' + name)
  }
  new vm.Script('(function(require,module,exports){' + code + '\n})', { filename: path }).runInNewContext({ URLSearchParams, Date, ...globals })(resolve, loaded, loaded.exports)
  return loaded.exports
}
const funnel = sourceModule('lib/create-space/funnel.ts', {})
const never = () => { throw new Error('Probe must not read a database') }
const dashboard = sourceModule('lib/analytics/dashboard.ts', {
  '@/lib/supabase/admin': { createAdminClient: never },
  './practice': { getPracticeMetrics: never },
  '@/lib/create-space/funnel': funnel,
})
const steps = dashboard.computeFunnel([{ step: 'Earlier', eventType: 'a', actors: 100 }, { step: 'Later', eventType: 'b', actors: 2 }])
assert.ok(steps.every((step) => step.dropPct === null), 'Independent totals cannot imply conversion loss')
const builder = funnel.createSpaceFunnel([{ eventType: 'createspace.view', events: 20, actors: 1 }, { eventType: 'launch_completed', events: 99, actors: 3 }])
assert.equal(builder[0].actors, 20, 'Anonymous builder volume counts visits')
assert.equal(builder.at(-1).actors, 3, 'Launch volume counts signed-in actors separately')
assert.ok(builder.every((step) => step.dropPct === null), 'Anonymous visits and signed-in launches cannot form a conversion funnel')
const insights = sourceModule('lib/analytics/engagement-read.ts', {
  './dashboard': { getEngagementDashboard: never }, './outcomes': { getOutcomeReport: never }, './showing-up': { getShowingUpReading: never },
})
const base = { showingUpMembers: null, newMembers: 40, activationRate: 0.6, funnel: [{ step: 'Later', actors: 2, dropPct: 98 }], challenges: [], quests: [] }
assert.ok(!insights.synthesizeInsights(base).some((item) => ['attendance_zero', 'funnel_jam'].includes(item.id)))
assert.ok(insights.synthesizeInsights({ ...base, showingUpMembers: 0 }).some((item) => item.id === 'attendance_zero'))
assert.ok(insights.synthesizeInsights({ ...base, funnel: [{ step: 'Linked cohort', actors: 2, dropPct: 98, orderedCohort: true }] }).some((item) => item.id === 'funnel_jam'))
assert.match(insights.summarize([]), /does not establish/)
console.log('Metrics proof passed: visit/member separation, missing attendance vs zero and ordered-cohort-only warnings.')
