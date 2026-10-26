// LIVE-1345: execute actual server boundaries with inert provider, permission and storage seams.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
function selected(file, name) {
  const text = readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(node, name)
  return ts.transpileModule(node.getText(ast), { compilerOptions: options }).outputText
}
let allowed = true, writes = 0, modelCalls = 0
const guidance = { questionIds: ['next_step'], checkIds: ['facts'], measurementId: 'attendance' }
const catalog = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync('lib/ai/marketing-advice-catalog.ts', 'utf8'), { compilerOptions: options }).outputText, catalog)
let response = guidance
const modules = {
  './marketing-advice-catalog': catalog.exports,
  './complete': { completeRaw: async () => { modelCalls++; return { content: [{ type: 'tool_use', name: 'coach_messaging', input: response }] } } },
  './client': { aiEnabled: () => true }, './usage': { featureOverBudget: async () => false }, './voice': { withVoice: x => x },
}
const generator = { exports: {}, require: name => { assert.ok(modules[name], name); return modules[name] } }
vm.runInNewContext(ts.transpileModule(readFileSync('lib/ai/messaging-generator.ts', 'utf8'), { compilerOptions: options }).outputText, generator)
const input = { mode: 'vera', goalKey: 'event', name: 'Human title', details: 'Human notes' }
const actions = { exports: {}, getMessagingGoal: () => ({ key: 'event', label: 'Event', object: 'campaign', blurb: 'Invite' }),
  writerGate: async () => allowed ? { ok: true, profileId: 'author' } : { ok: false, error: 'denied' },
  coachMessaging: generator.exports.coachMessaging, ok: data => ({ data }), fail: error => ({ error }),
  createAdminClient: () => { writes++; throw Error('Unexpected storage access') }, startManual: () => { writes++; throw Error('Unexpected fallback') } }
vm.runInNewContext(selected('app/(main)/admin/marketing/messaging/new/actions.ts', 'startBuild'), actions)
assert.equal((await actions.exports.startBuild(input)).data.coaching.questions[0], 'What next step matters for this audience?')
assert.equal(input.details, 'Human notes'); assert.equal(writes, 0)
response = { ...guidance, body: 'Invented email' }
assert.ok((await actions.exports.startBuild(input)).error); assert.equal(writes, 0)
allowed = false
const callsBeforeDenial = modelCalls
assert.equal((await actions.exports.startBuild(input)).error, 'denied')
assert.equal(modelCalls, callsBeforeDenial); assert.equal(writes, 0)
console.log('LIVE-1345: actual coaching accepts questions, rejects invented copy, preserves author input, denies unauthorized calls and never creates a draft or fallback')
