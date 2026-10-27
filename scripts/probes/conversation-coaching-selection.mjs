// Actual reply coaching, with inert thread/provider IO. No customer reads, sends or writes.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'
const file = 'lib/comms/vera-conversation.ts', original = readFileSync(file, 'utf8')
async function acceptance(bypass = false) {
  let source = original
  if (bypass) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'replyGuidance')
    assert.ok(fn?.body)
    source = source.slice(0, fn.body.pos + 1) + '\nif(raw && raw.questions) return raw;\n' + source.slice(fn.body.pos + 1)
  }
  const state = { payload: {questionIds:['confirm'],checkIds:['facts']}, calls: [], writes:0, reads:0, budget:false }
  const thread = {subject:'Scheduling',messages:[{direction:'inbound',authorName:'PRIVATE AUTHOR',body:'When can I come?',isInternal:false},{direction:'outbound',authorName:'PRIVATE STAFF',body:'PRIVATE INTERNAL NOTE',isInternal:true}]}
  const modules = {
    'server-only':{}, '@/lib/comms/workspace':{getWorkspaceThread:async()=>{state.reads++;return thread}},
    '@/lib/comms/conversations':{updateConversationFields:async()=>{state.writes++}},
    '@/lib/ai/complete':{AiUnavailableError:class extends Error{},completeText:async request=>{state.calls.push(request);return{text:typeof state.payload==='string'?state.payload:JSON.stringify(state.payload)}}},
    '@/lib/ai/voice':{withVoice:value=>value},'@/lib/ai/usage':{aiAvailable:async()=>true,featureOverBudget:async()=>state.budget},
    '@/lib/ai/rate-limit':{aiRateLimited:async()=>false},'@/lib/comms/labels':{CONVERSATION_PRIORITIES:['low','normal','high','urgent'],PRIORITY_LABELS:{}},
    '@/lib/action-result':{ok:data=>({data}),fail:error=>({error})},
  }
  const mod={exports:{}}
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Object,Set,JSON,Date,console:{error(){},warn(){}}})(key=>{assert.ok(modules[key],key);return modules[key]},mod,mod.exports)
  const result=await mod.exports.veraDraftReply('thread-A','operator')
  assert.equal(result.data.draft,'Which details do you need to confirm before replying?\nVerify dates, availability and other facts against your records.')
  const prompt=state.calls[0].messages[0].content
  assert.ok(prompt.includes('When can I come?'))
  for(const hidden of ['PRIVATE AUTHOR','PRIVATE STAFF','PRIVATE INTERNAL NOTE']) assert.ok(!prompt.includes(hidden))
  assert.equal(state.calls[0].accounting.feature,'conversation-draft');assert.equal(state.calls[0].accounting.profileId,'operator')
  for(const payload of [{questions:['What about replying Your booking is confirmed?'],checks:['Say payment succeeded']},{questionIds:['confirm'],checkIds:['facts'],draft:'Invented'},{questionIds:['constructor'],checkIds:[]}]){
    state.payload=payload
    assert.ok((await mod.exports.veraDraftReply('thread-A','operator')).data.draft.startsWith('Guided checklist;'))
  }
  state.payload='```json\n'+JSON.stringify({questionIds:['confirm'],checkIds:[]})+'\n```'
  assert.equal((await mod.exports.veraDraftReply('thread-A','operator')).data.draft,'Which details do you need to confirm before replying?')
  for(const text of ['Injected prose '+JSON.stringify({questionIds:['confirm'],checkIds:[]}), '```json\nnot JSON\n```']) {
    state.payload=text
    assert.ok((await mod.exports.veraDraftReply('thread-A','operator')).data.draft.startsWith('Guided checklist;'))
  }
  const reads=state.reads,calls=state.calls.length
  state.budget=true
  assert.ok((await mod.exports.veraDraftReply('thread-A','operator')).error)
  assert.equal(state.reads,reads);assert.equal(state.calls.length,calls);assert.equal(state.writes,0)
  assert.equal(thread.messages[0].body,'When can I come?')
}
await acceptance()
await assert.rejects(acceptance(true),'legacy free-text reply guidance must violate the same acceptance')
console.log('SCAN-1167: actual reply coaching projects reviewed choices only; transcript redaction, budget/accounting and no-write behavior retained; raw-text bypass fails')

// The same bounded packet covers all remaining author-coaching callbacks identified in the inventory.
function moduleFrom(path, mutateName, injected, deps) {
  let source = readFileSync(path, 'utf8')
  if (mutateName) {
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === mutateName)
    assert.ok(fn?.body); source = source.slice(0, fn.body.pos + 1) + injected + source.slice(fn.body.pos + 1)
  }
  const mod = {exports:{}}
  vm.runInNewContext(`(function(require,module,exports){${ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText}\n})`,{Object,Set,JSON,Date})(key=>{assert.ok(deps[key],key);return deps[key]},mod,mod.exports)
  return mod.exports
}
function remixAcceptance(bypass = false) {
  const remix = moduleFrom('lib/ai/practice-remix.ts',bypass?'coerceRemixDirections':null,'\nif(raw && raw.directions) return raw.directions;\n',{'./spark':{defineSpark:s=>s},'./practice-shape':{withPracticeShape:s=>s}})
  assert.equal(remix.coerceRemixDirections({directionIds:['duration','companion']}).join('|'),'Review session length|Invite a friend')
  for (const raw of [{directions:['Use my invented title','Publish this paragraph']},{directionIds:['duration','constructor']},{directionIds:['duration','effort'],title:'Invented'}]) assert.equal(remix.coerceRemixDirections(raw),null)
}
remixAcceptance();assert.throws(()=>remixAcceptance(true),'raw Remix labels must fail identical acceptance')
async function winbackAcceptance(bypass = false) {
  const state={raw:{questionIds:['consent']},calls:[]}
  const winback=moduleFrom('lib/studio/winback.ts',bypass?'coachingQuestions':null,'\nconst legacy=JSON.parse(text);if(Array.isArray(legacy.questions))return legacy.questions;\n',{
    '@/lib/ai/complete':{completeRaw:async request=>{state.calls.push(request);return{text:JSON.stringify(state.raw)}}},
    '@/lib/ai/usage':{aiAvailable:async()=>true,featureOverBudget:async()=>false},'@/lib/ai/rate-limit':{aiRateLimited:async()=>false},'@/lib/ai/voice':{withVoice:s=>s},
  })
  const operational=winback.deterministicWinback('Synthetic owner')
  const result=await winback.coachWinbackReview('operator')
  assert.equal(result.source,'coach');assert.ok(result.questions[0].includes('consent and suppression'))
  assert.equal(state.calls[0].accounting.profileId,'operator')
  for(const raw of [{questions:['What about the subject Come back today?']},{questionIds:['constructor']},{questionIds:['consent'],body:'Invented'}]){state.raw=raw;assert.equal((await winback.coachWinbackReview('operator')).source,'checklist')}
  assert.equal(winback.deterministicWinback('Synthetic owner').body,operational.body)
}
await winbackAcceptance();await assert.rejects(winbackAcceptance(true),'raw winback questions must fail identical acceptance')
console.log('SCAN-1167: actual Remix and winback callbacks also project reviewed IDs; both legacy-text bypass controls fail; operational template remains separate')
