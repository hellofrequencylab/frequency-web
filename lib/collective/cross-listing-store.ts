import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { crossListingVisible, type CrossListingKind, type CrossListingStatus } from './cross-listing'

// PostgREST applies a response ceiling even without a caller limit. Every listing
// inventory is exhaustively paged; bulk lookups stay below URL/response ceilings.
const PAGE = 500
const BATCH = 200
interface PageQuery<T> extends PromiseLike<{data:T[]|null;error:unknown}> {
  range(from:number,to:number): PageQuery<T>
  order(column:string,options?:{ascending:boolean}): PageQuery<T>
}
async function pages<T>(build:()=>PageQuery<T>, order='id'):Promise<T[]> {
  const rows:T[]=[]
  for(let offset=0;;offset+=PAGE){
    const {data,error}=await build().order(order,{ascending:true}).range(offset,offset+PAGE-1)
    if(error) throw new Error('Collective listing inventory unavailable')
    const page=data ?? [];rows.push(...page)
    if(page.length<PAGE)return rows
  }
}
async function byIds<T>(table:string,columns:string,ids:string[]):Promise<T[]> {
  const rows:T[]=[]
  const unique=[...new Set(ids)]
  for(let offset=0;offset<unique.length;offset+=BATCH){
    rows.push(...await pages<T>(()=>listingAdmin().from(table).select(columns).in('id',unique.slice(offset,offset+BATCH)) as unknown as PageQuery<T>))
  }
  return rows
}

