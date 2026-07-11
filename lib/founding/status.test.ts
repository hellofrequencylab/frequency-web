import { describe, it, expect, beforeEach, vi } from 'vitest'

// FOUNDING STATUS grant + reserve. Locked invariants (ADR-599):
//   1. reserve writes status='reserved', charged_at UNSET, card_on_file=false. NO charge.
//   2. grantFoundingStatus (targeted, member) creates an ACTIVE row applying the locked rate AND
//      sets profiles.is_founding_member=true.
//   3. THE NO-CHARGE INVARIANT: grant NEVER writes charged_at (money moves only via the gated
//      billing path). Locked here across reserve + grant.
//   4. IDEMPOTENT: granting an already-active founder is a no-op (granted 0), not a re-charge.
// The DB + the founding config are mocked; the loose service-role handle is captured per table.

const { inserts, updates, maybeSingle } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: unknown }[],
  updates: [] as { table: string; patch: unknown }[],
  maybeSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle }), maybeSingle, then: (r: (v: unknown) => void) => r({ data: [], error: null }) }),
        in: () => ({ then: (r: (v: unknown) => void) => r({ data: [], error: null }) }),
      }),
      insert: (row: unknown) => {
        inserts.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
      update: (patch: unknown) => {
        updates.push({ table, patch })
        return { eq: () => Promise.resolve({ data: null, error: null }) }
      },
    }),
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  getFoundingConfig: vi.fn(async () => ({
    member_one_time_cents: 25000,
    member_cap: 150,
    business_monthly_cents: 3900,
    business_take_bps: 300,
    business_city_cap: 25,
  })),
}))

import { grantFoundingStatus, reserveFounding } from './status'
import { asFoundingConfig, foundingBusinessSpotsRemaining, FOUNDING_DEFAULT } from '@/lib/pricing/founding'

beforeEach(() => {
  inserts.length = 0
  updates.length = 0
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('founding config (pure)', () => {
  it('falls back to defaults for garbage input', () => {
    expect(asFoundingConfig(null)).toEqual(FOUNDING_DEFAULT)
    expect(asFoundingConfig({ business_take_bps: 'oops' }).business_take_bps).toBe(300)
  })
  it('spots-remaining never goes negative and honors the cap', () => {
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 0)).toBe(25)
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 25)).toBe(0)
    expect(foundingBusinessSpotsRemaining(FOUNDING_DEFAULT, 99)).toBe(0)
  })
})

describe('reserveFounding - no-charge reserve', () => {
  it('writes a reserved row with card_on_file false and NO charged_at', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null }) // no existing row
    const res = await reserveFounding({ kind: 'business', spaceId: 'space-1', cohortCity: 'Austin' })
    expect('data' in res).toBe(true)
    const row = inserts.find((i) => i.table === 'founding_members')?.row as Record<string, unknown>
    expect(row.status).toBe('reserved')
    expect(row.card_on_file).toBe(false)
    expect(row.locked_rate_cents).toBe(3900)
    expect(row.locked_take_bps).toBe(300)
    expect('charged_at' in row).toBe(false)
  })
})

describe('grantFoundingStatus - grant correctness + no-charge', () => {
  it('member (targeted, new): creates an active row and sets is_founding_member, no charged_at', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await grantFoundingStatus({ profileId: 'p-1', kind: 'member' })
    expect(res).toEqual({ data: { granted: 1 } })
    const founding = inserts.find((i) => i.table === 'founding_members')?.row as Record<string, unknown>
    expect(founding.status).toBe('active')
    expect(founding.locked_rate_cents).toBe(25000)
    expect('charged_at' in founding).toBe(false)
    expect(updates.some((u) => u.table === 'profiles' && (u.patch as Record<string, unknown>).is_founding_member === true)).toBe(true)
  })

  it('idempotent: an already-active founder grants 0 (never re-charges)', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'f-1', profile_id: 'p-1', kind: 'member', status: 'active', reserved_at: 'x' },
      error: null,
    })
    const res = await grantFoundingStatus({ profileId: 'p-1' })
    expect(res).toEqual({ data: { granted: 0 } })
    expect(updates.some((u) => u.table === 'founding_members')).toBe(false)
  })

  it('reserved -> active flips status without ever writing charged_at', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'f-2', profile_id: 'p-2', kind: 'member', status: 'reserved', reserved_at: 'x' },
      error: null,
    })
    const res = await grantFoundingStatus({ profileId: 'p-2' })
    expect(res).toEqual({ data: { granted: 1 } })
    const patch = updates.find((u) => u.table === 'founding_members')?.patch as Record<string, unknown>
    expect(patch.status).toBe('active')
    expect('charged_at' in patch).toBe(false)
  })
})
