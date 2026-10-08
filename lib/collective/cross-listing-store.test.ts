import { beforeEach, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({status:'accepted',targetLive:true,sourceLive:true,private:false,subjectPrivate:false,transferred:false,error:false}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
  let id='';const chain={select:()=>chain,eq:(key:string,value:string)=>{if(key==='id')id=value;return chain},in:()=>chain,
    maybeSingle:async()=>({data:{id,status:'active',plan:id==='target'?(state.targetLive?'collective':'free'):(state.sourceLive?'collective':'free'),visibility:state.private?'private':'network',owner_profile_id:'target-owner'},error:null}),
    then:(resolve:(value:unknown)=>void)=>{
      const data=table==='collective_cross_listings'?[{subject_id:'journey',source_space_id:'source',requested_by:'owner',responded_by:'target-owner'}]:table==='spaces'?[{id:'source',status:'active',plan:state.sourceLive?'collective':'free',visibility:state.private?'private':'network',owner_profile_id:'owner'}]:[{id:'journey',space_id:state.transferred?'new-owner':'source',visibility:state.subjectPrivate?'private':'public'}]
      resolve({data,error:state.error?'unavailable':null})
    }};return chain
}})}))
import { acceptedCrossListingIds } from './cross-listing-store'
beforeEach(()=>Object.assign(state,{targetLive:true,sourceLive:true,private:false,subjectPrivate:false,transferred:false,error:false}))
it('reads accepted public Journey listings without rewriting original ownership',async()=>{expect(await acceptedCrossListingIds('journey','target')).toEqual(['journey'])})
it('hides listings on parent cancellation, walling, privacy or source transfer',async()=>{
  for(const key of ['private','subjectPrivate','transferred','error'] as const){state[key]=true;expect(await acceptedCrossListingIds('journey','target')).toEqual([]);state[key]=false}
  state.targetLive=false;expect(await acceptedCrossListingIds('journey','target')).toEqual([])
  state.targetLive=true;state.sourceLive=false;expect(await acceptedCrossListingIds('journey','target')).toEqual([])
})
