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
const state={inserts:[],updates:[],sent:[],action:null,allowed:true,modelCalls:[],ai:true}
const load=harness({
 '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{
  const q={select:()=>q,eq:()=>q,gte:()=>q,not:()=>q,neq:()=>q,limit:()=>q,order:()=>q,
   insert:async value=>{state.inserts.push(value);return {error:null}},update:value=>{state.updates.push(value);return q},maybeSingle:async()=>({data:state.action}),
   then:resolve=>Promise.resolve({data:table==='contacts'?[{profile_id:'member-A',email:'member@example.com',display_name:'Ada'}]:[]}).then(resolve)};return q;
 }})},
 '@/lib/email':{enqueueEmail:async value=>state.sent.push(value),listUnsubscribeHeaders:()=>({})},
 '@/lib/comms/send-gate':{resolveSendGate:async()=>({allowed:state.allowed})},
 '@/lib/unsubscribe-tokens':{buildUnsubscribeUrl:()=> 'https://example.com/unsubscribe'},
 '@/lib/site':{SITE_URL:'https://example.com'},
 '@/lib/email-studio/shell':{plainTextEmail:body=>({html:body,text:body})},
 '@/lib/ai/complete':{completeRaw:async call=>{state.modelCalls.push(call);return {text:JSON.stringify({questionIds:['consent']})}}},
 '@/lib/ai/usage':{aiAvailable:async()=>state.ai,featureOverBudget:async()=>false},
 '@/lib/ai/rate-limit':{aiRateLimited:async()=>false},
 '@/lib/ai/voice':{withVoice:value=>value},
})
const agent=load('lib/studio/agent.ts'),winback=load('lib/studio/winback.ts')
assert.equal(await agent.proposeWinbacks(1),1)
assert.equal(state.modelCalls.length,0)
assert.equal(state.sent.length,0)
const proposal=state.inserts[0]
assert.equal(proposal.status,'proposed')
assert.equal(proposal.payload.body,winback.deterministicWinback('Ada').body)
state.action={kind:'email_contact',status:'approved',payload:{profileId:'member-A',email:'member@example.com',subject:'MODEL SUBJECT',body:'MODEL BODY'}}
assert.equal((await agent.executeAction('legacy')).ok,false)
assert.equal(state.sent.length,0)
const before=state.inserts.length
const review=await winback.coachWinbackReview('operator-A')
assert.equal(review.source,'coach')
assert.equal(state.inserts.length,before)
assert.equal(state.sent.length,0)
assert.equal(state.modelCalls[0].accounting.profileId,'operator-A')
for(const secret of ['member@example.com','member-A','Ada'])assert.ok(!JSON.stringify(state.modelCalls[0].messages).includes(secret))
state.action={kind:'email_contact',status:'proposed',payload:proposal.payload}
assert.equal((await agent.executeAction('new')).ok,false)
state.action.status='approved';state.allowed=false;await agent.executeAction('new');assert.equal(state.sent.length,0)
state.allowed=true;await agent.executeAction('new');assert.equal(state.sent[0].text,proposal.payload.body)
console.log('ok: actual winback proposal persists only operational copy; ephemeral coaching has no recipient data/write/send path; approval, provenance and current send consent remain required (inert IO).')
