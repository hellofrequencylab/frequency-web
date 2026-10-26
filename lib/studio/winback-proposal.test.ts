import { beforeEach, describe, expect, it, vi } from 'vitest'
const m=vi.hoisted(()=>({inserts:[] as Record<string,unknown>[],updates:[] as Record<string,unknown>[],action:null as Record<string,unknown>|null,send:vi.fn(),gate:vi.fn(),complete:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,gte:()=>q,not:()=>q,neq:()=>q,limit:()=>q,order:()=>q,
  insert:async(value:Record<string,unknown>)=>{m.inserts.push(value);return {error:null}},
  update:(value:Record<string,unknown>)=>{m.updates.push(value);return q},
  maybeSingle:async()=>({data:m.action,error:null}),
  then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:table==='contacts'?[{profile_id:'member-A',email:'member@example.com',display_name:'Ada'}]:[]}).then(resolve),
 };return q
}})}))
vi.mock('@/lib/email',()=>({enqueueEmail:m.send,listUnsubscribeHeaders:()=>({})}))
vi.mock('@/lib/comms/send-gate',()=>({resolveSendGate:m.gate}))
vi.mock('@/lib/unsubscribe-tokens',()=>({buildUnsubscribeUrl:()=> 'https://example.com/unsubscribe'}))
vi.mock('@/lib/site',()=>({SITE_URL:'https://example.com'}))
vi.mock('@/lib/email-studio/shell',()=>({plainTextEmail:(body:string)=>({html:body,text:body})}))
vi.mock('@/lib/ai/usage',()=>({aiAvailable:async()=>true,featureOverBudget:async()=>false}))
vi.mock('@/lib/ai/rate-limit',()=>({aiRateLimited:async()=>false}))
vi.mock('@/lib/ai/complete',()=>({completeRaw:m.complete}))
import { proposeWinbacks, executeAction } from './agent'
import { deterministicWinback } from './winback'
beforeEach(()=>{vi.clearAllMocks();m.inserts=[];m.updates=[];m.action=null;m.gate.mockResolvedValue({allowed:true});m.complete.mockResolvedValue({text:'{"subject":"MODEL SUBJECT","body":"MODEL BODY"}'})})
describe('winback proposal/write/send separation',()=>{
 it('persists only the existing operational template and never requests a model draft',async()=>{
  expect(await proposeWinbacks(1)).toBe(1)
  expect(m.complete).not.toHaveBeenCalled()
  expect(m.send).not.toHaveBeenCalled()
  const payload=m.inserts[0].payload as Record<string,unknown>
  expect(payload).toMatchObject({...deterministicWinback('Ada'),copySource:'operational_winback_v1',templateName:'Ada'})
  expect(JSON.stringify(m.inserts)).not.toContain('MODEL')
  expect(m.inserts[0].status).toBe('proposed')
 })
 it('keeps proposal consent and execution approval/send-consent gates',async()=>{
  m.gate.mockResolvedValue({allowed:false});expect(await proposeWinbacks(1)).toBe(0);expect(m.inserts).toHaveLength(0)
  const payload={profileId:'member-A',email:'member@example.com',...deterministicWinback('Ada'),copySource:'operational_winback_v1',templateName:'Ada'}
  m.action={kind:'email_contact',status:'proposed',payload};expect((await executeAction('a')).ok).toBe(false);expect(m.send).not.toHaveBeenCalled()
  m.action={kind:'email_contact',status:'approved',payload};await executeAction('a');expect(m.send).not.toHaveBeenCalled()
  m.gate.mockResolvedValue({allowed:true});await executeAction('a');expect(m.send).toHaveBeenCalledWith(expect.objectContaining({subject:payload.subject,text:payload.body}))
 })
 it('never sends a legacy or edited model payload even if marked approved',async()=>{
  for(const payload of [{profileId:'member-A',email:'member@example.com',subject:'MODEL SUBJECT',body:'MODEL BODY'},{profileId:'member-A',email:'member@example.com',...deterministicWinback('Ada'),copySource:'operational_winback_v1',templateName:'Ada',body:'MODEL BODY'}]){
   m.action={kind:'email_contact',status:'approved',payload}
   expect((await executeAction('a')).ok).toBe(false)
  }
  expect(m.send).not.toHaveBeenCalled();expect(m.updates).toHaveLength(0)
 })
})