// Newly migrated relation; the client is scoped here until database types regenerate.
export const listingAdmin = (): SupabaseClient => createAdminClient()
export interface CrossListingRow { id: string; kind: CrossListingKind; subject_id: string; source_space_id: string; space_id: string; status: CrossListingStatus; requested_by?: string | null; responded_by?: string | null; label?: string; subjectSlug?: string; sourceName?: string; targetName?: string }
export interface CrossListingSubject { id: string; label: string; kind: CrossListingKind }
export interface CrossListingSpace { id: string; slug: string; name: string | null; owner_profile_id: string | null; plan: string | null; status: string | null; visibility: string | null; parent_id: string | null; type?:string | null }
export async function collectiveListingSpace(id: string): Promise<CrossListingSpace | null> {
  const { data, error } = await listingAdmin().from('spaces').select('id,slug,name,owner_profile_id,plan,status,visibility,parent_id,type').eq('id', id).maybeSingle()
  return error ? null : data as CrossListingSpace | null
}
export async function belongsToLiveCollective(space: CrossListingSpace): Promise<boolean> {
  if (space.status !== 'active' || space.type==='root') return false
  if ((space.plan === 'collective' || space.plan === 'nonprofit_collective') && space.parent_id===null) return true
  if (!space.parent_id) return false
  const parent = await collectiveListingSpace(space.parent_id)
  return !!parent && parent.status === 'active' && parent.type!=='root' && parent.parent_id===null && (parent.plan === 'collective' || parent.plan === 'nonprofit_collective') && parent.owner_profile_id === space.owner_profile_id
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
export async function acceptedCrossListingSubjects(kind: CrossListingKind, target:string, pending=false):Promise<Record<string,unknown>[]> {
  try {
    // One SQL snapshot joins consent, current owners, source binding and visibility.
    // Return the authorized subject itself: a later independent subject fetch could
    // race a transfer and expose the newly owned object under stale consent.
    const rows=await pages<{subject:Record<string,unknown>}>(()=>listingAdmin().rpc('read_collective_cross_listings',{p_kind:kind,p_target:target,p_pending:pending}) as unknown as PageQuery<{subject:Record<string,unknown>}>)
    return rows.map(row=>row.subject)
  } catch { return [] }
}
export async function crossListingManagement(spaceId: string): Promise<{subjects:CrossListingSubject[]; rows:CrossListingRow[]; targets:CrossListingSpace[]}> {
  const admin=listingAdmin()
  const [journeys,circles,shares,spaces]=await Promise.all([
    pages(()=>admin.from('journey_plans').select('id,title,visibility,status').eq('space_id',spaceId).neq('visibility','private') as unknown as PageQuery<{id:string;title:string;visibility:string;status:string}>).then(data=>({data})),
    pages(()=>admin.from('circles').select('id,name,status,unlisted,is_space_primary').eq('space_id',spaceId).in('status',['active','forming']).or('unlisted.is.null,unlisted.eq.false') as unknown as PageQuery<{id:string;name:string;is_space_primary:boolean}>).then(data=>({data})),
    pages(()=>admin.from('collective_cross_listings').select('*').or(`source_space_id.eq.${spaceId},space_id.eq.${spaceId}`).in('status',['pending','accepted']) as unknown as PageQuery<CrossListingRow>).then(data=>({data})),
    pages(()=>admin.from('spaces').select('id,slug,name,owner_profile_id,plan,status,visibility,parent_id,type').eq('status','active').neq('visibility','private').neq('id',spaceId) as unknown as PageQuery<CrossListingSpace>).then(data=>({data})),
  ])
  const targets:CrossListingSpace[]=[]
  const candidates=(spaces.data ?? []) as CrossListingSpace[]
  const parentIds=[...new Set(candidates.flatMap(s=>s.parent_id?[s.parent_id]:[]))]
  const parents={data:await byIds<CrossListingSpace>('spaces','id,plan,status,owner_profile_id,parent_id,type',parentIds)}
  const byId=new Map(((parents.data ?? []) as CrossListingSpace[]).map(s=>[s.id,s]))
  for (const space of candidates) {
    const parent=space.parent_id?byId.get(space.parent_id):null
    if(space.type!=='root' && ((space.parent_id===null && (space.plan==='collective' || space.plan==='nonprofit_collective')) || parent && parent.type!=='root' && parent.parent_id===null && parent.status==='active' && parent.owner_profile_id===space.owner_profile_id && (parent.plan==='collective' || parent.plan==='nonprofit_collective'))) targets.push(space)
  }
  const js=(journeys.data ?? []) as Array<{id:string;title:string;visibility:string;status:string}>
  const cs=(circles.data ?? []) as Array<{id:string;name:string;is_space_primary:boolean}>
  const rows=(shares.data ?? []) as CrossListingRow[]
  const journeyIds=rows.filter(r=>r.kind==='journey').map(r=>r.subject_id)
  const circleIds=rows.filter(r=>r.kind==='circle').map(r=>r.subject_id)
  const spaceIds=[...new Set(rows.flatMap(r=>[r.source_space_id,r.space_id]))]
  const [sharedJourneys,sharedCircles,relatedSpaces]=await Promise.all([
    byIds<LabelSubject>('journey_plans','id,title,slug,space_id,visibility,status',journeyIds).then(data=>({data})),
    byIds<LabelSubject>('circles','id,name,slug,space_id,status,unlisted',circleIds).then(data=>({data})),
    byIds<CrossListingSpace>('spaces','id,name,slug,owner_profile_id,visibility,status,plan,parent_id,type',spaceIds).then(data=>({data})),
  ])
  type LabelSubject={id:string;title?:string;name?:string;slug:string;space_id:string;visibility?:string;status?:string;unlisted?:boolean}
  const labels=new Map([...(sharedJourneys.data ?? []),...(sharedCircles.data ?? [])].map(s=>[s.id,s as LabelSubject]))
  const relatedById=new Map(relatedSpaces.data.map(space=>[space.id,space]))
  const relatedParents=await byIds<CrossListingSpace>('spaces','id,plan,status,owner_profile_id,parent_id,type',[...new Set(relatedSpaces.data.flatMap(s=>s.parent_id?[s.parent_id]:[]))])
  const relatedParentById=new Map(relatedParents.map(s=>[s.id,s]))
  const eligibleSources=new Set(relatedSpaces.data.filter(source=>{
    const parent=source.parent_id?relatedParentById.get(source.parent_id):null
    return source.status==='active' && source.type!=='root' && source.visibility!=='private' &&
      ((source.parent_id===null && (source.plan==='collective' || source.plan==='nonprofit_collective')) ||
       parent?.type!=='root' && parent?.parent_id===null && parent?.status==='active' && parent.owner_profile_id===source.owner_profile_id &&
       (parent.plan==='collective' || parent.plan==='nonprofit_collective'))
  }).map(source=>source.id))
  const names=new Map(((relatedSpaces.data ?? []) as Array<{id:string;name:string|null;slug:string}>).map(s=>[s.id,s.name ?? s.slug]))
  const incomingSubjects=new Map((await Promise.all([
    acceptedCrossListingSubjects('journey',spaceId,true),
    acceptedCrossListingSubjects('circle',spaceId,true),
  ])).flat().map(subject=>[String(subject.id),subject as unknown as LabelSubject]))
  for(const row of rows){
    const subject=row.space_id===spaceId?incomingSubjects.get(row.subject_id):labels.get(row.subject_id)
    if(subject && subject.space_id===row.source_space_id && relatedById.get(row.source_space_id)?.owner_profile_id===row.requested_by && eligibleSources.has(row.source_space_id) && crossListingVisible(row.kind,subject)){row.label=subject.title ?? subject.name;row.subjectSlug=subject.slug}
    row.sourceName=eligibleSources.has(row.source_space_id) && relatedById.get(row.source_space_id)?.owner_profile_id===row.requested_by?names.get(row.source_space_id):undefined
    row.targetName=eligibleSources.has(row.space_id)?names.get(row.space_id):undefined
  }
  return { subjects:[...js.filter(j=>crossListingVisible('journey',j)).map(j=>({id:j.id,label:j.title,kind:'journey' as const})),...cs.filter(c=>!c.is_space_primary).map(c=>({id:c.id,label:c.name,kind:'circle' as const}))],rows,targets }
}
