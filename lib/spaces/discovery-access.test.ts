import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ actor: 'editor-A', owner: 'owner-A', role: 'editor', status: 'active', reads: [] as Record<string,string>[], fail: false, evidence: vi.fn(), consent: vi.fn(), write: vi.fn() }))
// Deliberately sticky cache: a cached membership would retain the original grant after revocation.
vi.mock('react', () => ({ cache: (fn: (...args: string[]) => unknown) => { const values = new Map(); return (...args: string[]) => { const key=JSON.stringify(args); if (!values.has(key)) values.set(key,fn(...args)); return values.get(key) } } }))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/auth',()=>({getMyProfileId:async()=>m.actor, isPlatformStaff:async()=>true}))
vi.mock('@/lib/spaces/store',()=>({getSpaceById:async(id:string)=>({id,slug:`slug-${id}`,ownerProfileId:m.owner})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 expect(table).toBe('space_members'); const filters:Record<string,string>={}
 const builder={select:()=>builder,eq:(key:string,value:string)=>{filters[key]=value;return builder},maybeSingle:async()=>{
  m.reads.push({...filters})
  return {data:m.fail||filters.space_id!=='space-A'?null:{id:'member',space_id:filters.space_id,profile_id:filters.profile_id,role:m.role,status:m.status,invited_by:null,created_at:'2026-10-01T00:00:00Z'},error:m.fail?{message:'unavailable'}:null}
 }}; return builder
}})}))
vi.mock('@/lib/spaces/private-state',()=>({loadSpaceDiscoveryConsent:m.consent,writeSpaceDiscoveryConsent:m.write,loadSpaceCoachProfile:async()=>({available:true,profile:{audience:'Neighbours',voice:'Plain'}})}))
vi.mock('@/lib/spaces/analytics',()=>({getSpaceProfileEvidence:m.evidence}))
vi.mock('@/lib/sites/host',()=>({appOrigin:()=> 'https://frequencylocal.com'}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
import { authorizeDiscoveryEditor } from './discovery-access'
import { getSpaceMembership } from './membership'
import { grantDiscoveryConsent } from './discovery-consent'
import { reviewSpaceDiscovery, setSpaceDiscoveryConsent } from '@/app/(main)/spaces/[slug]/settings/coach/discovery-actions'
beforeEach(()=>{
 m.actor='editor-A';m.owner='owner-A';m.role='editor';m.status='active';m.reads=[];m.fail=false
 const now=new Date()
 m.consent.mockResolvedValue({available:true,consent:grantDiscoveryConsent('owner-A','grant-A',new Date(now.getTime()-60000))})
 m.write.mockReset().mockResolvedValue(true)
 m.evidence.mockResolvedValue({windowDays:30,observedFrom:new Date(now.getTime()-30*86400000).toISOString(),observedThrough:now.toISOString(),profileViews:8,ctaClicks:1})
})
describe('uncached direct Space discovery access',()=>{
 it('reads only the actor/Space pair and rejects another Space',async()=>{
  expect(await authorizeDiscoveryEditor('space-A')).not.toBeNull()
  expect(m.reads[0]).toEqual({space_id:'space-A',profile_id:'editor-A'})
  expect(await authorizeDiscoveryEditor('space-B')).toBeNull()
 })
 it('does not borrow staff/network authority or accept a noneditor/suspended role',async()=>{
  m.role='member';expect(await authorizeDiscoveryEditor('space-A')).toBeNull()
  m.role='admin';m.status='suspended';expect(await authorizeDiscoveryEditor('space-A')).toBeNull()
  m.status='active';m.fail=true;expect(await authorizeDiscoveryEditor('space-A')).toBeNull()
 })
 it('bypasses a primed sticky cached membership when access is revoked',async()=>{
  expect((await getSpaceMembership('space-A','editor-A'))?.status).toBe('active')
  m.status='suspended'
  expect((await getSpaceMembership('space-A','editor-A'))?.status).toBe('active')
  expect(await authorizeDiscoveryEditor('space-A')).toBeNull()
 })
 it('uses the actual uncached reader after observation IO and discards a revoked editor result',async()=>{
  m.evidence.mockImplementationOnce(async()=>{m.status='suspended';const now=new Date();return {windowDays:30,observedFrom:new Date(now.getTime()-30*86400000).toISOString(),observedThrough:now.toISOString(),profileViews:8,ctaClicks:1}})
  expect(await reviewSpaceDiscovery('space-A')).toEqual({status:'unavailable',reason:'permission_denied'})
  expect(m.reads.length).toBeGreaterThanOrEqual(3)
 })
 it('reauthorizes with the actual reader before persisting a grant after storage IO',async()=>{
  m.consent.mockImplementationOnce(async()=>{m.status='suspended';return {available:true,consent:null}})
  expect(await setSpaceDiscoveryConsent('space-A',true)).toHaveProperty('error')
  expect(m.write).not.toHaveBeenCalled()
 })
 it('accepts the current owner without inventing a membership',async()=>{
  m.actor='owner-A'
  expect(await authorizeDiscoveryEditor('space-A')).not.toBeNull()
  expect(m.reads).toHaveLength(0)
 })
})
