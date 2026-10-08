import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { crossListingVisible, type CrossListingKind, type CrossListingStatus } from './cross-listing'

// Newly migrated relation; the client is scoped here until database types regenerate.
export const listingAdmin = (): SupabaseClient => createAdminClient()
export interface CrossListingRow { id: string; kind: CrossListingKind; subject_id: string; source_space_id: string; space_id: string; status: CrossListingStatus; requested_by?: string | null; responded_by?: string | null; label?: string; subjectSlug?: string; sourceName?: string; targetName?: string }
export interface CrossListingSubject { id: string; label: string; kind: CrossListingKind }
export interface CrossListingSpace { id: string; slug: string; name: string | null; owner_profile_id: string | null; plan: string | null; status: string | null; visibility: string | null; parent_id: string | null }
export async function collectiveListingSpace(id: string): Promise<CrossListingSpace | null> {
  const { data, error } = await listingAdmin().from('spaces').select('id,slug,name,owner_profile_id,plan,status,visibility,parent_id').eq('id', id).maybeSingle()
  return error ? null : data as CrossListingSpace | null
}
export async function belongsToLiveCollective(space: CrossListingSpace): Promise<boolean> {
  if (space.status !== 'active') return false
  if (space.plan === 'collective' || space.plan === 'nonprofit_collective') return true
  if (!space.parent_id) return false
  const parent = await collectiveListingSpace(space.parent_id)
  return !!parent && parent.status === 'active' && (parent.plan === 'collective' || parent.plan === 'nonprofit_collective') && parent.owner_profile_id === space.owner_profile_id
}
export async function crossListingSubject(kind: CrossListingKind, id: string): Promise<{space_id: string; label: string} | null> {
  const admin = listingAdmin()
  const { data, error } = kind === 'journey'
    ? await admin.from('journey_plans').select('space_id,title,visibility,status').eq('id', id).maybeSingle()
    : await admin.from('circles').select('space_id,name,status,unlisted,is_space_primary').eq('id', id).maybeSingle()
  const subject=data as unknown as {space_id?:string;title?:string;name?:string;visibility?:string;status?:string;unlisted?:boolean;is_space_primary?:boolean}|null
  if(error || !subject?.space_id || subject.is_space_primary || !crossListingVisible(kind,subject)) return null
  const label=kind==='journey'?subject.title:subject.name
  return typeof label==='string'?{space_id:subject.space_id,label}:null
}
export async function acceptedCrossListingIds(kind: CrossListingKind, target: string): Promise<string[]> {
  try {
    const admin = listingAdmin()
    const { data, error } = await admin.from('collective_cross_listings').select('subject_id,source_space_id,requested_by,responded_by').eq('kind',kind).eq('space_id',target).eq('status','accepted')
    const rows=(data ?? []) as Pick<CrossListingRow,'subject_id'|'source_space_id'|'requested_by'|'responded_by'>[]
    if (error || !rows.length) return []
    const targetSpace = await collectiveListingSpace(target)
    if (!targetSpace || targetSpace.visibility === 'private' || !await belongsToLiveCollective(targetSpace)) return []
    const { data: sources, error: sourceError } = await admin.from('spaces').select('id,slug,name,owner_profile_id,plan,status,visibility,parent_id').in('id',[...new Set(rows.map(r => r.source_space_id))])
    if (sourceError) return []
    const sourceRows=(sources ?? []) as CrossListingSpace[]
    const sourceParentIds=[...new Set(sourceRows.flatMap(s=>s.parent_id?[s.parent_id]:[]))]
    const sourceParents=sourceParentIds.length?await admin.from('spaces').select('id,plan,status,owner_profile_id').in('id',sourceParentIds):{data:[]}
    if('error' in sourceParents && sourceParents.error) return []
    const parentById=new Map(((sourceParents.data ?? []) as CrossListingSpace[]).map(s=>[s.id,s]))
    const visible=new Set(sourceRows.filter(source=>{
      if(source.status!=='active' || source.visibility==='private')return false
      if(source.plan==='collective' || source.plan==='nonprofit_collective')return true
      const parent=source.parent_id?parentById.get(source.parent_id):null
      return parent?.status==='active' && parent.owner_profile_id===source.owner_profile_id && (parent.plan==='collective' || parent.plan==='nonprofit_collective')
    }).map(s=>s.id))
    const subjects = await admin.from(kind === 'journey' ? 'journey_plans' : 'circles')
      .select(kind === 'journey' ? 'id,space_id,visibility,status' : 'id,space_id,status,unlisted,is_space_primary')
      .in('id',rows.map(r=>r.subject_id))
    if(subjects.error) return []
    type SubjectRow = {id:string;space_id:string;visibility?:string;status?:string;unlisted?:boolean;is_space_primary?:boolean}
    const byId=new Map(((subjects.data ?? []) as unknown as SubjectRow[]).map(s=>[s.id,s]))
    const owners=new Map(sourceRows.map(s=>[s.id,s.owner_profile_id]))
    return [...new Set(rows.filter(r=>{
      const subject=byId.get(r.subject_id)
      return !!r.responded_by && targetSpace.owner_profile_id===r.responded_by && !!r.requested_by && owners.get(r.source_space_id)===r.requested_by && visible.has(r.source_space_id) && subject?.space_id===r.source_space_id && !subject.is_space_primary && crossListingVisible(kind,subject)
    }).map(r=>r.subject_id))]
  } catch { return [] }
}
export async function crossListingManagement(spaceId: string): Promise<{subjects:CrossListingSubject[]; rows:CrossListingRow[]; targets:CrossListingSpace[]}> {
  const admin=listingAdmin()
  const [journeys,circles,shares,spaces]=await Promise.all([
    admin.from('journey_plans').select('id,title,visibility,status').eq('space_id',spaceId).neq('visibility','private'),
    admin.from('circles').select('id,name,status,unlisted,is_space_primary').eq('space_id',spaceId).in('status',['active','forming']).or('unlisted.is.null,unlisted.eq.false'),
    admin.from('collective_cross_listings').select('*').or(`source_space_id.eq.${spaceId},space_id.eq.${spaceId}`).in('status',['pending','accepted']),
    admin.from('spaces').select('id,slug,name,owner_profile_id,plan,status,visibility,parent_id').eq('status','active').neq('visibility','private').neq('id',spaceId).limit(200),
  ])
  const targets:CrossListingSpace[]=[]
  const candidates=(spaces.data ?? []) as CrossListingSpace[]
  const parentIds=[...new Set(candidates.flatMap(s=>s.parent_id?[s.parent_id]:[]))]
  const parents=parentIds.length ? await admin.from('spaces').select('id,plan,status,owner_profile_id').in('id',parentIds) : {data:[]}
  const byId=new Map(((parents.data ?? []) as CrossListingSpace[]).map(s=>[s.id,s]))
  for (const space of candidates) {
    const parent=space.parent_id?byId.get(space.parent_id):null
    if(space.plan==='collective' || space.plan==='nonprofit_collective' || parent && parent.status==='active' && parent.owner_profile_id===space.owner_profile_id && (parent.plan==='collective' || parent.plan==='nonprofit_collective')) targets.push(space)
  }
  const js=(journeys.data ?? []) as Array<{id:string;title:string;visibility:string;status:string}>
  const cs=(circles.data ?? []) as Array<{id:string;name:string;is_space_primary:boolean}>
  const rows=(shares.data ?? []) as CrossListingRow[]
  const journeyIds=rows.filter(r=>r.kind==='journey').map(r=>r.subject_id)
  const circleIds=rows.filter(r=>r.kind==='circle').map(r=>r.subject_id)
  const spaceIds=[...new Set(rows.flatMap(r=>[r.source_space_id,r.space_id]))]
  const [sharedJourneys,sharedCircles,relatedSpaces]=await Promise.all([
    journeyIds.length?admin.from('journey_plans').select('id,title,slug,space_id,visibility,status').in('id',journeyIds):{data:[]},
    circleIds.length?admin.from('circles').select('id,name,slug,space_id,status,unlisted').in('id',circleIds):{data:[]},
    spaceIds.length?admin.from('spaces').select('id,name,slug').in('id',spaceIds):{data:[]},
  ])
  type LabelSubject={id:string;title?:string;name?:string;slug:string;space_id:string;visibility?:string;status?:string;unlisted?:boolean}
  const labels=new Map([...(sharedJourneys.data ?? []),...(sharedCircles.data ?? [])].map(s=>[s.id,s as LabelSubject]))
  const names=new Map(((relatedSpaces.data ?? []) as Array<{id:string;name:string|null;slug:string}>).map(s=>[s.id,s.name ?? s.slug]))
  for(const row of rows){
    const subject=labels.get(row.subject_id)
    if(subject && subject.space_id===row.source_space_id && crossListingVisible(row.kind,subject)){row.label=subject.title ?? subject.name;row.subjectSlug=subject.slug}
    row.sourceName=names.get(row.source_space_id);row.targetName=names.get(row.space_id)
  }
  return { subjects:[...js.filter(j=>crossListingVisible('journey',j)).map(j=>({id:j.id,label:j.title,kind:'journey' as const})),...cs.filter(c=>!c.is_space_primary).map(c=>({id:c.id,label:c.name,kind:'circle' as const}))],rows,targets }
}
