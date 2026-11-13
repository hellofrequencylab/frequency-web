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
  // c-joined is a Circle the member only joined; it must not reach the rail (owner ruling 2026-11-13).
  memberships: [
    { circle_id: 'c-own', volunteer_role: 'host' },
    { circle_id: 'c-seed', volunteer_role: 'host' },
    { circle_id: 'c-free', volunteer_role: 'host' },
    { circle_id: 'c-joined', volunteer_role: null },
  ],
  circles: [
    { id: 'c-own', name: 'My Circle', slug: 'my-circle', space_id: 'sp-own', image_url: '/img/my-circle.jpg' },
    { id: 'c-seed', name: 'Seeded Circle', slug: 'seeded-circle', space_id: 'sp-seed' },
    { id: 'c-free', name: 'Free Circle', slug: 'free-circle', space_id: null },
    { id: 'c-joined', name: 'Joined Circle', slug: 'joined-circle', space_id: null },
  ],
}

function query(rows: unknown[]) {
  let out = rows
  const result = { then: (f: (v: unknown) => unknown) => Promise.resolve({ data: out, error: null }).then(f) }
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'is', 'gte', 'order', 'limit']) chain[k] = () => chain
  // Honour `.in('id', ids)` and `.eq('host_id', …)` so the rail's two host reads behave like the real tables.
  chain.in = (col: string, vals: string[]) => {
    out = out.filter((r) => vals.includes((r as Record<string, string>)[col]))
    return chain
  }
  chain.eq = (col: string) => {
    if (col === 'host_id') out = []
    return chain
  }
  chain.then = result.then
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

// LIVE-1013: the rail draws each Circle with its own picture, so the menu carries it (null when none).
describe('getMyFrequency carries each Circle picture', () => {
  it('passes the image through and leaves a Circle without one null', async () => {
    const menu = await getMyFrequency('seeder', 'ada')
    const byHref = Object.fromEntries(menu.circles.map((c) => [c.href, c.image]))
    expect(byHref['/circles/my-circle']).toBe('/img/my-circle.jpg')
    expect(byHref['/circles/free-circle']).toBeNull()
  })
})
