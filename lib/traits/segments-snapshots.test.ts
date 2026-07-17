import { describe, it, expect, vi } from 'vitest'

// loadMemberSnapshots must exclude DEMO + SYSTEM profiles (the same filter loadMemberDirectory
// applies), so seeded demo/system rows that carry tags/traits never inflate segment counts or get
// targeted by resolveSegmentProfileIds → activation + campaign sends. Network-free: the admin client
// is mocked over in-memory member_tags / member_traits / profiles tables.

const tagRows = [
  { profile_id: 'p-real', tag_key: 'web_beta', expires_at: null },
  { profile_id: 'p-demo', tag_key: 'web_beta', expires_at: null },
  { profile_id: 'p-system', tag_key: 'founder', expires_at: null },
]
const traitRows = [
  { profile_id: 'p-real', trait_key: 'rfm_score', value_num: 52, value_text: null, value_bool: null },
  { profile_id: 'p-demo', trait_key: 'rfm_score', value_num: 99, value_text: null, value_bool: null },
]
// profiles.select('id').eq('is_demo', false).eq('is_system', false) — the query already filters, so the
// mock returns ONLY the real profile (p-demo / p-system are excluded by the DB).
const realProfiles = [{ id: 'p-real' }]

function tableBuilder(rows: unknown[]) {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    then(resolve: (r: { data: unknown[]; error: null }) => void) {
      resolve({ data: rows, error: null })
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'member_tags') return tableBuilder(tagRows)
      if (table === 'member_traits') return tableBuilder(traitRows)
      if (table === 'profiles') return tableBuilder(realProfiles)
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
