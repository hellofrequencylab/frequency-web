import { beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({caller:'source-owner' as string|null,sourceOwner:'source-owner',targetOwner:'target-owner',live:true,enabled:true,visible:true,transferred:false,status:'pending',written:[] as unknown[],conflict:false}))
vi.mock('@/lib/auth',()=>({getCallerProfile:async()=>state.caller?{id:state.caller}:null}))
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}))
vi.mock('@/lib/spaces/store',()=>({getSpaceById:async(id:string)=>({id,ownerProfileId:id==='source'?state.sourceOwner:state.targetOwner})}))
vi.mock('@/lib/spaces/functions',()=>({spaceFunctionAccess:()=>state.enabled}))
vi.mock('./cross-listing-store',()=>({
  crossListingSubject:async()=>state.visible?{space_id:state.transferred?'other':'source',label:'Subject'}:null,
  collectiveListingSpace:async(id:string)=>({id,visibility:'network',owner_profile_id:id==='source'?state.sourceOwner:state.targetOwner}),
  belongsToLiveCollective:async()=>state.live,
  listingAdmin:()=>({from:()=>{
    const result={data:state.conflict?[]:[{id:'listing'}],error:null}
    const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>({data:{id:'listing',kind:'journey',subject_id:'subject',source_space_id:'source',space_id:'target',status:state.status,requested_by:'source-owner'},error:null}),
      insert:async(patch:unknown)=>{state.written.push(patch);return {error:null}},
      update:(patch:unknown)=>{state.written.push(patch);return chain},then:(resolve:(r:typeof result)=>void)=>resolve(result)}
    return chain
  }})
}))
import { requestCollectiveCrossListing, respondCollectiveCrossListing } from './cross-listing-actions'
const failed=(result:object)=>'error' in result
beforeEach(()=>Object.assign(state,{caller:'source-owner',sourceOwner:'source-owner',targetOwner:'target-owner',live:true,enabled:true,visible:true,transferred:false,status:'pending',written:[],conflict:false}))
describe('Collective cross-listing actions',()=>{
  it('creates pending requests only and never silently accepts partners',async()=>{
    expect(failed(await requestCollectiveCrossListing('journey','subject','target'))).toBe(false)
    expect(state.written).toEqual([{journey_id:'subject',source_space_id:'source',space_id:'target',requested_by:'source-owner',status:'pending'}])
  })
  it('refuses anonymous, strangers and disabled Space functions without writes',async()=>{
    state.caller=null;expect(failed(await requestCollectiveCrossListing('circle','subject','target'))).toBe(true)
    state.caller='stranger';expect(failed(await requestCollectiveCrossListing('circle','subject','target'))).toBe(true)
    state.caller='source-owner';state.enabled=false;expect(failed(await requestCollectiveCrossListing('circle','subject','target'))).toBe(true)
    expect(state.written).toEqual([])
  })
  it('refuses self-listings and inactive Collectives',async()=>{
    expect(failed(await requestCollectiveCrossListing('journey','subject','source'))).toBe(true)
    state.live=false;expect(failed(await requestCollectiveCrossListing('journey','subject','target'))).toBe(true)
    expect(state.written).toEqual([])
  })
  it('only target owner may accept a pending listing',async()=>{
    expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true)
    state.caller='target-owner';expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(false)
    expect(state.written).toHaveLength(1)
  })
  it('rechecks source visibility and ownership when consent arrives',async()=>{
    state.caller='target-owner';state.visible=false;expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true)
    state.visible=true;state.transferred=true;expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true)
    expect(state.written).toEqual([])
  })
  it('source ownership transfers invalidate old consent',async()=>{
    state.caller='target-owner';state.sourceOwner='new-owner';expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true);expect(state.written).toEqual([])
  })
  it('either side can remove accepted listings after parent cancellation',async()=>{
    state.status='accepted';state.live=false
    expect(failed(await respondCollectiveCrossListing('listing','revoked'))).toBe(false)
    state.caller='target-owner';expect(failed(await respondCollectiveCrossListing('listing','revoked'))).toBe(false)
  })
  it('refuses stale consent and conditional-write conflicts',async()=>{
    state.caller='target-owner';state.status='revoked';expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true)
    state.status='pending';state.conflict=true;expect(failed(await respondCollectiveCrossListing('listing','accepted'))).toBe(true)
  })
})
