// LIVE-877: actual create/reuse and discard actions; only auth/framework/database transports are synthetic.
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
const row={id:'draft-1',subject:'',preheader:'',body:'',sent_at:null,test_sent_at:null,scheduled_for:null,phase_id:null,recipient_count:0,block_json:{rows:[],bench:[{nid:'nbench01',type:'text',content:{text:'Authored bench copy'},style:{text:{color:'muted'}}}]}}
const state={row,writes:[],inserted:false,filters:[],from:()=>{
 state.inserted=false;
 const query={select:()=>query,eq:(key,value)=>{state.filters.push([key,value]);return query},order:()=>query,limit:()=>query,update:value=>{state.writes.push(['update',value]);return query},insert:value=>{state.inserted=true;state.writes.push(['insert',value]);return query},delete:()=>{state.writes.push(['delete']);return query},single:async()=>({data:{id:'draft-new'},error:null}),maybeSingle:async()=>({data:state.inserted?{id:'draft-new'}:row,error:null}),then:resolve=>resolve({data:[row],error:null})};return query
}}
globalThis.__review877=state
const modules=new Map([
 ['next/cache','export const revalidatePath=()=>{}'],['@/lib/supabase/admin','export const createAdminClient=()=>({from:globalThis.__review877.from})'],
 ['@/lib/outbound/guard','export const writerGate=async()=>({ok:true,profileId:"owner"})'],['@/lib/admin/guard','export const requireAdmin=async()=>{}'],['@/lib/auth','export const getCachedUser=async()=>null'],
 ['@/lib/email','export const sendRawEmail=()=>{throw Error("No outbound") }'],['@/lib/site','export const SITE_URL="https://example.test"'],
 ['@/lib/unsubscribe-tokens','export const buildUnsubscribeUrl=()=>"";export const buildManageEmailsUrl=()=>""'],['@/lib/studio/campaigns','export const BUILTIN_SEGMENTS=[];export const TRAIT_SEGMENT_PREFIX="seg:"'],
 ['@/lib/email-studio/send','export const sanitizeFromName=value=>value;export const loadCampaignFromName=()=>null;export const loadCampaignReplyMode=()=>null;export const resolveCampaignFromHeader=()=>null'],
])
registerHooks({resolve(spec,context,next){if(modules.has(spec))return {url:`data:text/javascript,${encodeURIComponent(modules.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {createEmailDraft,discardDraftIfEmpty}=await import('../app/(main)/admin/email-studio/actions.ts')
const node={nid:'nauthor1',type:'text',content:{text:'Authored native work',nested:{zero:0,no:false}},style:{text:{color:'muted'}}}
const cases=[{rows:[{id:'r0',columns:1,cells:[[node]]}]},{rows:[],bench:[node]},{rows:[{id:'r0',columns:1,cells:[[{...node,hidden:true}]]}],bench:[]},{rows:[],bench:[{...node,type:'futureType'}]},{rows:[],bench:[]},{rows:[],bench:null},{rows:[{id:'r0',columns:1,cells:[{}]}]},{rows:[{id:'r0',columns:1,cells:[['text',node]]}]}]
for(const layout of cases){
 row.block_json=structuredClone(layout);const before=JSON.stringify(row);state.writes=[];state.filters=[]
 assert.deepEqual(await createEmailDraft('message'),{data:{id:'draft-new'}});assert.deepEqual(state.writes.map(([kind])=>kind),['insert']);assert.equal(state.writes[0][1].created_by,'owner');assert(state.filters.some(([key,value])=>key==='created_by'&&value==='owner'));assert.equal(JSON.stringify(row),before)
 state.writes=[];await discardDraftIfEmpty('draft-1');assert.deepEqual(state.writes,[]);assert.equal(JSON.stringify(row),before)
}
row.block_json={rows:[],nodes:[{nid:'legacy-projection',type:'text'}]};state.writes=[]
assert.deepEqual(await createEmailDraft(),{data:{id:'draft-1'}});assert.deepEqual(state.writes.map(([kind])=>kind),['update'])
state.writes=[];state.filters=[];await discardDraftIfEmpty('draft-1');assert.deepEqual(state.writes,[['delete']]);assert(state.filters.some(([key,value])=>key==='created_by'&&value==='owner'))
console.log('ok: 8 raw native draft fixtures cannot be reset or discarded; legitimate legacy reuse/owner cleanup unchanged')
