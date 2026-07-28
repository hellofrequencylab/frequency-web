import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE BETA FOUNDER GRANT (ADR-875). Anybody who subscribes BEFORE memberships start becomes a
// founder, granted at the webhook reconciliation point. This is a lifetime badge plus a
// grandfathered rate, so the boundary and the idempotency are locked here:
//
//   1. THE BOUNDARY: the day BEFORE the grace date grants; the day OF does not. UTC, strictly-before,
//      the same convention as betaGraceActive (ADR-874).
//   2. THE KINDS: a member subscription grants kind='member' (which also flips
//      profiles.is_founding_member, the flag the profile badge reads); a Space plan grants
//      kind='business' (the Founding Business badge, ADR-873).
//   3. IDEMPOTENT ON REPLAY: an already-active founder is a no-op, not a second row and not a
//      second rate.
//   4. THE LOCKED RATE lands on a NEW row, and an EXISTING row's rate is never overwritten.
//   5. IT NEVER THROWS: a badge must not bounce a settled payment.

const { inserts, updates, maybeSingle, grace } = vi.hoisted(() => ({
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  maybeSingle: vi.fn(),
  grace: { until: '2026-09-01' as string | null, throws: false },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle }), maybeSingle, then: (r: (v: unknown) => void) => r({ data: [], error: null }) }),
        in: () => ({ then: (r: (v: unknown) => void) => r({ data: [], error: null }) }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row })
        return Promise.resolve({ data: null, error: null })
      },
      update: (patch: Record<string, unknown>) => {
        updates.push({ table, patch })
        return { eq: () => Promise.resolve({ data: null, error: null }) }
      },
    }),
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  getBetaGrace: vi.fn(async () => {
    if (grace.throws) throw new Error('pricing_settings is unreachable')
    return { until: grace.until }
  }),
  getFoundingConfig: vi.fn(async () => ({
    member_one_time_cents: 25000,
    member_cap: 150,
    business_monthly_cents: 3900,
    business_take_bps: 300,
    business_city_cap: 25,
  })),
}))

import { earnsBetaFounding, grantBetaFounding } from './beta-founding'
import { betaGraceEndsAtMs } from '@/lib/pricing/beta'

const ENDS = betaGraceEndsAtMs('2026-09-01')!
const DAY_BEFORE = Date.parse('2026-08-31T12:00:00.000Z')
const DAY_OF = Date.parse('2026-09-01T00:00:00.000Z')

const foundingRow = () => inserts.find((i) => i.table === 'founding_members')?.row
const profilePatch = () => updates.find((u) => u.table === 'profiles')?.patch

beforeEach(() => {
  inserts.length = 0
  updates.length = 0
  grace.until = '2026-09-01'
  grace.throws = false
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null, error: null }) // no existing founding row
})

// ── 1. The boundary (pure) ───────────────────────────────────────────────────────────────────────

describe('earnsBetaFounding (the cutoff, pure)', () => {
  it('grants the whole day BEFORE the grace date', () => {
    expect(earnsBetaFounding(Date.parse('2026-08-31T00:00:00.000Z'), ENDS)).toBe(true)
    expect(earnsBetaFounding(Date.parse('2026-08-31T23:59:59.999Z'), ENDS)).toBe(true)
  })

  it('does NOT grant on the day OF, at the instant it begins or after', () => {
    expect(earnsBetaFounding(DAY_OF, ENDS)).toBe(false)
    expect(earnsBetaFounding(DAY_OF + 1, ENDS)).toBe(false)
    expect(earnsBetaFounding(Date.parse('2026-12-25T00:00:00.000Z'), ENDS)).toBe(false)
  })

  it('with NO window configured there is no founding cohort to join', () => {
    expect(earnsBetaFounding(DAY_BEFORE, null)).toBe(false)
  })

  it('FAIL-SAFE the OTHER WAY from the feature gates: an unreadable instant grants nothing', () => {
    // betaGraceActive fails toward granting FEATURES (never lock a member out). This fails toward
    // withholding a lifetime BADGE + rate, which an operator can hand-grant, unlike un-granting one.
    expect(earnsBetaFounding(Number.NaN, ENDS)).toBe(false)
    expect(earnsBetaFounding(DAY_BEFORE, Number.NaN)).toBe(false)
  })
})

