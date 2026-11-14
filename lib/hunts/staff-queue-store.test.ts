// FH-020T: the held-claim queue's tenancy wall. A fake admin client serves the rows; the real decide()
// and the real loadStationFacts logic run on top, so a non-staff member sees nothing and a venue's staff
// sees only that venue's claims.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tables: Record<string, Record<string, unknown>[]> = {}

function query(rows: Record<string, unknown>[]) {
  let out = rows
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => ((out = out.filter((r) => r[col] === val)), q),
    in: (col: string, vals: unknown[]) => ((out = out.filter((r) => vals.includes(r[col]))), q),
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: out[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: out, error: null }).then(res),
  }
  return q
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(tables[t] ?? []) }) }))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async (id: string) => ({ id, name: id === 'space-a' ? 'North Park Shop' : 'Other Shop' }) }))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async (space: { id: string }, profileId: string) => ({ canEditProfile: profileId === 'staff-1' && space.id === 'space-a' }),
}))

import { loadHeldClaims, mayReviewClaim } from './staff-queue-store'

const NOW = Math.floor(Date.parse('2026-11-14T12:00:00Z') / 1000)

beforeEach(() => {
  tables.hunts = [{ id: 'h1', visibility: 'public', owner_profile_id: 'owner-1', owner_space_id: null }]
  tables.hunt_roles = []
  tables.hunt_partners = [{ hunt_id: 'h1', space_id: 'space-a', status: 'accepted', effective_at: '2026-01-01T00:00:00Z', revoked_at: null, permitted_roles: ['operator'] }]
  tables.hunt_mission_placements = [{ hunt_id: 'h1', version_id: 'v1', mission_key: 'm1', placement_id: 'pl1', venue_space_id: 'space-a' }]
  tables.hunt_claims = [
    { id: 'abcd1111', hunt_id: 'h1', version_id: 'v1', mission_key: 'm1', state: 'needs_review', reason: null, created_at: '2026-11-14T11:48:00Z', policy_result: { placement_id: 'pl1' } },
    { id: 'zzzz2222', hunt_id: 'h1', version_id: 'v1', mission_key: 'm1', state: 'needs_review', reason: 'x', created_at: '2026-11-14T11:48:00Z', policy_result: {} },
  ]
})

describe('held claim queue', () => {
  it('lists an attributed held claim for the venue staff, and drops one with no placement', async () => {
    const held = await loadHeldClaims('staff-1', NOW)
    expect(held).toEqual([{ claimId: 'abcd1111', reference: 'ABCD', venueName: 'North Park Shop', reason: 'Proof needs a second look', ageLabel: '12 minutes ago' }])
  })

  it('shows nothing to a member who is not staff of the venue', async () => {
    expect(await loadHeldClaims('someone-else', NOW)).toEqual([])
  })

  it('stops showing the queue once the partner is revoked', async () => {
    tables.hunt_partners = [{ ...tables.hunt_partners[0], revoked_at: '2026-02-01T00:00:00Z', status: 'revoked' }]
    expect(await loadHeldClaims('staff-1', NOW)).toEqual([])
  })

  it('lets the review action check one claim fresh', async () => {
    expect(await mayReviewClaim('staff-1', 'abcd1111', NOW)).toBe(true)
    expect(await mayReviewClaim('someone-else', 'abcd1111', NOW)).toBe(false)
    expect(await mayReviewClaim('staff-1', 'zzzz2222', NOW)).toBe(false)
    expect(await mayReviewClaim('staff-1', 'nope', NOW)).toBe(false)
  })
})
