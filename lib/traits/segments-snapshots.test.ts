import { describe, it, expect, vi } from 'vitest'

// loadMemberSnapshots must exclude DEMO + SYSTEM profiles (the same filter loadMemberDirectory
// applies), so seeded demo/system rows that carry tags/traits never inflate segment counts or get
// targeted by resolveSegmentProfileIds → activation + campaign sends. Network-free: the admin client
// is mocked over in-memory member_tags / member_traits / profiles tables. The mock honours `.range()`
// and caps an unranged read at 1000 rows, the way PostgREST's max_rows does (HYG-249).

let tagRows: unknown[] = [
  { profile_id: 'p-real', tag_key: 'web_beta', expires_at: null },
  { profile_id: 'p-demo', tag_key: 'web_beta', expires_at: null },
  { profile_id: 'p-system', tag_key: 'founder', expires_at: null },
]
let traitRows: unknown[] = [
  { profile_id: 'p-real', trait_key: 'rfm_score', value_num: 52, value_text: null, value_bool: null },
  { profile_id: 'p-demo', trait_key: 'rfm_score', value_num: 99, value_text: null, value_bool: null },
]
// profiles.select('id').eq('is_demo', false).eq('is_system', false) — the query already filters, so the
// mock returns ONLY the real profile (p-demo / p-system are excluded by the DB).
let realProfiles: unknown[] = [{ id: 'p-real' }]
let failTable: string | null = null
const MAX_ROWS = 1000


function tableBuilder(table: string, rows: unknown[]) {
  let window: [number, number] | null = null
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    order() {
      return api
    },
    range(from: number, to: number) {
      window = [from, to]
      return api
    },
    then(resolve: (r: { data: unknown[] | null; error: { message: string } | null }) => void) {
      if (failTable === table) return resolve({ data: null, error: { message: 'statement timeout' } })
      const [from, to] = window ?? [0, MAX_ROWS - 1]
      resolve({ data: rows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'member_tags') return tableBuilder(table, tagRows)
      if (table === 'member_traits') return tableBuilder(table, traitRows)
      if (table === 'profiles') return tableBuilder(table, realProfiles)
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { loadMemberSnapshots } from './segments'

describe('loadMemberSnapshots — demo/system exclusion', () => {
  it('keeps only real members; demo + system profiles are dropped', async () => {
    const snaps = await loadMemberSnapshots()
    expect(snaps.map((s) => s.profileId).sort()).toEqual(['p-real'])
    const real = snaps.find((s) => s.profileId === 'p-real')!
    expect(real.tags.has('web_beta')).toBe(true)
    expect(real.traits.get('rfm_score')).toBe(52)
  })
})

describe('loadMemberSnapshots — paging past the 1,000-row cap (HYG-249)', () => {
  it('reads every member_traits row, not just the first 1,000', async () => {
    const ids = Array.from({ length: 1718 }, (_, i) => `p-${String(i).padStart(4, '0')}`)
    realProfiles = ids.map((id) => ({ id }))
    traitRows = ids.map((id, i) => ({ profile_id: id, trait_key: 'rfm_score', value_num: i, value_text: null, value_bool: null }))
    tagRows = []
    const snaps = await loadMemberSnapshots()
    expect(snaps).toHaveLength(1718)
    expect(snaps.find((s) => s.profileId === 'p-1717')!.traits.get('rfm_score')).toBe(1717)
  })

  it('throws on a read error instead of returning an empty or partial snapshot', async () => {
    failTable = 'member_traits'
    await expect(loadMemberSnapshots()).rejects.toThrow(/member_traits/)
    failTable = null
  })
})
