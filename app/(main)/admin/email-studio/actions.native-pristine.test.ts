import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({layout:null as unknown,writes:[] as [string,unknown?][],filters:[] as [string,unknown][],allowed:true,reads:0}))
vi.mock('@/lib/outbound/guard',()=>({writerGate:async()=>state.allowed?{ok:true,profileId:'owner'}:{ok:false,error:'Forbidden'}}))
vi.mock('@/lib/admin/guard',()=>({requireAdmin:vi.fn()}))
vi.mock('@/lib/auth',()=>({getCachedUser:vi.fn()}))
vi.mock('@/lib/email',()=>({sendRawEmail:()=>{throw Error('No outbound sends')}}))
vi.mock('@/lib/site',()=>({SITE_URL:'https://example.test'}))
vi.mock('@/lib/unsubscribe-tokens',()=>({buildUnsubscribeUrl:()=>'',buildManageEmailsUrl:()=>''}))
vi.mock('@/lib/studio/campaigns',()=>({BUILTIN_SEGMENTS:[],TRAIT_SEGMENT_PREFIX:'seg:'}))
vi.mock('@/lib/email-studio/send',()=>({sanitizeFromName:(v:string)=>v,loadCampaignFromName:vi.fn(),loadCampaignReplyMode:vi.fn(),resolveCampaignFromHeader:vi.fn()}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{
 state.reads++;let inserted=false
 const row=()=>({id:'draft-native',subject:'',preheader:'',body:'',sent_at:null,test_sent_at:null,scheduled_for:null,phase_id:null,recipient_count:0,block_json:state.layout})
 const query={select:()=>query,eq:(key:string,value:unknown)=>{state.filters.push([key,value]);return query},order:()=>query,limit:()=>query,
 update:(value:unknown)=>{state.writes.push(['update',value]);return query},insert:(value:unknown)=>{inserted=true;state.writes.push(['insert',value]);return query},delete:()=>{state.writes.push(['delete']);return query},single:async()=>({data:{id:'draft-new'},error:null}),maybeSingle:async()=>({data:inserted?{id:'draft-new'}:row(),error:null}),then:(resolve:(result:unknown)=>void)=>resolve({data:[row()],error:null})};return query
}})}))
import {createEmailDraft,discardDraftIfEmpty} from './actions'
const node={nid:'nauthor1',type:'text',content:{text:'Authored native work',nested:{zero:0,no:false}},style:{text:{color:'muted'}}}
const fixtures=[
 ['placed',{rows:[{id:'r0',columns:1,cells:[[node]]}]}],
 ['bench',{rows:[],bench:[node]}],
 ['hidden',{rows:[{id:'r0',columns:1,cells:[[{...node,hidden:true}]]}],bench:[]}],
 ['unknown',{rows:[],bench:[{...node,type:'futureType',content:{opaque:{list:[0,false,null]}}}]}],
 ['empty native bench',{rows:[],bench:[]}],
 ['malformed bench',{rows:[],bench:null}],
 ['malformed object cell',{rows:[{id:'r0',columns:1,cells:[{}]}]}],
 ['mixed cells',{rows:[{id:'r0',columns:1,cells:[['text',node]]}]}],
] as const
beforeEach(()=>{state.layout=null;state.writes=[];state.filters=[];state.allowed=true;state.reads=0})
describe('native email draft reuse and cleanup preserve raw authored bytes',()=>{
 it.each(fixtures)('never resets or deletes %s native draft',async(_label,layout)=>{
   state.layout=structuredClone(layout);const bytes=JSON.stringify(state.layout)
   expect(await createEmailDraft('message')).toEqual({data:{id:'draft-new'}})
   expect(state.writes.map(([kind])=>kind)).toEqual(['insert']);expect(state.writes[0][1]).toMatchObject({created_by:'owner',status:'draft'});expect(state.filters).toContainEqual(['created_by','owner']);expect(JSON.stringify(state.layout)).toBe(bytes)
   state.writes=[];await discardDraftIfEmpty('draft-native');expect(state.writes).toEqual([]);expect(JSON.stringify(state.layout)).toBe(bytes)
 })
 it('retains ordinary blank legacy reuse and owner-scoped discard controls',async()=>{
   state.layout={rows:[],nodes:[{nid:'projection',type:'text'}]}
   expect(await createEmailDraft()).toEqual({data:{id:'draft-native'}});expect(state.writes.map(([kind])=>kind)).toEqual(['update'])
   state.writes=[];state.filters=[];await discardDraftIfEmpty('draft-native');expect(state.writes).toEqual([['delete']]);expect(state.filters).toContainEqual(['created_by','owner']);expect(state.filters).toContainEqual(['status','draft'])
 })
 it('keeps authored legacy content and authorization ahead of all native draft database access',async()=>{
   state.layout={rows:[],content:{text:{text:'Authored legacy copy'}}};await discardDraftIfEmpty('draft-native');expect(state.writes).toEqual([])
   state.allowed=false;state.reads=0;expect(await createEmailDraft()).toEqual({error:'Forbidden'});expect(await discardDraftIfEmpty('draft-native')).toEqual({error:'Forbidden'});expect(state.reads).toBe(0);expect(state.writes).toEqual([])
 })
})
