import { describe, it, expect, vi } from 'vitest'

type Result = { data?: unknown; count?: number | null; error?: unknown }
const tables: Record<string, Result> = {}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const chain: Record<string, unknown> = {}
      const result = () => Promise.resolve(tables[t] ?? { data: null, count: 0, error: null })
      for (const m of ['select', 'eq', 'is', 'or']) chain[m] = () => chain
      chain.maybeSingle = result
      chain.then = (ok: (v: Result) => unknown, bad?: (e: unknown) => unknown) => result().then(ok, bad)
      return chain
    },
  }),
}))
vi.mock('@/lib/billing/connect', () => ({ getConnectStatus: async () => ({ ready: true }) }))

import { loadLaunchRows } from './rows'

describe('loadLaunchRows', () => {
  it('reads the Space and counts its things, and reads a missing Space as none', async () => {
    tables.spaces = { data: { preferences: { websitePublished: true }, tagline: 't', about: 'a' } }
    tables.events = { count: 2 }
    tables.circles = { count: 1 }
    tables.journey_plans = { count: 0 }
    tables.contacts = { error: { message: 'boom' }, count: null }
    const rows = await loadLaunchRows('s1', 'p1')
    expect(rows).toMatchObject({ tagline: 't', eventCount: 2, circleCount: 1, journeyCount: 0, contactCount: 0, payoutsReady: true })
    tables.spaces = { data: null }
    expect(await loadLaunchRows('s2', 'p1')).toBeNull()
  })
})
