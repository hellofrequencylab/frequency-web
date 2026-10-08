// LIVE-887: run the shipped Space lifecycle actions with framework/auth/data imports stubbed.
// No nested runner; authored fixture integrity and node upgrade behavior remain the LIVE-871 gate.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { upgradeLayout } from '../lib/entity-blocks/node-tree.ts'
import { checkNodeDocumentSafety, rehydrateCensus } from './check-node-document-safety.mjs'
import { parseEntityLayout } from '../lib/entity-blocks/layout.ts'
import { NODE_LAYOUT_WRITE_ERROR } from '../lib/entity-blocks/legacy-write-guard.ts'

assert.deepEqual(checkNodeDocumentSafety(), [], 'the authored fixture inputs must still be pinned and complete')
const state = { preferences: {}, writes: [], allowed: true }
globalThis.__spaceNodeWriteProbe = state
const sources = new Map([
  ['next/cache', 'export const revalidatePath=()=>{}'],
  ['@/lib/auth', 'export const getCallerProfile=async()=>({id:"owner"})'],
  ['@/lib/spaces/store', 'const space=()=>({id:"space",slug:"calm",preferences:globalThis.__spaceNodeWriteProbe.preferences});export const getSpaceById=async()=>space();export const getVisibleSpaceBySlug=async()=>space();'],
  ['@/lib/spaces/entitlements', 'export const resolveSpaceManageAccess=async()=>({canManage:globalThis.__spaceNodeWriteProbe.allowed})'],
  ['@/lib/sites/site-cache', 'export const refreshSite=()=>{}'],
  ['@/lib/importer/store', 'export const getIntakeBySpaceId=async()=>null'],
  ['@/lib/importer/compose', 'export const reseedBlockCopy=async()=>null'],
  ['@/lib/supabase/admin', 'export const createAdminClient=()=>({from:()=>({update:value=>{globalThis.__spaceNodeWriteProbe.writes.push(value);return {eq:async()=>({error:null})}}})})'],
])
registerHooks({ resolve(spec, context, next) {
  if (sources.has(spec)) return {url:`data:text/javascript,${encodeURIComponent(sources.get(spec))}`,shortCircuit:true}
  return next(spec, context)
} })
const { saveSpaceGridLayout, publishSpaceProfileLayout, discardSpaceProfileDraft } = await import('../app/(main)/spaces/[slug]/settings/profile/actions.ts')
const legacy = { rows:[{id:'r0',columns:1,cells:[['text']]}],content:{text:{text:'Authored copy'}} }
const census=JSON.parse(readFileSync('scripts/entity-layout-corpus.json','utf8'))
const rawDocuments=[...census.documents.map(rehydrateCensus),JSON.parse(readFileSync('scripts/fixtures/node-document-safety/unknown-nested.json','utf8'))]
const clone=value=>JSON.parse(JSON.stringify(value))
let checks=0
async function refuses(action) {
  const before=JSON.stringify(state.preferences)
  state.writes=[]
  assert.deepEqual(await action(),{error:NODE_LAYOUT_WRITE_ERROR})
  assert.deepEqual(state.writes,[],'incompatible layout caused a database write')
  assert.equal(JSON.stringify(state.preferences),before,'authored preference bytes changed')
  checks++
}
for(const raw of rawDocuments) {
  const native=upgradeLayout(raw)
  state.preferences={accent:'sky',profileLayout:clone(legacy)}
  await refuses(()=>saveSpaceGridLayout('calm',native))
  for(const key of ['profileLayout','profileLayoutDraft']) {
    state.preferences={accent:'sky',profileLayoutDraft:clone(legacy),[key]:clone(native)}
    await refuses(()=>saveSpaceGridLayout('calm',legacy))
    await refuses(()=>saveSpaceGridLayout('calm',{rows:[],hidden:[]}))
    await refuses(()=>publishSpaceProfileLayout('calm'))
    await refuses(()=>discardSpaceProfileDraft('calm'))
  }
}
for(const native of [{rows:[],bench:[]},{rows:[],bench:'malformed'},{rows:[{id:'r0',columns:1,cells:[['text',{nid:'nabcdef',type:'text',content:{text:'Second authored placement'}}]]}]}]) {
  state.preferences={accent:'sky',profileLayout:clone(legacy)}
  await refuses(()=>saveSpaceGridLayout('calm',native))
}
// Existing projected legacy saves, normal publication and intentional draft discard still work.
state.preferences={accent:'sky',profileLayout:clone(legacy)};state.writes=[]
assert.deepEqual(await saveSpaceGridLayout('calm',parseEntityLayout(legacy)),{})
assert.equal(state.writes.length,1)
assert.equal(state.writes[0].preferences.accent,'sky')
assert.equal(state.writes[0].preferences.profileLayoutDraft,undefined)
state.preferences={accent:'sky',profileLayoutDraft:clone(legacy)};state.writes=[]
assert.deepEqual(await publishSpaceProfileLayout('calm'),{})
assert.deepEqual(state.writes[0].preferences.profileLayout,legacy)
state.preferences={accent:'sky',profileLayout:clone(legacy),profileLayoutDraft:clone(legacy)};state.writes=[]
assert.deepEqual(await discardSpaceProfileDraft('calm'),{})
assert.deepEqual(state.writes[0].preferences.profileLayout,legacy)
state.allowed=false;state.writes=[]
assert.deepEqual(await saveSpaceGridLayout('calm',upgradeLayout(rawDocuments.at(-1))),{error:'You do not have permission to edit this space.'})
assert.deepEqual(state.writes,[])
console.log(`ok: ${checks} refused native/stale Space lifecycle writes preserve authored bytes; legacy controls still save`)
