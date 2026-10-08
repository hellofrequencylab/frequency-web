import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NetworkParent } from './network'
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, calls: [] as {table:string; filters: [string,unknown][]}[], error: false, failPage: false }))
vi.mock('server-only', () => ({}))
vi.mock('react', async original => ({...await original<typeof import('react')>(), cache: (fn: unknown) => fn}))
vi.mock('@/lib/spaces/store', () => ({loadRootSpaceId: () => {throw new Error('no ambient tenant')}}))
vi.mock('@/lib/supabase/admin', () => ({createAdminClient: () => ({from(table: string) {
  let rows = [...(state.tables[table] ?? [])]
  const call = {table, filters: [] as [string,unknown][]}; state.calls.push(call)
  const ordering: string[] = []; let first = 0; let last = 999
  const query = {
    select: () => query,
    eq: (key:string,value:unknown) => {call.filters.push([key,value]); rows=rows.filter(row=>row[key]===value); return query},
    neq: (key:string,value:unknown) => {rows=rows.filter(row=>row[key]!==value); return query},
    in: (key:string,values:unknown[]) => {rows=rows.filter(row=>values.includes(row[key])); return query},
    is: (key:string,value:unknown) => {rows=rows.filter(row=>row[key]===value); return query},
    gte: (key:string,value:string) => {rows=rows.filter(row=>String(row[key])>=value); return query},
    lt: (key:string,value:string) => {rows=rows.filter(row=>String(row[key])<value); return query},
    order: (key:string) => {ordering.push(key); return query}, limit: (n:number) => {last=n-1; return query},
    range: (start:number,end:number) => {first=start;last=end;return query},
    then: (resolve:(value:unknown)=>unknown) => Promise.resolve({data:rows.sort((a,b)=>{for(const key of ordering){const compared=String(a[key]??'').localeCompare(String(b[key]??''));if(compared)return compared}return 0}).slice(first,last+1),error:state.error || (state.failPage && table==='events' && first>=500)?new Error('unavailable'):null}).then(resolve),
  }; return query
}})}))
// Only display formatting is replaced. The tenant/hosting/share reader and all its visibility gates are real.
vi.mock('@/lib/calendar/public-month', () => ({spaceEventRowsToItems: async (rows: Record<string,unknown>[]) => rows.map(row=>({slug:row.slug,title:row.title,dayKey:String(row.starts_at).slice(0,10),isCancelled:!!row.is_cancelled,layer:'events'}))}))
const { loadCollectiveNetworkWindow, listPublicCollectiveMembers } = await import('./network-store')
const parent: NetworkParent = {id:'parent',slug:'network',status:'active',plan:'collective',networkConnected:true,ownerProfileId:'owner'}
const child = {id:'child',slug:'child',name:'Child',brand_name:null,brand_logo_url:null,parent_id:'parent',owner_profile_id:'owner',status:'active',visibility:'network',network_connected:true,type:'community'}
const event = (id:string,space_id:string,changes:Record<string,unknown>={}) => ({id,slug:id,title:id,space_id,host_space_id:null,status:'published',visibility:'public',removed_at:null,is_demo:false,starts_at:'2026-10-10T19:00:00Z',is_cancelled:false,...changes})
beforeEach(()=>{state.tables={spaces:[{...child}],events:[],event_space_shares:[]};state.calls=[];state.error=false;state.failPage=false})
describe('Collective calendar composes the real public event reader',()=>{
  it('never reads owned feeds for private, suspended, disconnected or cross-tenant children',async()=>{
    state.tables.spaces.push(...[{visibility:'private'},{status:'suspended'},{network_connected:false},{owner_profile_id:'other'},{parent_id:'other'}].map((change,i)=>({...child,id:`unsafe${i}`,slug:`unsafe${i}`,...change})))
    state.tables.events=[event('child-public','child'),...state.tables.spaces.slice(1).map(row=>event(`secret-${row.id}`,String(row.id)))]
    expect((await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).map(row=>row.slug)).toEqual(['child-public'])
    const requested=state.calls.filter(call=>call.table==='events').flatMap(call=>call.filters.filter(([key])=>key==='space_id').map(([,id])=>id))
    expect(requested).toEqual(['parent','child'])
  })
  it('filters event visibility in owned and accepted-share branches, dedupes a shared event, and preserves cancellations only as context',async()=>{
    state.tables.events=[event('live','child'),event('cancelled','child',{is_cancelled:true}),event('private','child',{visibility:'private'}),event('draft','child',{status:'draft'}),event('demo','child',{is_demo:true}),event('removed','child',{removed_at:'2026-10-01'}),event('outside','child',{starts_at:'2026-11-10T19:00:00Z'}),event('private-home','secret')]
    state.tables.spaces.push({...child,id:'secret',visibility:'private'})
    state.tables.event_space_shares=[{event_id:'live',space_id:'parent',status:'accepted'},{event_id:'private',space_id:'parent',status:'accepted'},{event_id:'private-home',space_id:'parent',status:'accepted'}]
    const result=await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')
    expect(result.map(row=>row.slug)).toEqual(['cancelled','live'])
    expect(result.find(row=>row.slug==='live')?.sourceLabel).toBe('Parent · Child')
    expect(result.find(row=>row.slug==='cancelled')?.isCancelled).toBe(true)
  })
  it('rechecks child eligibility when reading another month',async()=>{
    state.tables.events=[event('live','child')]
    expect(await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).toHaveLength(1)
    state.tables.spaces[0].visibility='private'
    expect(await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).toEqual([])
  })
  it('fails honestly on a directory error, and does no reads for a downgraded parent',async()=>{
    state.error=true
    await expect(listPublicCollectiveMembers(parent)).rejects.toThrow('directory')
    state.calls=[]
    expect(await loadCollectiveNetworkWindow({...parent,plan:'free'},'Parent','2026-10-01','2026-11-01')).toEqual([])
    expect(state.calls).toEqual([])
  })
})