// ── 2. The grant, by kind ────────────────────────────────────────────────────────────────────────

describe('grantBetaFounding — a purchase BEFORE the cutoff', () => {
  it('member: creates an ACTIVE member row and sets profiles.is_founding_member', async () => {
    const res = await grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE })
    expect(res).toEqual({ granted: true, reason: 'granted' })
    const row = foundingRow()!
    expect(row.kind).toBe('member')
    expect(row.profile_id).toBe('p-1')
    expect(row.status).toBe('active')
    expect(profilePatch()).toEqual({ is_founding_member: true })
  })

  it('business: creates an ACTIVE business row for the Space (the ADR-873 badge)', async () => {
    const res = await grantBetaFounding({ kind: 'business', spaceId: 's-1', atMs: DAY_BEFORE })
    expect(res).toEqual({ granted: true, reason: 'granted' })
    const row = foundingRow()!
    expect(row.kind).toBe('business')
    expect(row.space_id).toBe('s-1')
    expect(row.status).toBe('active')
    // A Space founder is never flagged as a member founder.
    expect(profilePatch()).toBeUndefined()
  })

  it('records the LOCKED RATE actually charged on the new row (the grandfather promise)', async () => {
    await grantBetaFounding({ kind: 'business', spaceId: 's-1', atMs: DAY_BEFORE, lockedRateCents: 4900 })
    expect(foundingRow()!.locked_rate_cents).toBe(4900)
  })

  it('falls back to the founding CONFIG rate when the caller does not know the amount', async () => {
    await grantBetaFounding({ kind: 'business', spaceId: 's-1', atMs: DAY_BEFORE })
    expect(foundingRow()!.locked_rate_cents).toBe(3900)
  })

  it('NEVER charges: no charged_at is written by the grant (the ADR-599 invariant survives)', async () => {
    await grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE })
    expect('charged_at' in foundingRow()!).toBe(false)
    expect(foundingRow()!.card_on_file).toBe(false)
  })
})

describe('grantBetaFounding — a purchase AFTER the cutoff', () => {
  it('the day OF grants nothing, and writes nothing', async () => {
    const res = await grantBetaFounding({ kind: 'member', profileId: 'p-late', atMs: DAY_OF })
    expect(res).toEqual({ granted: false, reason: 'after_cutoff' })
    expect(inserts).toEqual([])
    expect(updates).toEqual([])
  })

  it('a Space plan bought in October grants nothing', async () => {
    const res = await grantBetaFounding({
      kind: 'business',
      spaceId: 's-late',
      atMs: Date.parse('2026-10-01T00:00:00.000Z'),
    })
    expect(res.granted).toBe(false)
    expect(inserts).toEqual([])
  })

  it('BOUNDARY, side by side: one millisecond apart, opposite answers', async () => {
    const before = await grantBetaFounding({ kind: 'member', profileId: 'p-a', atMs: DAY_OF - 1 })
    const on = await grantBetaFounding({ kind: 'member', profileId: 'p-b', atMs: DAY_OF })
    expect(before.granted).toBe(true)
    expect(on.granted).toBe(false)
  })

  it('an operator who CLEARS the grace window closes the cohort entirely', async () => {
    grace.until = null
    const res = await grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE })
    expect(res).toEqual({ granted: false, reason: 'no_window' })
    expect(inserts).toEqual([])
  })
})

// ── 3. Idempotency + fail-quiet ──────────────────────────────────────────────────────────────────

