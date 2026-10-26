// Execute actual coercion/planning code with an inert model, never a provider or database.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(path.resolve('package.json'))
const ts = require('typescript')
const authored = '  My exact steps.\n\nStill my voice!  '
let requested
const fakeModel = { questions: ['Who is this for?'], title: 'Invented title', body: 'Invented steps', edits: [{ op: 'remove', id: 'existing' }], practices: [{ mode: 'create', title: 'Attack', body: 'Attack' }] }
const stubs = { './spark': { defineSpark: spec => spec, runSpark: async (spec, input) => { requested = { spec, input }; return spec.coerce(fakeModel) } } }
const modules = new Map()
function load(file) {
  if (modules.has(file)) return modules.get(file).exports
  const mod = { exports: {} }; modules.set(file, mod)
  const source = readFileSync(file, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const resolve = key => {
    if (stubs[key]) return stubs[key]
    const next = path.posix.join(path.posix.dirname(file), key) + '.ts'
    assert.ok(next.startsWith('lib/ai/'))
    return load(next)
  }
  new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename: file }).runInNewContext({ Map, Set, JSON, Object, Number })(resolve, mod, mod.exports)
  return mod.exports
}
const edit = load('lib/ai/journey-edit.ts')
const journey = { title: 'Mine', subtitle: '', intro: authored, phases: [] }
assert.equal(JSON.stringify(await edit.planJourneyEdits({ request: 'Rewrite', journey, profileId: 'author' })), JSON.stringify({ questions: ['Who is this for?'] }))
assert.equal(JSON.parse(requested.input.content).journey.intro, authored)
assert.equal(requested.spec.feature, 'journey-edit')
const composition = load('lib/ai/journey-composition.ts')
assert.equal(JSON.stringify(await composition.draftJourneyComposition({ description: authored, library: {}, profileId: 'author' })), JSON.stringify({ questions: ['Who is this for?'] }))
const slot = load('lib/ai/journey-slot-coaching.ts')
assert.equal(JSON.stringify(await slot.draftSlotCoaching({ journeyTitle: 'Mine', practiceTitle: 'Mine', profileId: 'author' })), JSON.stringify({ questions: ['Who is this for?'] }))
const read = file => readFileSync(file, 'utf8')
const actions = read('app/(main)/journeys/[slug]/edit/actions.ts')
for (const name of ['draftSlotCoachingAction', 'composeJourneyAction', 'populateWeekAction', 'applyVeraChangeAction']) {
  const from = actions.indexOf('export async function ' + name)
  const to = actions.indexOf('\nexport async function ', from + 1)
  const body = actions.slice(from, to < 0 ? undefined : to)
  assert.ok(body.includes('await authorPlan(slug)'), name + ': fresh gate')
  for (const mutation of ['.update(', '.insert(', '.delete(', 'done(slug)', 'insertChildren(', 'reuseOrCreatePhase(']) assert.ok(!body.includes(mutation), name + ': no ' + mutation)
}
const redrawSource = read('app/(main)/journeys/actions.ts')
const redraw = redrawSource.slice(redrawSource.indexOf('export async function redrawJourneyAction'), redrawSource.indexOf('export async function restoreJourneyAction'))
assert.ok(redraw.includes('await assertOwner(planId)') && redraw.includes('changes: []'))
assert.ok(!/writeJourneyRedraw\(|saveSteer\(|updatePlan\(/.test(redraw))
const create = read('app/(main)/journeys/create-actions.ts')
assert.ok(!/await composeIntoPhase\(|await composeJourneyAction\(/.test(create), 'Creation never triggers model block population')
const editor = read('components/journey/v2/journey-editor.tsx')
assert.ok(editor.includes('setQuestions(res.data.questions)') && !editor.includes('setValue(res.data.prompt)'), 'Participant prompt stays authored')
console.log('Journey model plans contain questions only; gated edit/composition/slot/redraw paths perform no content writes; explicit create does not populate model prose.')
