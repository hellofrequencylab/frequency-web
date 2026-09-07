import { describe, it, expect, beforeEach, vi } from 'vitest'

// HYG-064 — THE NEXUS MANAGE CONSOLE MUST NOT LIST OR COUNT ARCHIVED HUBS.
//
// `archiveHub` documents its own purpose as setting status to 'archived' "so it drops out of
// listings". HYG-046 made that true on the PUBLIC Nexus detail page and found it still false one
// layer down: the Hub manage console has excluded archived CHILDREN since it was written, and its
// Nexus twin never did. So a Nexus operator saw archived Hubs in the only listing of Hubs the
// console has, and their circles' members were summed into the People header AND into all four
// Insight numbers — `hubCount` listed them, `totalMembers` summed them, `avgPerHub` divided by the
// inflated count.
//
// These tests drive the REAL loaders against a mocked database whose builder APPLIES the filters
// the code actually asked for. That is the point: a test that just asserts `.neq` was called
// measures the shape of the call. This one measures the consequence — whether the archived Hub is
// in the rows the operator sees and in the numbers the operator reads.

interface HubRow {
  id: string
  name: string
  slug: string
  status: string
  nexus_id: string
  guide: { display_name: string | null } | null
  circles: { member_count: number | null }[]
}

const NEXUS = { id: 'n1', slug: 'north', member_cap: 500, mentor: { display_name: 'Ada', handle: 'ada' } }

let hubs: HubRow[]

function table(name: string) {
  const eqs: [string, unknown][] = []
  const neqs: [string, unknown][] = []
  const api: Record<string, unknown> = {
    select: () => api,
    order: () => rows(),
    eq(col: string, val: unknown) {
      eqs.push([col, val])
      return api
    },
    neq(col: string, val: unknown) {
      neqs.push([col, val])
      return api
    },
    async maybeSingle() {
      return { data: name === 'nexuses' ? { ...NEXUS } : null, error: null }
    },
    // A hubs read with no .order() terminates on the builder itself.
    then(res: (v: { data: unknown; error: null }) => void) {
      res(rows())
    },
  }
  function rows() {
    if (name !== 'hubs') return { data: [], error: null }
    let out = hubs
    for (const [col, val] of eqs) out = out.filter((h) => (h as unknown as Record<string, unknown>)[col] === val)
    for (const [col, val] of neqs) out = out.filter((h) => (h as unknown as Record<string, unknown>)[col] !== val)
    return { data: out, error: null }
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (n: string) => table(n) }) }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getNexusCapabilities: async () => new Set(['nexus.manage']),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const { getNexusPeopleData, getNexusInsightsData } = await import('@/app/(main)/nexuses/admin-actions')

beforeEach(() => {
  hubs = [
    {
      id: 'h1',
      name: 'Running',
      slug: 'running',
      status: 'active',
      nexus_id: 'n1',
      guide: { display_name: 'Bo' },
      circles: [{ member_count: 10 }, { member_count: 20 }],
    },
    {
      id: 'h2',
      name: 'Retired',
      slug: 'retired',
      status: 'archived',
      nexus_id: 'n1',
      guide: { display_name: 'Cy' },
      circles: [{ member_count: 400 }],
    },
  ]
})

describe('the Nexus manage console excludes archived Hubs (HYG-064)', () => {
  it('keeps the archived Hub out of the People listing', async () => {
    const data = await getNexusPeopleData('north')
    expect(data?.hubs.map((h) => h.slug)).toEqual(['running'])
  })

  it('keeps the archived Hub out of the People header counts', async () => {
    const data = await getNexusPeopleData('north')
    expect(data?.hubCount).toBe(1)
    // 30, not 430: the archived Hub's 400 members are not this Nexus's reach any more.
    expect(data?.totalMembers).toBe(30)
  })

  it('keeps the archived Hub out of all four Insight numbers', async () => {
    const data = await getNexusInsightsData('north')
    expect(data?.hubCount).toBe(1)
    expect(data?.totalMembers).toBe(30)
    expect(data?.avgPerHub).toBe(30)
    expect(data?.memberCap).toBe(500)
  })

  it('still shows an active Hub — the filter excludes archived, not everything (control)', async () => {
    hubs = hubs.map((h) => ({ ...h, status: 'active' }))
    const people = await getNexusPeopleData('north')
    const insights = await getNexusInsightsData('north')
    expect(people?.hubCount).toBe(2)
    expect(people?.totalMembers).toBe(430)
    expect(insights?.hubCount).toBe(2)
    expect(insights?.avgPerHub).toBe(215)
  })

  it('reports zero rather than dividing by zero when every Hub is archived', async () => {
    hubs = hubs.map((h) => ({ ...h, status: 'archived' }))
    const insights = await getNexusInsightsData('north')
    expect(insights).toEqual({ totalMembers: 0, memberCap: 500, hubCount: 0, avgPerHub: 0 })
  })
})
