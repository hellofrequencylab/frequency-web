// LIVE-875: shipped member writer, with only framework/auth/data boundaries stubbed.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { upgradeLayout } from '../lib/entity-blocks/node-tree.ts'
import { checkNodeDocumentSafety, rehydrateCensus } from './check-node-document-safety.mjs'
import { parseEntityLayout } from '../lib/entity-blocks/layout.ts'
import { NODE_LAYOUT_WRITE_ERROR } from '../lib/entity-blocks/legacy-write-guard.ts'
assert.deepEqual(checkNodeDocumentSafety(), [])
const state={user:{id:'auth-1'},me:null,rpcs:[],queries:[]}
globalThis.__memberNodeWriteProbe=state
const sources=new Map([
 ['next/cache','export const revalidatePath=()=>{}'],
 ['@/lib/supabase/server',`export const createClient=async()=>({auth:{getUser:async()=>({data:{user:globalThis.__memberNodeWriteProbe.user}})},from:()=>({select:()=>({eq:(...args)=>{globalThis.__memberNodeWriteProbe.queries.push(args);return {maybeSingle:async()=>({data:globalThis.__memberNodeWriteProbe.me})}}}),update:()=>{throw Error('Whole profile update forbidden')} }),rpc:async(name,args)=>{globalThis.__memberNodeWriteProbe.rpcs.push([name,args]);return {data:{},error:null}}})`],
 ['@/lib/supabase/admin','export const createAdminClient=()=>{throw Error("Admin writer forbidden")}'],
 ['@/lib/awards/holdings','export const memberHeldItems=()=>[]'],
 ['@/lib/spotlight/top-friends','export const normalizeTopFriendIds=()=>[];export const keepAcceptedFriends=()=>[];export const toTopFriendRows=()=>[];export const rewriteTopFriends=()=>{};export const deleteOneTopFriend=()=>{};export const getOwnerTopFriendIds=()=>[]'],
])
registerHooks({resolve(spec,context,next){if(sources.has(spec))return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true};return next(spec,context)}})
const {saveMemberGridLayout}=await import('../app/(main)/settings/profile/spotlight-actions.ts')
const legacy={rows:[{id:'r0',columns:1,cells:[['text']]}],content:{text:{text:'Authored copy'}}}
const census=JSON.parse(readFileSync('scripts/entity-layout-corpus.json','utf8'))
const documents=[...census.documents.map(rehydrateCensus),JSON.parse(readFileSync('scripts/fixtures/node-document-safety/unknown-nested.json','utf8'))]
let checks=0
async function refuses(payload){const before=JSON.stringify(state.me);state.rpcs=[];assert.deepEqual(await saveMemberGridLayout(payload),{error:NODE_LAYOUT_WRITE_ERROR});assert.deepEqual(state.rpcs,[]);assert.equal(JSON.stringify(state.me),before);checks++}
for(const document of documents){const native=upgradeLayout(document);state.me={id:'prof-1',handle:'ada',meta:{entityGrid:legacy,practiceStreak:{days:12}}};await refuses(native);state.me.meta.entityGrid=native;for(const payload of [legacy,{},null])await refuses(payload)}
for(const native of [{rows:[],bench:[]},{rows:[],bench:null},{rows:[{id:'r0',columns:1,cells:[['text',{nid:'nabcdef',type:'text',content:{text:'Second authored placement'}}]]}]}]){state.me.meta.entityGrid=legacy;await refuses(native)}
state.me={id:'prof-1',handle:'ada',meta:{entityGrid:legacy,practiceStreak:{days:12}}};state.rpcs=[];state.queries=[]
assert.deepEqual(await saveMemberGridLayout({...parseEntityLayout(legacy),profile_id:'foreign',id:'foreign'}),{})
assert.deepEqual(state.queries,[['auth_user_id','auth-1']]);assert.deepEqual(state.rpcs,[['merge_profile_meta',{p_profile_id:'prof-1',p_patch:{entityGrid:legacy}}]])
state.rpcs=[];assert.deepEqual(await saveMemberGridLayout({}),{});assert.deepEqual(state.rpcs,[['remove_profile_meta_keys',{p_profile_id:'prof-1',p_keys:['entityGrid']}]])
state.user=null;state.queries=[];state.rpcs=[];assert.deepEqual(await saveMemberGridLayout({bench:[]}),{error:'Unauthorized'});assert.deepEqual(state.queries,[]);assert.deepEqual(state.rpcs,[])
state.user={id:'auth-1'};state.me=null;assert.deepEqual(await saveMemberGridLayout({bench:[]}),{error:'Profile not found'});assert.deepEqual(state.rpcs,[])
console.log(`ok: ${checks} member native/stale writes preserve authored bytes; session-scoped legacy controls pass`)
