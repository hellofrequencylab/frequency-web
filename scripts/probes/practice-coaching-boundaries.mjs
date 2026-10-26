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
const fakeModel = { questionIds: ['audience'] }
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
const spark = load('lib/ai/practice-spark.ts')
const result = await spark.draftPracticeSpark({ who: '', act: '', outcome: '', cadence: 'daily', pace: 'light', sourceText: authored, profileId: 'author' })
assert.equal(JSON.stringify(result), JSON.stringify({ questions: ['Who is this for?'] }))
assert.equal(JSON.parse(requested.input.content).authoredDraft, authored)
assert.equal(requested.spec.feature, 'practice-spark')
assert.equal(spark.PRACTICE_SPARK.coerce({ title: 'Generated title', body: 'Generated steps' }), null)
assert.equal(spark.PRACTICE_SPARK.coerce({ questionIds: ['audience'], title: 'Invented title', body: 'Invented steps' }), null)
assert.equal(spark.PRACTICE_SPARK.coerce({ questions: ['Would Sunrise Flow work as your title?'] }), null)
const actions = readFileSync('app/(main)/practices/actions.ts', 'utf8')
const coachBlock = actions.slice(actions.indexOf('export async function buildPracticeWithVeraAction'), actions.indexOf('// Set the author tags'))
assert.ok(coachBlock.includes('await authorPractice(id)'))
assert.ok(coachBlock.includes('applied: 0'))
for (const mutation of ['updatePractice(', 'saveSteer(', 'revalidatePath(']) assert.ok(!coachBlock.includes(mutation), mutation)
const fork = actions.slice(actions.indexOf('export async function forkPracticeAction'), actions.indexOf('export async function remixDirectionsAction'))
assert.ok(!fork.includes('applyVeraPracticeChangeAction('))
const remix = readFileSync('components/practice/remix-practice-button.tsx', 'utf8')
assert.ok(remix.includes('remixDirectionsAction(practiceId)'), 'Advice is available before copying')
assert.ok(remix.includes('forkPracticeAction(practiceId)'), 'Copy takes no generated direction')
assert.ok(remix.includes('directions.map') && !remix.includes('setPicked'), 'Advice remains separate from copy fields')
assert.ok(fork.includes('forkPractice(') && fork.includes('adoptPractice('), 'Copy retains lineage/adoption path')
const remixSource = readFileSync('lib/ai/practice-remix.ts', 'utf8')
for (const contract of ['practice-remix', "tier: 'haiku'", 'runSpark(', 'withPracticeShape(']) assert.ok(remixSource.includes(contract), contract)
console.log('Actual Practice coaching discards generated fields and retains authored context; build/edit/redraw and copy remain separate from AI content writes.')