describe('Collective month reads exhaust the bounded window', () => {
  it('includes more than300 and more than the response ceiling even when timestamps tie', async () => {
    state.tables.events = Array.from({length:1201}, (_,i)=>event(`event-${String(i).padStart(4,'0')}`,'child'))
    state.tables.events.push(event('later','child',{starts_at:'2026-11-01T00:00:00Z'}))
    const result = await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')
    expect(result).toHaveLength(1201)
    expect(result.at(-1)?.slug).toBe('event-1200')
    expect(new Set(result.map(row=>row.slug)).size).toBe(1201)
  })
  it('pages accepted shares and safely batches all away-home eligibility IDs', async () => {
    const homes=Array.from({length:1201},(_,i)=>`home-${String(i).padStart(4,'0')}`)
    state.tables.spaces.push(...homes.map(id=>({...child,id,parent_id:'unrelated',slug:id})))
    state.tables.events=homes.map((home,i)=>event(`shared-${String(i).padStart(4,'0')}`,home))
    state.tables.event_space_shares=state.tables.events.map(row=>({event_id:row.id,space_id:'parent',status:'accepted'}))
    expect(await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).toHaveLength(1201)
  })
  it('pages the member directory without admitting private or cross-owner rows', async () => {
    state.tables.spaces=Array.from({length:1201},(_,i)=>({...child,id:`child-${String(i).padStart(4,'0')}`,slug:`child-${i}`,name:'Same name'}))
    state.tables.spaces.push({...child,id:'private-last',visibility:'private'}, {...child,id:'other-owner',owner_profile_id:'elsewhere'})
    const members=await listPublicCollectiveMembers(parent)
    expect(members).toHaveLength(1201)
    expect(members.at(-1)?.id).toBe('child-1200')
  })
  it('refuses unbounded exhaustive requests', async () => {
    const {listSpaceCalendarEvents}=await import('@/lib/events/store')
    await expect(listSpaceCalendarEvents('child',{exhaustive:true,fromDay:'2026-10-01'})).rejects.toThrow('Invalid calendar window')
  })
})

it('propagates a later calendar-page failure instead of presenting an incomplete month', async () => {
  state.tables.events=Array.from({length:501},(_,i)=>event(`event-${i}`,'child'))
  state.failPage=true
  await expect(loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')).rejects.toThrow('unavailable')
})

it('keeps the final day late timestamp and excludes600 following-month events at the database boundary', async () => {
  state.tables.events=[event('last-day','child',{starts_at:'2026-10-31T23:59:59.999Z'}),...Array.from({length:600},(_,i)=>event(`future-${i}`,'child',{starts_at:'2026-11-01T00:00:00Z'}))]
  const result=await loadCollectiveNetworkWindow(parent,'Parent','2026-10-01','2026-11-01')
  expect(result.map(row=>row.slug)).toEqual(['last-day'])
})
