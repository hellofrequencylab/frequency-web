import { describe, it, expect, vi } from 'vitest'

// ── SEEDED SPACES STAY OFF THE SEEDER'S MENU (owner ruling 2026-10-06) ──────────────────
//
// An operator who seeds a business owns its Space (and hosts its Circle) until the real owner
// claims it. Those placeholders stay linked to the operator but must not crowd the left menu.
// Proves both halves: the seeded Space row and its Circle row drop out, everything else stays.

vi.mock('@/lib/ai/vera/create-entity', () => ({ countMyCreateProposals: async () => 0 }))
vi.mock('@/lib/spaces/operated', () => ({
  listOperatedSpaces: async () => [
    { id: 'sp-own', name: 'My Space', slug: 'mine' },
    { id: 'sp-seed', name: 'Seeded Biz', slug: 'seeded-biz' },
  ],
}))
vi.mock('@/lib/spaces/claim', () => ({
  listUnclaimedSeededSpaceIds: async (ids: string[]) =>
    new Set(ids.filter((id) => id === 'sp-seed')),
}))

const tables: Record<string, unknown[]> = {
  notifications: [],
  memberships: [{ circle_id: 'c-own' }, { circle_id: 'c-seed' }, { circle_id: 'c-free' }],
  circles: [
    { id: 'c-own', name: 'My Circle', slug: 'my-circle', space_id: 'sp-own' },
    { id: 'c-seed', name: 'Seeded Circle', slug: 'seeded-circle', space_id: 'sp-seed' },
    { id: 'c-free', name: 'Free Circle', slug: 'free-circle', space_id: null },
  ],
}

function query(rows: unknown[]) {
  const result = Promise.resolve({ data: rows, error: null })
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'is', 'in', 'gte', 'order', 'limit']) chain[k] = () => chain
  chain.then = result.then.bind(result)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (t: string) => query(tables[t] ?? []) }),
}))

const { getMyFrequency } = await import('./my-frequency')

describe('getMyFrequency hides unclaimed seeded Spaces', () => {
  it('drops the seeded Space and its Circle, keeps the rest', async () => {
    const menu = await getMyFrequency('seeder', 'ada')
    expect(menu.spaces.map((s) => s.href)).toEqual(['/spaces/mine'])
    expect(menu.circles.map((c) => c.href).sort()).toEqual(['/circles/free-circle', '/circles/my-circle'])
  })
})
