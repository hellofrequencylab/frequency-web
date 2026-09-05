import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-09-05 (scan2 L3-07). The four marketplace area switches used to fail OPEN on a read error:
// a platform_flags outage published an area an operator had un-published. A missing row is still
// "published" (the marketplace is live, absence = visible); an ERROR is now "hidden" for every
// area, the direction the other operator switches in lib/platform-flags.ts already take.
//
// The read is mocked at the admin-client boundary. `store.error` simulates the supabase-js shape
// (it resolves `{ error }` and never throws); `store.throws` simulates the client itself failing.

const store: { rows: { key: string; value: boolean }[]; error: { message: string } | null; throws: boolean } = {
  rows: [],
  error: null,
  throws: false,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => {
          if (store.throws) throw new Error('platform_flags unreachable')
          return { data: store.error ? null : store.rows, error: store.error }
        },
      }),
    }),
  }),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => null }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => null }))
vi.mock('@/lib/core/roles', () => ({ isStaff: () => false }))
vi.mock('@/lib/core/staff-roles', () => ({ staffCan: () => false }))

const { marketplaceVisibility, MARKET_AREAS } = await import('./visibility')

beforeEach(() => {
  store.rows = []
  store.error = null
  store.throws = false
})

describe('marketplaceVisibility', () => {
  it('reads a missing row as PUBLISHED (the marketplace is live; absence is visible)', async () => {
    const out = await marketplaceVisibility()
    for (const area of MARKET_AREAS) expect(out[area]).toBe(true)
  })

  it('honours a stored value per area', async () => {
    store.rows = [
      { key: 'marketplace_housing_published', value: false },
      { key: 'marketplace_shop_published', value: true },
    ]
    const out = await marketplaceVisibility()
    expect(out.housing).toBe(false)
    expect(out.shop).toBe(true)
    expect(out.market).toBe(true)
    expect(out.makers).toBe(true)
  })

  it('reads a supabase-js `{ error }` as HIDDEN for every area (fail-closed)', async () => {
    store.error = { message: 'connection refused' }
    const out = await marketplaceVisibility()
    for (const area of MARKET_AREAS) expect(out[area]).toBe(false)
  })

  it('reads a thrown client error as HIDDEN for every area (fail-closed)', async () => {
    store.throws = true
    const out = await marketplaceVisibility()
    for (const area of MARKET_AREAS) expect(out[area]).toBe(false)
  })
})
