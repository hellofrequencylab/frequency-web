// Offline execution of actual provider boundaries, with inert usage/IO and a semantic bypass control.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
function boundary(bypass = false) {
  const cache = new Map(), state = { payload: { questionIds: ['audience'] }, calls: [] }
  const stubs = {
    './client': { aiEnabled: () => true }, './usage': { featureOverBudget: async () => false },
    './rate-limit': { aiRateLimited: async () => false }, './voice': { withVoice: value => value },
    './complete': { AiUnavailableError: class extends Error {}, completeText: async request => { state.calls.push(request); return { text: JSON.stringify(state.payload) } } },
    './spark': { defineSpark: value => value },
  }
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    let source = readFileSync(name.startsWith('@/') ? `${name.slice(2)}.ts` : `lib/ai/${name}.ts`, 'utf8')
    if (bypass && name === 'coaching-question-catalog') {
      const ast = ts.createSourceFile('actual.ts', source, ts.ScriptTarget.Latest, true)
      const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'selectCoachingQuestions')
      assert.ok(fn?.body)
      source = source.slice(0, fn.body.pos + 1) + '\n if (raw && Array.isArray(raw.questions)) return raw.questions;\n' + source.slice(fn.body.pos + 1)
    }
    const mod = { exports: {} }; cache.set(name, mod.exports)
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { Object, Set, JSON, Array })(key => stubs[key] ?? load(key.replace('./', '')), mod, mod.exports)
    return mod.exports
  }
  return { state, load }
}
async function acceptance(instance) {
  const { state, load } = instance
  const shared = load('writing-coach'), space = load('space-copilot'), spark = load('writing-coaching').writingCoachingSpec('practice', 'practice-spark', 'sonnet')
  state.payload = { questionIds: ['audience', 'detail'] }
  assert.equal((await shared.writingCoach({ feature: 'listing-copy', context: 'My exact human words', profileId: 'owner' })).join('|'), 'Who is this for?|Which concrete details can you explain in your own words?')
  assert.equal(await space.draftSpaceBio({ about: 'My exact human words' }), 'Who is this for? Which concrete details can you explain in your own words?')
  assert.equal(spark.coerce(state.payload).questions[0], 'Who is this for?')
  for (const attack of ['Would Sunrise Flow work as your title?', 'What about calling this Guaranteed healing?', 'What if you publish my invented paragraph?']) {
    state.payload = { questions: [attack] }
    assert.equal(spark.coerce(state.payload), null)
    assert.equal(space.parseCoachingQuestions(JSON.stringify(state.payload)), null)
    assert.ok(!(await shared.writingCoach({ feature: 'listing-copy', context: attack })).includes(attack))
  }
  for (const payload of [{ questionIds: ['constructor'] }, { questionIds: ['audience'], title: 'Invented' }, { questionIds: ['missing'] }]) {
    assert.equal(spark.coerce(payload), null)
    assert.equal(space.parseCoachingQuestions(JSON.stringify(payload)), null)
  }
  assert.ok(state.calls[0].messages[0].content.includes('My exact human words'))
  assert.equal(state.calls[0].accounting.profileId, 'owner')
}
await acceptance(boundary())
await assert.rejects(acceptance(boundary(true)), 'restoring free-text model output must violate the same contract')
console.log('SCAN-1164: actual Space/shared/Practice-Journey provider boundaries render reviewed IDs only; unquoted copy, unknown IDs and extra fields rejected; legacy-text bypass fails')

// Retain the older SCAN-1163 conversation privacy/quoted-guidance contract as consequences.
const conversation = readFileSync('lib/comms/vera-conversation.ts', 'utf8')
const ast = ts.createSourceFile('conversation.ts', conversation, ts.ScriptTarget.Latest, true)
const transcript = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'transcript')
const quote = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'QUOTE'))
assert.ok(transcript && quote)
const privacy = {}
vm.runInNewContext(ts.transpileModule(`${transcript.getText(ast)}\n${quote.getText(ast)}\nthis.quote = QUOTE`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, privacy)
const messages = [{direction:'inbound', authorName:'PRIVATE AUTHOR', body:'Owner supplied body', isInternal:false},{direction:'outbound',authorName:'PRIVATE STAFF',body:'PRIVATE INTERNAL NOTE',isInternal:true}]
assert.equal(privacy.transcript(messages), 'Them: Owner supplied body')
assert.ok(privacy.transcript([{...messages[0],body:'x'.repeat(9000)}]).length <= 8000)
for (const quoted of ['What about "Invented"?', 'What about “Invented”?']) assert.ok(privacy.quote.test(quoted))
assert.ok(conversation.includes('!QUOTE.test(q)'), 'conversation quoted-guidance rejection remains wired')