describe('grantBetaFounding — replay safety', () => {
  it('an ALREADY-ACTIVE founder is a no-op: no second row, no second rate', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'f-1', profile_id: 'p-1', kind: 'member', status: 'active', locked_rate_cents: 900 },
      error: null,
    })
    const res = await grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE, lockedRateCents: 1200 })
    expect(res.granted).toBe(true) // the desired state holds
    expect(inserts.filter((i) => i.table === 'founding_members')).toEqual([])
    // The flag is re-asserted (harmless, idempotent); the RATE is not rewritten.
    expect(updates.filter((u) => u.table === 'founding_members')).toEqual([])
  })

  it('a RESERVED founder is promoted to active in place, keeping the rate already agreed', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'f-2', space_id: 's-2', kind: 'business', status: 'reserved', locked_rate_cents: 4900 },
      error: null,
    })
    await grantBetaFounding({ kind: 'business', spaceId: 's-2', atMs: DAY_BEFORE, lockedRateCents: 7900 })
    const patch = updates.find((u) => u.table === 'founding_members')!.patch
    expect(patch.status).toBe('active')
    expect(patch.locked_rate_cents).toBeUndefined() // an agreed rate is settled the day it is set
    expect(inserts.filter((i) => i.table === 'founding_members')).toEqual([])
  })

  it('replaying the same purchase twice writes exactly one founding row', async () => {
    await grantBetaFounding({ kind: 'business', spaceId: 's-3', atMs: DAY_BEFORE })
    expect(inserts.filter((i) => i.table === 'founding_members')).toHaveLength(1)
    // The second delivery finds the row we just wrote.
    maybeSingle.mockResolvedValue({
      data: { id: 'f-3', space_id: 's-3', kind: 'business', status: 'active', locked_rate_cents: 3900 },
      error: null,
    })
    await grantBetaFounding({ kind: 'business', spaceId: 's-3', atMs: DAY_BEFORE })
    expect(inserts.filter((i) => i.table === 'founding_members')).toHaveLength(1)
  })

  it('no subject = nothing to grant, and no read is attempted', async () => {
    const res = await grantBetaFounding({ kind: 'member', atMs: DAY_BEFORE })
    expect(res).toEqual({ granted: false, reason: 'no_subject' })
    expect(inserts).toEqual([])
  })

  it('NEVER THROWS: a settings read failure returns a reason so the webhook still acks the payment', async () => {
    grace.throws = true
    const res = await grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE })
    expect(res).toEqual({ granted: false, reason: 'error' })
    expect(inserts).toEqual([])
  })

  it('NEVER THROWS: a founding-table read failure still settles the grant instead of bubbling', async () => {
    // getFoundingStatus is fail-safe to null, so an unreadable row resolves as "no row yet" and the
    // grant writes one. The unique index on the table is what keeps that honest; what matters here is
    // that a paid subscription is never bounced back to Stripe over a badge.
    maybeSingle.mockRejectedValue(new Error('founding_members is unreachable'))
    await expect(
      grantBetaFounding({ kind: 'member', profileId: 'p-1', atMs: DAY_BEFORE }),
    ).resolves.toBeTruthy()
  })
})

// ── 4. Source shape: the grant hangs off reconciliation, not a success page ──────────────────────

describe('SOURCE SHAPE: the grant is wired at the webhook reconciliation points', () => {
  it('the Space plan reconciler grants business founding', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(fileURLToPath(new URL('./space-subscriptions.ts', import.meta.url)), 'utf8')
    expect(src).toContain('grantBetaFounding')
    expect(src).toContain("kind: 'business'")
    // The cutoff reads the SUBSCRIPTION's creation instant, so a renewal never re-decides it.
    expect(src).toContain('sub.created * 1000')
  })

  it('BOTH grant points gate on the MONEY test first (ADR-880), never on the plan write alone', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const space = readFileSync(fileURLToPath(new URL('./space-subscriptions.ts', import.meta.url)), 'utf8')
    const webhook = readFileSync(
      fileURLToPath(new URL('../../app/api/webhooks/stripe/route.ts', import.meta.url)),
      'utf8',
    )
    for (const src of [space, webhook]) {
      expect(src).toContain('foundingPaymentSignal')
      expect(src).toContain('earnsFounding')
      // The locked rate is the BASE item's rate, normalized to a month. items.data[0] is gone.
      expect(src).toContain('payment.monthlyRateCents')
      expect(src).not.toContain('items?.data?.[0]?.price?.unit_amount')
    }
    // ...and the lapse that makes "for as long as you keep the plan" true in code.
    expect(space).toContain('lapseFoundingStatus')
    expect(webhook).toContain('lapseFoundingStatus')
  })

  it('the Stripe webhook grants member founding on an active member subscription', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const src = readFileSync(
      fileURLToPath(new URL('../../app/api/webhooks/stripe/route.ts', import.meta.url)),
      'utf8',
    )
    expect(src).toContain('grantBetaFounding')
    expect(src).toContain("kind: 'member'")
    expect(src).toContain('sub.created * 1000')
  })
})
