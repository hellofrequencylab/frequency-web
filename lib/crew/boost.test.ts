import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-756: the Crew Boost. One a month (the unique key's duplicate refusal reads as `used`), Crew
// only (the real effective tier), never your own Circle or Space, and a Boost lasts 7 days. A Space
// Boost is a mark only (owner ruling 2026-10-06); lib/spaces/discovery.test.ts proves the directory
// order ignores it.

type Row = Record<string, unknown>
const H = vi.hoisted(() => ({
  profiles: [] as Row[],
  circles: [] as Row[],
  spaces: [] as Row[],
  boosts: [] as Row[],
  inserted: [] as Row[],
  insertError: null as { code?: string; message: string } | null,
  tier: 'crew' as 'crew' | 'free',
  operator: false,
  readCalls: [] as { col: string; ids: string[]; since: string }[],
}))

vi.mock('@/lib/billing/crew-grants', () => ({
  effectiveTierFor: async () => ({ stripeTier: H.tier, granted: false, tier: H.tier }),
  isSpaceOperator: async () => H.operator,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const source: Row[] =
        table === 'profiles' ? H.profiles : table === 'circles' ? H.circles : table === 'spaces' ? H.spaces : H.boosts
      let rows = [...source]
      let inCol = ''
      let inIds: string[] = []
      const api = {
        select: () => api,
        eq: (col: string, val: string) => {
          rows = rows.filter((r) => r[col] === val)
          return api
        },
        in: (col: string, ids: string[]) => {
          inCol = col
          inIds = ids
          rows = rows.filter((r) => ids.includes(String(r[col])))
          return api
        },
        gte: (col: string, val: string) => {
          H.readCalls.push({ col: inCol, ids: inIds, since: val })
          rows = rows.filter((r) => String(r[col]) >= val)
          return api
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        insert: async (row: Row) => {
          if (H.insertError) return { error: H.insertError }
          H.inserted.push(row)
          return { error: null }
        },
        then: (resolve: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows, error: null })),
      }
      return api
    },
  }),
}))

const { giveBoost, activeBoostIds } = await import('./boost')

const ME = 'p-me'
const NOW = new Date('2026-10-06T12:00:00Z')

beforeEach(() => {
  H.profiles = [{ id: ME, membership_tier: 'crew' }]
  H.circles = [
    { id: 'c-1', host_id: 'p-other', status: 'active', unlisted: false },
    { id: 'c-mine', host_id: ME, status: 'active', unlisted: false },
    { id: 'c-hidden', host_id: 'p-other', status: 'active', unlisted: true },
  ]
  H.spaces = [{ id: 's-1', status: 'active' }]
  H.boosts = []
  H.inserted = []
  H.insertError = null
  H.tier = 'crew'
  H.operator = false
  H.readCalls = []
})

describe('giveBoost', () => {
  it('writes one row for this calendar month, with exactly one target', async () => {
    expect(await giveBoost(ME, 'circle', 'c-1', NOW)).toEqual({ given: true })
    expect(H.inserted).toEqual([
      expect.objectContaining({ giver_profile_id: ME, target_kind: 'circle', circle_id: 'c-1', space_id: null, boost_month: '2026-10-01' }),
    ])
    expect(await giveBoost(ME, 'space', 's-1', NOW)).toEqual({ given: true })
    expect(H.inserted[1]).toEqual(expect.objectContaining({ target_kind: 'space', space_id: 's-1', circle_id: null }))
  })

  it('reads a second give in the same month as used (the unique key refuses it)', async () => {
    H.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "crew_boosts_one_a_month"' }
    expect(await giveBoost(ME, 'circle', 'c-1', NOW)).toEqual({ given: false, reason: 'used' })
  })

  it('refuses a member who is not on Crew', async () => {
    H.tier = 'free'
    expect(await giveBoost(ME, 'circle', 'c-1', NOW)).toEqual({ given: false, reason: 'not_crew' })
    expect(H.inserted).toHaveLength(0)
  })

  it('refuses your own Circle and your own Space', async () => {
    expect(await giveBoost(ME, 'circle', 'c-mine', NOW)).toEqual({ given: false, reason: 'own' })
    H.operator = true
    expect(await giveBoost(ME, 'space', 's-1', NOW)).toEqual({ given: false, reason: 'own' })
    expect(H.inserted).toHaveLength(0)
  })

  it('refuses an unlisted or missing target', async () => {
    expect(await giveBoost(ME, 'circle', 'c-hidden', NOW)).toEqual({ given: false, reason: 'not_found' })
    expect(await giveBoost(ME, 'space', 's-gone', NOW)).toEqual({ given: false, reason: 'not_found' })
  })

  it('throws on a real database error so the action can report it', async () => {
    H.insertError = { code: '42P01', message: 'relation does not exist' }
    await expect(giveBoost(ME, 'circle', 'c-1', NOW)).rejects.toThrow(/giveBoost/)
  })
})

describe('activeBoostIds', () => {
  it('reports only targets boosted inside the last 7 days', async () => {
    H.boosts = [
      { space_id: 's-new', given_at: '2026-10-01T00:00:00.000Z' },
      { space_id: 's-old', given_at: '2026-09-28T00:00:00.000Z' },
    ]
    const lifted = await activeBoostIds('space', ['s-new', 's-old', 's-none'], NOW)
    expect([...lifted]).toEqual(['s-new'])
    expect(H.readCalls[0]).toEqual({ col: 'space_id', ids: ['s-new', 's-old', 's-none'], since: '2026-09-29T12:00:00.000Z' })
  })

  it('reads nothing for no ids', async () => {
    expect((await activeBoostIds('circle', [], NOW)).size).toBe(0)
    expect(H.readCalls).toHaveLength(0)
  })
})
