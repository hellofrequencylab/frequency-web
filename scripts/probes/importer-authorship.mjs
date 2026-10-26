// LIVE-1346. Actual server boundary functions run over inert session/draft/provider dependencies.
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
const catalog = { exports: {} }
vm.runInNewContext(ts.transpileModule(readFileSync('lib/ai/coaching-question-catalog.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, catalog)
const pure = { exports: {}, require: key => { assert.equal(key, './coaching-question-catalog'); return catalog.exports } }
vm.runInNewContext(ts.transpileModule(readFileSync('lib/ai/writing-questions.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pure)
const { safeWritingQuestions, parseWritingQuestions } = pure.exports
assert.equal(parseWritingQuestions('{"title":"Invented","description":"New copy"}'), null)
const writes = [], reads = [], calls = []
let allowed = true, owned = true
const advice = async (...args) => { calls.push(args); return { content: { body: 'INVENTED' }, about: 'INVENTED', questions: ['Which concrete details can you explain in your own words?'] } }
const exports = {}
const context = { exports, safeWritingQuestions,
 getCallerProfile: async () => allowed ? {id:'owner'} : null,
 getVisibleSpaceBySlug: async () => ({id:'space-a'}),
 resolveSpaceManageAccess: async () => ({canManage:allowed}),
 getIntakeBySpaceId: async id => { reads.push(id); return {draft:{name:'Owner words'}} },
 sanitizeBlockContent: (_id, value) => value,
 reseedBlockCopy: advice, coachBusinessWriting: advice,
 requireStaffCap: async () => {if(!allowed) throw Error('denied')},
 getMyProfileId: async () => 'owner',
 readOwnedIntake: async () => owned ? {status:'applied',draft:{name:'Owner words'},inputs:{}} : null,
 normalizeSeedMood: x => x,
 saveDraft: (...x) => writes.push(x), setInputs: (...x) => writes.push(x), applyIntake: (...x) => writes.push(x),
}
for (const [file,name] of [
 ['app/(main)/spaces/[slug]/settings/profile/actions.ts','reseedSpaceBlockCopy'],
 ['app/(main)/admin/business-seeder/actions.ts','reseedBusinessImport'],
 ['lib/importer/compose.ts','composeMarketingLayout'],
 ['lib/importer/reframe/run.ts','reframe'],
]) vm.runInNewContext(selected(file,name), context)
const block = await exports.reseedSpaceBlockCopy('a','text',{body:'HUMAN'})
assert.deepEqual(Object.keys(block), ['questions']); assert.equal(block.questions[0],'Which concrete details can you explain in your own words?')
const business = await exports.reseedBusinessImport('intake-a','calm')
assert.equal(business.revoiced,false); assert.equal(business.reapplied,false); assert.equal(business.about,undefined)
assert.equal(await exports.composeMarketingLayout({name:'Owner words'},[]),null)
assert.equal(await exports.reframe({verified:{name:'Owner words'}}),null)
assert.equal(calls.length,2); assert.equal(writes.length,0)
allowed=false
assert.match((await exports.reseedSpaceBlockCopy('a','text',{})).error,/permission/)
await assert.rejects(exports.reseedBusinessImport('a','calm'),/denied/)
assert.equal(reads.length,1); assert.equal(calls.length,2)
allowed=true; owned=false
assert.equal((await exports.reseedBusinessImport('foreign','calm')).ok,false)
assert.equal(calls.length,2); assert.equal(writes.length,0)
// Execute the actual pure extraction boundary, then prove the old permissive put path fails.
const extractionSource=readFileSync('lib/importer/extract/coerce.ts','utf8')
function loadExtraction(source) {
 const sandbox={exports:{},URL}
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox)
 return sandbox.exports.coerceExtraction
}
const coerce=loadExtraction(extractionSource)
const quote='Exact owner words. Keep punctuation!'
const sources=[{id:'owner',kind:'page',url:'https://owner.example/about',fetchedAt:'now',text:quote}]
const raw={about:{value:'INVENTED ABOUT',kind:'generated'},story:{value:quote,kind:'fact',snippet:quote,sourceUrl:sources[0].url}}
const extracted=coerce(raw,sources,'Owner')
assert.equal(extracted.draft.about,undefined);assert.equal(extracted.ledger.about,undefined)
assert.equal(extracted.draft.story,quote);assert.equal(extracted.ledger.story[0].kind,'fact')
for(const field of [ {...raw.story,value:'Paraphrase'}, {...raw.story,sourceUrl:'https://foreign.example'}, {...raw.story,snippet:undefined}, {...raw.story,kind:'generated'} ]) {
 assert.equal(coerce({about:field},sources,'Owner').draft.about,undefined)
}
const permissive=loadExtraction(extractionSource.replace("putQuotedProse('about', raw.about)","put('about', raw.about)"))
assert.notEqual(permissive(raw,sources,'Owner').draft.about,undefined,'negative control must expose the old generated-prose acceptance')
const publicProse={
 tagline:{value:'INVENTED TAGLINE',kind:'generated'},
 about:{value:'INVENTED ABOUT',kind:'generated'},story:{value:'INVENTED STORY',kind:'generated'},
 offerings:[{title:{value:'Actual class'},blurb:{value:'INVENTED OFFERING',kind:'generated'}}],
 faq:[{q:'INVENTED QUESTION',a:'INVENTED ANSWER'}],
 events:[{title:'INVENTED EVENT',blurb:'INVENTED EVENT BLURB',startsAt:'2026-11-01T12:00:00Z'}],
}
assert.ok(!JSON.stringify(coerce(publicProse,sources,'Owner')).includes('INVENTED'),'every public prose surface must reject invented extraction')
const extractionAst=ts.createSourceFile('coerce.ts',extractionSource,ts.ScriptTarget.Latest,true)
const gate=extractionAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sourceQuotation')
assert.ok(gate,'shared quotation gate must exist')
const bypass=extractionSource.slice(0,gate.getStart(extractionAst))+'function sourceQuotation(field) { return field?.value ? field : null }'+extractionSource.slice(gate.end)
assert.ok(JSON.stringify(loadExtraction(bypass)(publicProse,sources,'Owner')).includes('INVENTED'),'shared-gate source negative control must expose generated copy')
console.log('LIVE-1346: actual importer actions deny unauthorized/foreign intake and never save/apply coaching; composition/reframe disabled; all extracted public prose is source-quoted; permissive-source controls expose former generated-copy acceptance')
