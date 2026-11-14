import { beforeEach, describe, expect, it, vi } from 'vitest'
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']
const state = vi.hoisted(() => ({ practices: [] as Array<Record<string, unknown>>, read: vi.fn(), tables: [] as string[] }))
vi.mock('@/lib/practices', () => ({ getMemberPractices: async (profileId: string) => { state.read(profileId); return state.practices } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  state.tables.push(table)
  const q = { select: () => q, eq: () => q, order: async () => ({ data: ids.map((id,i) => ({id,slug:['mind','body','spirit','expression'][i],name:['Mind','Body','Spirit','Expression'][i],display_order:i})), error:null }) }
  return q
} }) }))
import { getMemberPillarBalance } from './pillars'
const details = (...keys: string[]) => Object.fromEntries(keys.map(key => [key,{instructions:'',timing:''}]))
beforeEach(() => { vi.clearAllMocks();state.practices=[];state.tables.length=0 })

describe('current adopted support coverage', () => {
  it('counts a single practice under primary, secondary, third and fourth authored supports', async () => {
    state.practices=[{id:'practice',domain_id:ids[0],secondary_domain_id:ids[1],focus_details:details(...ids)}]
    const result=await getMemberPillarBalance('member')
    expect(result.map(p=>p.count)).toEqual([1,1,1,1])
    expect(result.map(p=>p.slug)).toEqual(['mind','body','spirit','expression'])
    expect(state.read).toHaveBeenCalledExactlyOnceWith('member')
    expect(state.tables).toEqual(['pillars'])
  })
  it('deduplicates repeated memberships and repeated support references', async () => {
    const practice={id:'same',domain_id:ids[0],secondary_domain_id:ids[0],focus_details:details(ids[0],ids[1])}
    state.practices=[practice,practice,{...practice,focus_details:details(ids[1],ids[2])}]
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([1,1,1,0])
  })
  it('counts two distinct adopted practices independently even when their support overlaps', async () => {
    state.practices=[{id:'first',domain_id:ids[0],focus_details:details(ids[1])},{id:'second',domain_id:ids[1],focus_details:details(ids[0])}]
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([2,2,0,0])
  })
  it('retains legacy primary-only counts and zero-fills known supports', async () => {
    state.practices=[{id:'old',domain_id:ids[1]}]
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([0,1,0,0])
    state.practices=[]
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([0,0,0,0])
  })
  it('ignores malformed or inactive supports instead of inventing categories', async () => {
    state.practices=[{id:'invalid',domain_id:null,secondary_domain_id:'not-a-pillar',focus_details:{__proto__:{instructions:'bad'},[ids[0]]:'invalid',[ids[1]]:null,'55555555-5555-4555-8555-555555555555':{instructions:'inactive'}}}]
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([0,0,0,0])
  })
  it('does not convert reward allocations or historical log fields into current support weights', async () => {
    state.practices=[{id:'practice',domain_id:ids[0],secondary_domain_id:ids[1],primary_pct:100,reward_zaps:50,pillar_id:ids[3],focus_details:details(ids[2])}]
    const before=structuredClone(state.practices)
    expect((await getMemberPillarBalance('member')).map(p=>p.count)).toEqual([1,1,1,0])
    expect(state.practices).toEqual(before)
  })
})
