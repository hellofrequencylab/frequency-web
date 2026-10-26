// LIVE-1342. Actual server boundary functions run over inert session/draft/provider dependencies.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
function selected(file, name) {
  const text = readFileSync(file, 'utf8'), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  assert.ok(node, name)
  return ts.transpileModule(node.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}
const pure = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync('lib/ai/writing-questions.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pure)
const { safeWritingQuestions, parseWritingQuestions } = pure.exports
assert.equal(parseWritingQuestions('{"title":"Invented","description":"New copy"}'), null)
const writes = [], draft = { name: 'Human Circle', about: 'Human About', primaryPillar: null }
let allowed = true
const advice = async () => ({ name: 'Invented name', card: 'Invented About', title: 'Invented title', description: 'Invented listing', questions: ['Who is this for?'] })
const exports = {}
const context = { exports, safeWritingQuestions, callerProfileId: async () => { if (!allowed) throw Error('denied'); return 'owner' }, hostedDraft: async () => draft,
 composeCircleSection: advice, planCircleEdit: advice, saveCircleDraft: (...args) => writes.push(args),
 getCallerProfile: async () => allowed ? { id: 'owner' } : null, draftListingCopy: advice,
 authorCircle: async () => allowed ? { draft, profileId: 'owner' } : { error: 'denied' }, ok: data => ({ data }), fail: error => ({ error }) }
for (const [file, name] of [ ['app/(main)/circles/builder-actions.ts','composeSectionAction'], ['app/(main)/circles/builder-actions.ts','editDraftAction'], ['app/(main)/marketplace/commerce-actions.ts','draftMakerProductCopyAction'], ['app/(main)/circles/actions.ts','redrawCircleAction'] ]) vm.runInNewContext(selected(file,name), context)
assert.deepEqual(Object.keys(await exports.composeSectionAction({ circleId: 'a', section: 'card' })), ['questions'])
assert.equal((await exports.editDraftAction({ circleId: 'a', request: 'help' })).draft.about, 'Human About')
const listing = await exports.draftMakerProductCopyAction({ seed: 'Human title' })
assert.equal(listing.title, ''); assert.equal(listing.description, '')
assert.equal((await exports.redrawCircleAction('a', {})).data.changes.length, 0)
assert.equal(writes.length, 0)
allowed = false
await assert.rejects(exports.editDraftAction({ circleId: 'a', request: 'help' }), /denied/)
assert.equal((await exports.draftMakerProductCopyAction({})).title, '')
assert.equal((await exports.redrawCircleAction('a', {})).error, 'denied')
assert.equal(writes.length, 0)
console.log('LIVE-1342: actual Circle/listing actions strip invented copy, preserve human text, deny unauthorized calls and perform no generated-field writes')
