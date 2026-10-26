// Actual ID parser and actual shell assistant function, executed with inert UI/provider boundaries.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json')), ts = require('typescript')
const mod = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('lib/sites/editor/coaching.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new vm.Script(`(function(module,exports){${code}\n})`).runInNewContext()(mod, mod.exports)
const { websiteCoachingPromptIds, websiteCoachingQuestions } = mod.exports
for (const raw of ['model passage', '{"promptIds":["reader"],"text":"model passage"}', '{"questions":["Paste model passage?"]}']) {
  const result = websiteCoachingQuestions(websiteCoachingPromptIds(raw))
  assert.ok(result.length > 0); assert.ok(result.every(question => !question.includes('model passage')))
}
const source = fs.readFileSync('components/sites/editor/shell.tsx', 'utf8')
const ast = ts.createSourceFile('shell.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let ask
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'askVera') ask = node.getText(ast); ts.forEachChild(node, visit) }
visit(ast); assert.ok(ask)
const human = 'Human passage, exact spelling and punctuation.'
let shown = [], requested
const props = { body: human }
const run = new vm.Script(ts.transpileModule(`${ask}\naskVera`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText).runInNewContext({
  request: 'Review clarity', asking: false, selected: { type: 'Text', props }, selectedId: 'block',
  textSelection: { blockId: 'block', field: 'body', path: [] }, page: { doc: { content: [] } },
  config: { components: { Text: { fields: { body: { type: 'textarea' } } } } },
  inlineFieldValue: (value, selection) => value[selection.field], websiteCoachingQuestions,
  onPropose: async (request, before) => { requested = before; return { ok: true, promptIds: ['clarity'], text: 'FORGED MODEL PASSAGE', questions: ['FORGED MODEL PASSAGE?'] } },
  setVeraStatus: () => {}, setRequest: () => {}, setAsking: () => {}, setCoachingQuestions: value => { shown = value },
  commit: () => assert.fail('Coaching changed the draft'), onSave: () => assert.fail('Coaching saved the draft'),
})
await run()
assert.equal(requested, human); assert.equal(props.body, human)
assert.equal(shown[0], 'Which sentence could you simplify in your own words without losing a fact?')
assert.ok(!shown.join(' ').includes('FORGED'))
assert.ok(!source.includes('function applyProposal('), 'No model-passage Apply handler')
console.log('Site author coaching: actual caller keeps human text unchanged and accepts reviewed questions only (offline)')
