import { describe, it, expect, vi, beforeEach } from 'vitest'

// Co-hosted Journeys (journey_plan_space_shares). Locks the reader contract:
//   1. An ACCEPTED share lists the Journey on the co-host Space, de-duplicated, newest first.
//   2. The share is necessary, never sufficient: a private shared Journey never surfaces.
//   3. FAIL-SAFE: a failed share read returns only the Space's own Journeys.
//   4. includeShared: false (the owner's builder list) skips shares entirely.

const HOME = 'aaaaaaaa-0000-4000-a000-00000000000a'
const COHOST = 'bbbbbbbb-0000-4000-a000-00000000000b'

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const errors: Record<string, unknown> = {}
const fromCalls: string[] = []

function builder(table: string) {
  const preds: Array<(r: Row) => boolean> = []
  let cap = Infinity
  let offset=0
  let desc: string | null = null
  let asc: string | null = null
  const run = async () => {
    if (errors[table]) return { data: null, error: errors[table] }
    let rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)))
    if (desc) rows = [...rows].sort((a, b) => String(b[desc!]).localeCompare(String(a[desc!])))
    if (asc) rows = [...rows].sort((a, b) => String(a[asc!]).localeCompare(String(b[asc!])))
    return { data: rows.slice(offset, offset+cap), error: null }
  }
  const api: Record<string, unknown> = {
    select: () => api,
    eq(col: string, val: unknown) {
      preds.push((r) => r[col] === val)
      return api
    },
    neq(col: string, val: unknown) {
      preds.push((r) => r[col] !== val)
      return api
    },
    in(col: string, vals: unknown[]) {
      preds.push((r) => vals.includes(r[col]))
      return api
    },
    order(col: string, o: { ascending: boolean }) {
      if (o.ascending) asc = col
      else desc = col
      return api
    },
    range(first:number,last:number) { offset=first;cap=last-first+1;return api },
    limit(n: number) {
      cap = n
      return run()
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return run().then(resolve, reject)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      fromCalls.push(t)
      return builder(t)
    },
  }),
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => HOME }))
vi.mock('@/lib/practices', () => ({ adoptPractice: async () => {} }))

import { listJourneyCoHostSpaces, listJourneyPlansForSpace } from './journey-plans'

const plan = (id: string, space_id: string, created_at: string, visibility = 'public') => ({
  id,
  space_id,
  created_at,
  visibility,
  title: id,
})

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  for (const k of Object.keys(errors)) delete errors[k]
  fromCalls.length = 0
})

describe('listJourneyPlansForSpace with co-host shares', () => {
  it('lists an accepted-shared Journey on the co-host Space, newest first', async () => {
    tables.journey_plans = [
      plan('own-old', COHOST, '2026-01-01'),
      plan('intro', HOME, '2026-05-01'),
      plan('own-new', COHOST, '2026-09-01'),
    ]
    tables.journey_plan_space_shares = [{ plan_id: 'intro', space_id: COHOST, status: 'accepted' }]
    const rows = await listJourneyPlansForSpace(COHOST, 50, { publishedOnly: true })
    expect(rows.map((r) => r.id)).toEqual(['own-new', 'intro', 'own-old'])
  })

  it('ignores pending, declined and revoked shares', async () => {
    tables.journey_plans = [plan('intro', HOME, '2026-05-01')]
    tables.journey_plan_space_shares = [
      { plan_id: 'intro', space_id: COHOST, status: 'pending' },
      { plan_id: 'intro', space_id: COHOST, status: 'declined' },
      { plan_id: 'intro', space_id: COHOST, status: 'revoked' },
    ]
    expect(await listJourneyPlansForSpace(COHOST, 50, { publishedOnly: true })).toEqual([])
  })

  it('never surfaces a private Journey through a share, even without publishedOnly', async () => {
    tables.journey_plans = [plan('draft', HOME, '2026-05-01', 'private')]
    tables.journey_plan_space_shares = [{ plan_id: 'draft', space_id: COHOST, status: 'accepted' }]
    expect(await listJourneyPlansForSpace(COHOST, 50, { publishedOnly: true })).toEqual([])
    expect(await listJourneyPlansForSpace(COHOST, 50)).toEqual([])
  })

  it('de-duplicates a Journey that is both owned and shared to the same Space', async () => {
    tables.journey_plans = [plan('j1', COHOST, '2026-05-01')]
    tables.journey_plan_space_shares = [{ plan_id: 'j1', space_id: COHOST, status: 'accepted' }]
    expect((await listJourneyPlansForSpace(COHOST)).map((r) => r.id)).toEqual(['j1'])
  })

  it('FAIL-SAFE: a failed share read returns only the own Journeys', async () => {
    tables.journey_plans = [plan('own', COHOST, '2026-01-01'), plan('intro', HOME, '2026-05-01')]
    tables.journey_plan_space_shares = [{ plan_id: 'intro', space_id: COHOST, status: 'accepted' }]
    errors.journey_plan_space_shares = { message: 'relation does not exist' }
    expect((await listJourneyPlansForSpace(COHOST)).map((r) => r.id)).toEqual(['own'])
  })

  it('includeShared: false never reads shares (the owner builder list)', async () => {
    tables.journey_plans = [plan('intro', HOME, '2026-05-01')]
    tables.journey_plan_space_shares = [{ plan_id: 'intro', space_id: COHOST, status: 'accepted' }]
    expect(await listJourneyPlansForSpace(COHOST, 50, { includeShared: false })).toEqual([])
    expect(fromCalls).not.toContain('journey_plan_space_shares')
  })

  it('does not change the home Space listing', async () => {
    tables.journey_plans = [plan('intro', HOME, '2026-05-01')]
    tables.journey_plan_space_shares = [{ plan_id: 'intro', space_id: COHOST, status: 'accepted' }]
    expect((await listJourneyPlansForSpace(HOME)).map((r) => r.id)).toEqual(['intro'])
  })
})

describe('listJourneyCoHostSpaces', () => {
  it('credits the accepted co-host Space by its brand name', async () => {
    tables.journey_plan_space_shares = [
      { plan_id: 'intro', space_id: COHOST, status: 'accepted', created_at: '2026-10-01' },
    ]
    tables.spaces = [
      { id: COHOST, slug: 'danieltyack', name: 'Daniel', brand_name: 'Daniel Tyack', status: 'active', visibility: 'network' },
    ]
    expect(await listJourneyCoHostSpaces('intro', HOME)).toEqual([
      { id: COHOST, slug: 'danieltyack', name: 'Daniel Tyack' },
    ])
  })

  it('FAIL-SAFE: [] when the share read fails', async () => {
    errors.journey_plan_space_shares = { message: 'boom' }
    expect(await listJourneyCoHostSpaces('intro', HOME)).toEqual([])
  })
})

it('exhausts 1201 co-host consent rows and batches shared subject reads past the REST ceiling',async()=>{
  tables.journey_plan_space_shares=Array.from({length:1201},(_,i)=>({id:String(i).padStart(4,'0'),plan_id:`shared-${i}`,space_id:COHOST,status:'accepted'}))
  tables.journey_plans=Array.from({length:1201},(_,i)=>plan(`shared-${i}`,HOME,'2026-05-01'))
  expect(await listJourneyPlansForSpace(COHOST,1300,{publishedOnly:true})).toHaveLength(1201)
})
