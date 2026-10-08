// LIVE-883: run the shipped wrapper AND accounting layer with only SDK/DB transports stubbed.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
const state={holds:new Map(),usage:new Map(),dispatches:0,dbDown:false,providerDown:false,streamDown:false,quote:10,switchOn:true,settleDown:false,text:null}
globalThis.__aiBudgetProbe=state
state.rpc=async(name,p)=>{
 if(state.dbDown)return {data:null,error:{message:'offline'}}
 if(name==='ai_spend_today')return {data:0,error:null}
 if(name==='ai_reserve_attempt'){
  const all=[...state.usage.values(),...[...state.holds.values()].filter(r=>r.state!=='settled').map(r=>({...r,cost:r.p_estimate}))]
  const sum=filter=>all.filter(filter).reduce((n,r)=>n+r.cost,0)
  const allowed=state.switchOn&&sum(()=>true)+p.p_estimate<=p.p_global_cap&&sum(r=>r.p_feature===p.p_feature)+p.p_estimate<=p.p_feature_cap&&(!p.p_space||sum(r=>r.p_feature===p.p_feature&&r.p_space===p.p_space)+p.p_estimate<=p.p_space_cap)
  if(allowed)state.holds.set(p.p_id,{...p,state:'reserved'})
  return {data:allowed,error:null}
 }
 if(name==='ai_settle_attempt'){
  if(state.settleDown)return {data:null,error:{message:'offline'}}
  const r=state.holds.get(p.p_id);assert(r)
  state.usage.set(p.p_id,{...r,cost:p.p_actual});r.state='settled'
  return {data:true,error:null}
 }
 if(name==='ai_hold_attempt'){state.holds.get(p.p_id).state='uncertain';return {data:true,error:null}}
 throw Error(`unexpected RPC ${name}`)
}
state.message=()=>({content:[{type:'text',text:'Synthetic output'}],usage:{input_tokens:10,output_tokens:2}})
state.client={messages:{
 countTokens:async()=>({input_tokens:state.quote}),
 create:async(_params,options)=>{assert.equal(options.maxRetries,0);state.dispatches++;if(state.providerDown)throw Error('provider timeout');return state.message()},
 stream:(_params,options)=>{assert.equal(options.maxRetries,0);state.dispatches++;return {on:(event,fn)=>{if(event==='text')state.text=fn},finalMessage:async()=>{if(state.streamDown)throw Error('partial stream');return state.message()}}},
}}
const sources=new Map([
 ['@/lib/supabase/admin','export const createAdminClient=()=>({rpc:(...args)=>globalThis.__aiBudgetProbe.rpc(...args),from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{value:globalThis.__aiBudgetProbe.switchOn},error:globalThis.__aiBudgetProbe.dbDown?{message:"offline"}:null})})})})})'],
 ['@/lib/log','export const log={error:()=>{}}'],
 ['./rate-limit','export const aiRateLimited=async()=>false'],
 ['server-only','export {}'],
 ['./client','export const aiEnabled=()=>true;export const getAnthropic=()=>globalThis.__aiBudgetProbe.client'],
])
registerHooks({resolve(spec,context,next){if(sources.has(spec)&& (spec!=='./client'||context.parentURL?.includes('/lib/ai/')))return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {completeRaw,runToolLoop}=await import('../lib/ai/complete.ts')
const request={accounting:{feature:'vera-chat'},system:'Synthetic',messages:[{role:'user',content:'Synthetic'}]}
const reset=()=>{state.holds.clear();state.usage.clear();state.dispatches=0;state.dbDown=false;state.providerDown=false;state.streamDown=false;state.settleDown=false;state.switchOn=true;state.quote=10;state.message=()=>({content:[{type:'text',text:'Synthetic output'}],usage:{input_tokens:10,output_tokens:2}})}
let assertions=0
const check=(value)=>{assert(value);assertions++}
await completeRaw(request);check(state.dispatches===1);check(state.usage.size===1);check([...state.holds.values()][0].state==='settled')
for(const quote of [NaN,Infinity,-1,200001]){reset();state.quote=quote;await assert.rejects(()=>completeRaw(request),/quote_failed/);check(state.dispatches===0)}
reset();state.dbDown=true;await assert.rejects(()=>completeRaw(request),/AI is paused/);check(state.dispatches===0)
reset();state.switchOn=false;await assert.rejects(()=>completeRaw(request),/AI is paused/);check(state.dispatches===0)
reset();state.providerDown=true;await assert.rejects(()=>completeRaw(request),/provider timeout/);check(state.usage.size===0);check([...state.holds.values()][0].state==='uncertain')
reset();state.settleDown=true;await assert.rejects(()=>completeRaw(request),/settle_failed/);check(state.usage.size===0);check([...state.holds.values()][0].state==='uncertain')
reset();state.streamDown=true;await assert.rejects(()=>runToolLoop({...request,tools:[],maxRounds:2,onText:()=>{},onToolCalls:()=>null}),/partial stream/);check([...state.holds.values()][0].state==='uncertain')
reset();state.message=()=>({content:[{type:'tool_use',id:'t',name:'read',input:{}}],usage:{input_tokens:10,output_tokens:2}})
await assert.rejects(()=>runToolLoop({...request,tools:[],maxRounds:2,onToolCalls:()=>{check(state.usage.size===1);throw Error('tool failed')}}),/tool failed/);check(state.usage.size===1)
// 32 concurrent real-wrapper attempts race a quote whose maximum output consumes the $5 feature cap.
reset();state.providerDown=true
const outcomes=await Promise.allSettled(Array.from({length:32},()=>completeRaw({...request,tier:'opus',maxTokens:32000})))
check(outcomes.every(r=>r.status==='rejected'));check(state.dispatches===6);check(state.holds.size===6);check([...state.holds.values()].every(r=>r.state==='uncertain'))
// Exercise a shipped Space drafting caller; attribution must reach the central transaction.
reset();const {draftSpaceBio}=await import('../lib/ai/space-copilot.ts')
await draftSpaceBio({name:'Synthetic Space',spaceId:'synthetic-space',profileId:'synthetic-owner',type:'business'})
check([...state.usage.values()][0].p_space==='synthetic-space');check([...state.usage.values()][0].p_profile==='synthetic-owner')
// The newly merged website editor uses the mandatory wrapper without a duplicate local ledger write.
const websiteSources=new Map([
 ['./authorization','export const authorizeWebsiteEditor=async()=>({profileId:"synthetic-owner",space:{id:"synthetic-space"}})'],
 ['@/lib/sites/site-admin','export const readSiteAdminAuthor=async()=>null'],
 ['@/lib/sites/site-cache','export const refreshSite=()=>{}'],
 ['@/lib/ai/client','export const aiEnabled=()=>true'],
 ['@/lib/ai/rate-limit','export const aiRateLimited=async()=>false'],
 ['@/lib/ai/usage','export const featureOverBudget=async()=>false;export const recordAiUsage=()=>{throw Error("duplicate local ledger write")}'],
 ['@/lib/ai/voice','export const withVoice=s=>s'],
])
registerHooks({resolve(spec,context,next){if(context.parentURL?.endsWith('/lib/sites/editor/actions.ts')&&websiteSources.has(spec))return {url:`data:text/javascript,${encodeURIComponent(websiteSources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {proposeWebsiteText}=await import('../lib/sites/editor/actions.ts')
reset();check((await proposeWebsiteText('synthetic.example','Shorten','Synthetic passage')).ok)
check(state.dispatches===1);check(state.usage.size===1)
check([...state.usage.values()][0].p_feature==='website-editor');check([...state.usage.values()][0].p_profile==='synthetic-owner');check([...state.usage.values()][0].p_space==='synthetic-space')
reset();state.dbDown=true;check(!(await proposeWebsiteText('synthetic.example','Shorten','Synthetic passage')).ok);check(state.dispatches===0);check(state.usage.size===0)
// Exercise the actual Recraft paid seam, with only fetch replaced (never a vendor request).
reset();const originalFetch=globalThis.fetch,oldKey=process.env.RECRAFT_API_KEY,oldDisabled=process.env.AI_DISABLED
process.env.AI_DISABLED='0';process.env.RECRAFT_API_KEY='synthetic-test';globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{url:'https://example.test/synthetic.png'}]})})
try {
 const {generateImages}=await import('../lib/loom/recraft.ts')
 await generateImages({accounting:{feature:'entity-cover'},prompt:'Synthetic',lane:'raster',n:1})
 check([...state.usage.values()][0].cost===0.04);check([...state.usage.values()][0].p_feature==='entity-cover')
} finally {globalThis.fetch=originalFetch;if(oldDisabled===undefined)delete process.env.AI_DISABLED;else process.env.AI_DISABLED=oldDisabled;if(oldKey===undefined)delete process.env.RECRAFT_API_KEY;else process.env.RECRAFT_API_KEY=oldKey}
const sql=readFileSync('supabase/migrations/20270346007200_ai_budget_reservations.sql','utf8')
for(const obligation of ['pg_advisory_xact_lock','state in (\'reserved\',\'uncertain\')','f+p_estimate > p_feature_cap','s+p_estimate > p_space_cap','reservation_id=p_id','coalesce(r.operation_id,u.id)'])check(sql.includes(obligation))
console.log(`ok: ${assertions} shipped AI accounting/wrapper consequences; no provider requests or nested test runner`)
