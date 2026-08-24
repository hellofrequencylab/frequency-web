import { describe, it, expect, afterEach, vi } from 'vitest'

// TEASE OR NOTICE (ADR-875) — the resolvers wired end to end. One detection, two sentences:
//
//   • gates LIVE  -> `{ live: true, locked }` and NO notice. The lock tease speaks, as it has since
//     ADR-466, because by then something really is locked.
//   • gates SOFT (the beta grace window) -> `{ live: false, locked: false, notice }`. The warm line
//     speaks instead, naming the tier from the feature's real gate.
//
// They are mutually exclusive by construction, and this file asserts that at every call shape the
// app actually uses.

interface Scenario {
  /** featureGatesLive() — do the paid gates bite. Default false (the beta grace window). */
  gatesLive?: boolean
  /** billingLive() — is checkout real. Default true. */
  selling?: boolean
  /** The caller's true membership tier. Default 'free'. */
  tier?: 'free' | 'crew'
  /** A founding_members row for the subject, or null. */
  founding?: { status: 'reserved' | 'active' | 'lapsed' } | null
  /** An ACTIVE off-Stripe agreement for the Space, or null. */
  agreement?: { id: string } | null
}

async function loadResolvers(s: Scenario) {
  vi.resetModules()
  vi.doMock('./settings', () => ({
    featureGatesLive: async () => s.gatesLive === true,
    billingLive: async () => s.selling !== false,
    getBetaGrace: async () => ({ until: '2026-09-01' }),
  }))
  vi.doMock('@/lib/auth', () => ({
    getCallerProfile: async () => ({ id: 'p-1', realMembershipTier: s.tier ?? 'free' }),
  }))
  vi.doMock('@/lib/founding/status', () => ({
    getFoundingStatus: async () => s.founding ?? null,
  }))
  vi.doMock('@/lib/billing/manual-agreements', () => ({
    activeAgreementForSpace: async () => s.agreement ?? null,
  }))
  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
      from: () => ({ select: async () => ({ data: [], error: null }) }),
    }),
  }))
  return await import('./tease-gate')
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('./settings')
  vi.doUnmock('@/lib/auth')
  vi.doUnmock('@/lib/founding/status')
  vi.doUnmock('@/lib/billing/manual-agreements')
  vi.doUnmock('@/lib/supabase/admin')
  vi.resetModules()
})

function duringBeta() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
}

describe('during the beta grace window: a NOTICE, never a lock tease', () => {
  it('a Crew feature tells a free member they are using Crew tools', async () => {
    duringBeta()
    const { resolvePersonalTeaseGate } = await loadResolvers({})
    const gate = await resolvePersonalTeaseGate('vault_cash_in')
    expect(gate.live).toBe(false)
    expect(gate.locked).toBe(false) // NOTHING is blocked
    expect(gate.notice?.title).toBe('You are using Crew tools')
    expect(gate.notice?.body).toBe('Memberships start September 1. Everything stays open until then.')
    expect(gate.notice?.href).toBe('/pricing')
    expect(gate.notice?.key).toBe('tier:crew')
  })

  it('a tier FLOOR tease resolves the same notice, sharing the one per-tier dismissal key', async () => {
    duringBeta()
    const { resolveTierTeaseGate } = await loadResolvers({})
    const gate = await resolveTierTeaseGate('crew')
    expect(gate.notice?.key).toBe('tier:crew')
    expect(gate.notice?.title).toBe('You are using Crew tools')
  })

  it('a BUSINESS-depth Space key says Business tools', async () => {
    duringBeta()
    const { resolveSpaceTeaseGate } = await loadResolvers({})
    const gate = await resolveSpaceTeaseGate({ id: 's-1', entitlements: {} }, 'crm')
    expect(gate.notice?.title).toBe('You are using Business tools')
    expect(gate.notice?.key).toBe('plan:business')
    expect(gate.notice?.invite).toContain('Founding Business badge')
  })

  it('a COLLECTIVE-depth Space key says Collective tools', async () => {
    duringBeta()
    const { resolveSpaceTeaseGate } = await loadResolvers({})
    const gate = await resolveSpaceTeaseGate({ id: 's-1', entitlements: {} }, 'automation')
    expect(gate.notice?.title).toBe('You are using Collective tools')
    expect(gate.notice?.key).toBe('plan:collective')
  })
})

describe('during the beta grace window: who hears nothing', () => {
  it('a member ALREADY on the tier is not told they are using it', async () => {
    duringBeta()
    const { resolveTierTeaseGate, resolvePersonalTeaseGate } = await loadResolvers({ tier: 'crew' })
    expect((await resolveTierTeaseGate('crew')).notice).toBeNull()
    expect((await resolvePersonalTeaseGate('vault_cash_in')).notice).toBeNull()
  })

  it('a Space that already HAS the entitlement hears nothing', async () => {
    duringBeta()
    const { resolveSpaceTeaseGate } = await loadResolvers({})
    const gate = await resolveSpaceTeaseGate({ id: 's-1', entitlements: { crm: true } }, 'crm')
    expect(gate.notice).toBeNull()
  })

  it('an existing FOUNDER hears nothing', async () => {
    duringBeta()
    const { resolveTierTeaseGate } = await loadResolvers({ founding: { status: 'active' } })
    expect((await resolveTierTeaseGate('crew')).notice).toBeNull()
  })

  it('a CASH-PAYING Space (an active off-Stripe agreement) hears nothing', async () => {
    duringBeta()
    const { resolveSpaceTeaseGate } = await loadResolvers({ agreement: { id: 'agr-1' } })
    const gate = await resolveSpaceTeaseGate({ id: 's-cash', entitlements: {} }, 'crm')
    expect(gate.notice).toBeNull()
  })

  it('with billing OFF nobody is invited into a checkout that is not real', async () => {
    duringBeta()
    const { resolveTierTeaseGate } = await loadResolvers({ selling: false })
    expect((await resolveTierTeaseGate('crew')).notice).toBeNull()
  })
})

describe('once the gates bite: the tease is back and the notice is gone', () => {
  it('a free member below Crew gets a LOCKED tease and no notice', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))
    const { resolveTierTeaseGate } = await loadResolvers({ gatesLive: true })
    const gate = await resolveTierTeaseGate('crew')
    expect(gate.live).toBe(true)
    expect(gate.locked).toBe(true)
    expect(gate.notice).toBeNull()
  })

  it('a Space without the entitlement gets a LOCKED tease and no notice', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T00:00:00Z'))
    const { resolveSpaceTeaseGate } = await loadResolvers({ gatesLive: true })
    const gate = await resolveSpaceTeaseGate({ id: 's-1', entitlements: {} }, 'crm')
    expect(gate.live).toBe(true)
    expect(gate.locked).toBe(true)
    expect(gate.notice).toBeNull()
  })

  it('`live` and `notice` are never both set, at any call shape', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'))
    const soft = await loadResolvers({})
    const hard = await loadResolvers({ gatesLive: true })
    const gates = [
      await soft.resolvePersonalTeaseGate('vera_unlimited'),
      await soft.resolveTierTeaseGate('crew'),
      await soft.resolveSpaceTeaseGate({ id: 's-1', entitlements: {} }, 'crm'),
      await hard.resolvePersonalTeaseGate('vera_unlimited'),
      await hard.resolveTierTeaseGate('crew'),
      await hard.resolveSpaceTeaseGate({ id: 's-1', entitlements: {} }, 'crm'),
    ]
    for (const g of gates) expect(g.live && !!g.notice).toBe(false)
  })
})
