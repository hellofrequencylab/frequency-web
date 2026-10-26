import {describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({updates:[] as unknown[]}))
vi.mock('@/lib/connections/lead-unsub',()=>({verifyLeadUnsubToken:(id:string,t:string)=>id==='contact-one'&&t==='valid'}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>({update:(patch:unknown)=>({eq:async(col:string,id:string)=>{state.updates.push({table,patch,col,id});return {error:null}}})})})}))
import {GET,POST} from './route'
describe('contact follow-up unsubscribe scope',()=>{
 it('confirmation describes only follow-up mail and stays read only',async()=>{state.updates=[];const r=await GET(new Request('https://synthetic.example/u/scan?c=contact-one&t=valid'));const html=await r.text();expect(html).toContain('Stop these follow-up emails?');expect(html).toContain('these follow-up emails');expect(html).not.toContain('stop emailing you at this address');expect(html).toContain('does not change other email preferences');expect(state.updates).toEqual([])})
 it('success accurately describes the single-contact write',async()=>{state.updates=[];const r=await POST(new Request('https://synthetic.example/u/scan?c=contact-one&t=valid',{method:'POST'}));const html=await r.text();expect(html).toContain('unsubscribed from these follow-up emails');expect(html).not.toContain("won't email you again");expect(state.updates).toHaveLength(1);expect(state.updates[0]).toMatchObject({table:'contacts',col:'id',id:'contact-one',patch:{consent_state:'unsubscribed'}})})
})
