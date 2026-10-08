'use server'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { fail, ok, type ActionResult } from '@/lib/action-result'
import { canRespondToCrossListing, type CrossListingKind } from './cross-listing'
import { belongsToLiveCollective, collectiveListingSpace, crossListingSubject, listingAdmin, type CrossListingRow } from './cross-listing-store'

async function ownsListingSpace(spaceId:string,callerId:string):Promise<boolean> {
  const space=await getSpaceById(spaceId)
  return !!space && space.ownerProfileId===callerId && spaceFunctionAccess(space,'profile','admin')
}
export async function requestCollectiveCrossListing(kind:CrossListingKind, subjectId:string, targetId:string):Promise<ActionResult> {
  if(kind!=='journey' && kind!=='circle') return fail('Not allowed.')
  const caller=await getCallerProfile()
  if(!caller) return fail('Not allowed.')
  const subject=await crossListingSubject(kind,subjectId)
  if(!subject || subject.space_id===targetId || !await ownsListingSpace(subject.space_id,caller.id)) return fail('Not allowed.')
  const [source,target]=await Promise.all([collectiveListingSpace(subject.space_id),collectiveListingSpace(targetId)])
  if(!source || !target || source.visibility==='private' || target.visibility==='private' || !await belongsToLiveCollective(source) || !await belongsToLiveCollective(target)) return fail('Choose an active Collective or member Space.')
  const {error}=await listingAdmin().from('collective_cross_listings').insert({[kind==='journey'?'journey_id':'circle_id']:subjectId,source_space_id:subject.space_id,space_id:targetId,requested_by:caller.id,status:'pending'})
  if(error) return fail('This listing could not be requested. It may already be pending or accepted.')
  revalidatePath('/spaces','layout')
  return ok()
}
export async function respondCollectiveCrossListing(id:string,next:'accepted'|'declined'|'revoked'):Promise<ActionResult> {
  if(!['accepted','declined','revoked'].includes(next)) return fail('Not allowed.')
  const caller=await getCallerProfile()
  if(!caller) return fail('Not allowed.')
  const {data,error}=await listingAdmin().from('collective_cross_listings').select('*').eq('id',id).maybeSingle()
  if(error || !data) return fail('Not allowed.')
  const row=data as CrossListingRow
  const [sourceOwn,targetOwn]=await Promise.all([ownsListingSpace(row.source_space_id,caller.id),ownsListingSpace(row.space_id,caller.id)])
  if(!targetOwn && !sourceOwn) return fail('Not allowed.')
  const side=targetOwn?'target':'source'
  if(!canRespondToCrossListing(row.status,side,next)) return fail('This request has already changed.')
  if(next==='accepted') {
    const [subject,source,target]=await Promise.all([crossListingSubject(row.kind,row.subject_id),collectiveListingSpace(row.source_space_id),collectiveListingSpace(row.space_id)])
    if(!subject || subject.space_id!==row.source_space_id || !source || !target || source.owner_profile_id!==row.requested_by || source.visibility==='private' || target.visibility==='private' || !await belongsToLiveCollective(source) || !await belongsToLiveCollective(target)) return fail('This listing is no longer available.')
  }
  const {data:updated,error:updateError}=await listingAdmin().from('collective_cross_listings').update({status:next,responded_by:caller.id,responded_at:new Date().toISOString()}).eq('id',id).eq('status',row.status).select('id')
  if(updateError || !updated?.length) return fail('This request has already changed.')
  revalidatePath('/spaces','layout')
  return ok()
}
