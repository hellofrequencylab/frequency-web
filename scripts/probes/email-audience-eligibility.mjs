// EMAIL-021: direct execution of shipped eligibility, policy reader and rendered picker.
// No nested runner; only action/DB transports and presentation primitives are substituted.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import * as React from 'react'
const root = process.cwd()
const state = { contacts: [], topic: 'marketing', calls: [], dbFail: false, preview: null }
globalThis.__audienceProbe = state
globalThis.__audienceProbeReact = React
const stub = new Map([
 ['server-only', 'export {}'],
 ['next/navigation', 'export const useRouter=()=>({refresh(){}})'],
 ['lucide-react', 'const R=globalThis.__audienceProbeReact;export const Users=()=>R.createElement("svg");export const Save=Users,Trash2=Users,Pencil=Users'],
 ['@/components/ui/button', 'const R=globalThis.__audienceProbeReact;export const Button=({variant,size,...props})=>R.createElement("button",props)'],
 ['@/components/ui/field', 'const R=globalThis.__audienceProbeReact;export const Input=props=>R.createElement("input",props)'],
 ['@/components/ui/select', 'const R=globalThis.__audienceProbeReact;export const Select=({wrapperClassName,emptyLabel,...props})=>R.createElement("select",props)'],
 ['@/lib/spaces/campaigns-actions', 'export const previewSpaceAudience=(...args)=>globalThis.__audienceProbe.preview(...args)'],
 ['@/lib/spaces/segments-actions', 'export const createSpaceSegment=async()=>({data:{id:"segment"}});export const updateSpaceSegment=async()=>({data:null});export const deleteSpaceSegment=async()=>({data:null})'],
 ['@/lib/supabase/admin', 'export const createAdminClient=()=>globalThis.__audienceProbe.db'],
])
registerHooks({
 resolve(spec, context, next) {
  if (spec==='@/lib/spaces/audiences' && context.parentURL?.endsWith('/audience-readiness.ts')) {
   return { url:'data:text/javascript,'+encodeURIComponent('export const resolveAudienceCandidatePlan=async()=>({contacts:globalThis.__audienceProbe.contacts,topic:globalThis.__audienceProbe.topic})'),shortCircuit:true }
  }
  if (stub.has(spec)) return { url:'data:text/javascript,'+encodeURIComponent(stub.get(spec)),shortCircuit:true }
  if (spec.startsWith('@/')) {
   for (const suffix of ['', '.ts', '.tsx', '/index.ts']) {
    const filename = path.join(root, spec.slice(2)+suffix)
    if (existsSync(filename) && path.extname(filename)) return { url:pathToFileURL(filename).href,shortCircuit:true }
   }
  }
  if (spec.startsWith('.') && context.parentURL?.startsWith('file:')) {
   const filename=fileURLToPath(new URL(spec,context.parentURL))
   for (const suffix of ['.ts','.tsx']) if(existsSync(filename+suffix)) return {url:pathToFileURL(filename+suffix).href,shortCircuit:true}
  }
  return next(spec,context)
 },
 load(url,context,next) {
  if(url.endsWith('.tsx')) return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true}
  return next(url,context)
 },
})
const { summarizeAudienceEligibility } = await import('../../lib/spaces/audience-eligibility.ts')
const unknown = Array.from({length:520},(_,i)=>({email:`synthetic-${i}@example.test`,consentState:'unknown'}))
for (const topic of ['marketing','events','dispatches']) {
 const report=summarizeAudienceEligibility(unknown,topic,new Set(),new Set())
 assert.equal(report.eligible,0);assert.equal(report.excluded.unknownConsent,520);assert.equal(report.matched,520)
 assert(!JSON.stringify(report).includes('@'))
}
const rows=[{email:'invalid',consentState:'subscribed'},{email:'A@example.test',consentState:'subscribed'},
 {email:' a@example.test ',consentState:'subscribed'},{email:'unknown@example.test',consentState:null},
 {email:'out@example.test',consentState:'unsubscribed'},{email:'hold@example.test',consentState:'subscribed'},
 {email:'mute@example.test',consentState:'subscribed'}]
const report=summarizeAudienceEligibility(rows,'marketing',new Set(['hold@example.test']),new Set(['mute@example.test']))
assert.deepEqual(report.excluded,{invalid:1,duplicate:1,unknownConsent:1,unsubscribed:1,suppressed:1,muted:1})
assert.equal(report.eligible,1);assert.equal(Object.values(report.excluded).reduce((a,b)=>a+b,0)+report.eligible,report.matched)
// Real policy-reader query chains must carry tenant/global, topic/channel and bounded address filters.
state.db={from(table){const call={table,filters:[]};state.calls.push(call);const q={
 select(columns){call.columns=columns;return q},eq(column,value){call.filters.push(['eq',column,value]);return q},
 is(column,value){call.filters.push(['is',column,value]);return q},
 async in(column,values){call.filters.push(['in',column,values]);return {data:[],error:state.dbFail?{message:'offline'}:null}},
};return q}}
const { readAudienceEligibility }=await import('../../lib/spaces/audience-readiness.ts')
state.contacts=Array.from({length:201},(_,i)=>({email:`allowed-${i}@example.test`,consentState:'subscribed'}))
const scoped=await readAudienceEligibility('pilot-space',{},'marketing')
assert.equal(scoped.eligible,201);assert.equal(state.calls.length,9)
for(const call of state.calls){const batch=call.filters.find(f=>f[0]==='in');assert.equal(batch[1],'email');assert(batch[2].length<=100)
 if(call.table==='contact_channel_preferences'){assert(call.filters.some(f=>f[1]==='space_id'&&f[2]==='pilot-space'));assert(call.filters.some(f=>f[1]==='topic'&&f[2]==='marketing'));assert(call.filters.some(f=>f[1]==='channel'&&f[2]==='email'))}
}
assert(state.calls.some(c=>c.filters.some(f=>f[0]==='is'&&f[1]==='space_id'&&f[2]===null)))
assert(state.calls.some(c=>c.table==='email_suppressions'&&c.filters.some(f=>f[1]==='space_id'&&f[2]==='pilot-space')))
state.dbFail=true;assert.equal((await readAudienceEligibility('pilot-space')).state,'unavailable');state.dbFail=false
// Real shipped picker render must describe checking, never imply a failed or eligible audience
// before the action resolves. Full async recovery/stale-response fault tests remain CI-discovered.
const { renderToStaticMarkup }=await import('react-dom/server')
const { AudiencePicker }=await import('../../components/spaces/email/audience-picker.tsx')
const props={spaceId:'pilot-space',slug:'pilot',tags:['friends'],filter:{},onFilterChange(){}}
const markup=renderToStaticMarkup(React.createElement(AudiencePicker,props))
assert(markup.includes('Checking eligibility'));assert(markup.includes('role="status"'))
assert(markup.includes('friends'));assert(!markup.includes('currently eligible'));assert(!markup.includes('could not be checked'))
const memberMarkup=renderToStaticMarkup(React.createElement(AudiencePicker,{...props,filter:{memberSegment:'members'},memberSegments:[{key:'members',label:'All members'}]}))
assert(memberMarkup.includes('All members'));assert(memberMarkup.includes('strictest consent bar'))
assert(memberMarkup.includes('Marketing'));assert(!memberMarkup.includes('Audience exclusions'))
console.log('ok: shipped audience consent/exclusion consequences, actual policy scopes/batches/failure and real initial/member picker rendering; async picker fault suite remains separately CI-discovered')
