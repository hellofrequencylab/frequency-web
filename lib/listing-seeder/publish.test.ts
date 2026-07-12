import { describe, it, expect, beforeEach, vi } from 'vitest'

// PUBLISH — the seeder materialize path (Wave 2). Two things are locked here, network-free:
//   1. The dollars→cents mapping (rent/deposit ×100, rounded) — the PURE helper the housing
//      write depends on, so a $1,800/mo rent lands as 180000 cents, never 1800.
//   2. The FAIL-SAFE: a publish that cannot resolve the Frequency seed owner flips the intake
//      to `failed` (stamping the error) and returns a typed failure — it never throws. And a
//      guard rejects an intake that isn't in `review` without issuing any write.
//
// The admin client is mocked the way sibling lib tests do (a chainable recorder). No network,
// no Supabase — resolveSeedOwnerProfileId + the intake reads/writes all run against the mock.

const h = vi.hoisted(() => ({
  state: {
    intake: null as Record<string, unknown> | null,
    seedOwner: null as string | null,
    updates: [] as Record<string, unknown>[],
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'profiles') {
        // resolveSeedOwnerProfileId: .select('id').eq().eq().limit().maybeSingle()
        const api = {
          select: () => api,
          eq: () => api,
          limit: () => api,
          maybeSingle: async () => ({
            data: h.state.seedOwner ? { id: h.state.seedOwner } : null,
            error: null,
          }),
        }
        return api
      }
      // listing_intake: either a select-chain (…maybeSingle) or an update-chain (…eq → awaited)
      let mode: 'select' | 'update' = 'select'
      let patch: Record<string, unknown> | null = null
      const api = {
        select: () => {
          mode = 'select'
          return api
        },
        update: (p: Record<string, unknown>) => {
          mode = 'update'
          patch = p
          return api
        },
        eq: () => {
          if (mode === 'update') {
            if (patch) h.state.updates.push(patch)
            return Promise.resolve({ data: null, error: null })
          }
          return api
        },
        maybeSingle: async () => ({ data: h.state.intake, error: null }),
      }
      return api
    },
  }),
}))

import { housingDollarsToCents, publishListingIntake } from './publish'
import { __resetSeedOwnerCache } from './seed-owner'

beforeEach(() => {
  h.state.intake = null
  h.state.seedOwner = null
  h.state.updates = []
  __resetSeedOwnerCache()
})

describe('housingDollarsToCents — the dollars→cents mapping', () => {
  it('multiplies dollars by 100', () => {
    expect(housingDollarsToCents(1800)).toBe(180000)
    expect(housingDollarsToCents(2500)).toBe(250000)
  })

  it('rounds fractional dollars to whole cents', () => {
    expect(housingDollarsToCents(1899.99)).toBe(189999)
    expect(housingDollarsToCents(0.1)).toBe(10)
  })

  it('passes null through (no rent/deposit set)', () => {
    expect(housingDollarsToCents(null)).toBeNull()
  })
})

const REVIEW_CLASSIFIEDS = {
  id: 'intake-1',
  kind: 'classifieds',
  inputs: { pastedText: 'sofa for sale', images: [] },
  draft: {
    kind: 'classifieds',
    title: 'Free sofa',
    description: null,
    listingKind: 'free',
    category: null,
    priceNote: null,
    neighborhood: null,
    city: null,
    contact: null,
    images: [],
  },
  status: 'review',
}

describe('publishListingIntake — guards + fail-safe', () => {
  it('rejects an intake that is not in review, and issues no write', async () => {
    h.state.intake = { ...REVIEW_CLASSIFIEDS, status: 'applied' }
    const res = await publishListingIntake('intake-1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('applied')
    expect(h.state.updates).toHaveLength(0)
  })

  it('flips the intake to failed when the seed owner cannot be resolved', async () => {
    h.state.intake = { ...REVIEW_CLASSIFIEDS }
    h.state.seedOwner = null // no system profile → resolveSeedOwnerProfileId returns null
    const res = await publishListingIntake('intake-1')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('No Frequency seed owner is configured.')
    // The fail-safe recorded a `failed` status update with the error stamped.
    expect(h.state.updates).toHaveLength(1)
    expect(h.state.updates[0]).toMatchObject({ status: 'failed', error: 'No Frequency seed owner is configured.' })
  })

  it('returns a not-found failure when the intake is missing', async () => {
    h.state.intake = null
    const res = await publishListingIntake('nope')
    expect(res.ok).toBe(false)
    expect(h.state.updates).toHaveLength(0)
  })
})
