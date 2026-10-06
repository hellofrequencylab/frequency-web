import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE PAYMENTS GATE (ADR-1709, LIVE-753). Only Business and up take money; personal selling is off;
// a refusal is structured so the host's surface can open the upgrade moment; the gate never waits
// for the grace window; there is no grandfather clause.

const state = vi.hoisted(() => ({
  root: 'root-space' as string | null,
  plan: 'free' as string | null,
  readError: false,
  overrides: {} as Record<string, { minEntitlement?: string; enabled?: boolean }>,
  graceRead: vi.fn(),
}))

vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => state.root }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            state.readError ? { data: null, error: { message: 'boom' } } : { data: { plan: state.plan }, error: null },
        }),
      }),
    }),
  }),
}))
vi.mock('react', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, cache: <T,>(fn: T) => fn }
})
// The grace window must never be consulted: a read of it fails the test.
vi.mock('./settings', () => ({ featureGatesLive: state.graceRead }))

import { FEATURE_GATES } from './gates'
import * as gates from './gates'
import {
  planTakesPayments,
  personalPaymentsRefusal,
  spacePaymentsVerdict,
  spaceCanTakePayments,
} from './payments-gate'
import { isPaymentsRefusal, PAYMENTS_REFUSAL_SPACE, PAYMENTS_REFUSAL_PERSONAL, PAYMENTS_BUYER_REFUSAL } from './payments-copy'

beforeEach(() => {
  state.root = 'root-space'
  state.plan = 'free'
  state.readError = false
  state.overrides = {}
  vi.spyOn(gates, 'loadFeatureGateOverrides').mockImplementation(async () => state.overrides)
})

describe('the gate map', () => {
  it('declares space_payments at the Business floor, and moves the three selling gates off free', () => {
    expect(FEATURE_GATES.space_payments).toEqual({ axis: 'plan', minEntitlement: 'business', enabled: true })
    for (const k of ['space_memberships', 'space_membership_tickets', 'space_storefront']) {
      expect(FEATURE_GATES[k]?.minEntitlement, k).toBe('business')
    }
  })
})

describe('planTakesPayments', () => {
  it('admits business, collective, nonprofit, nonprofit_collective and independent; refuses free', () => {
    for (const p of ['business', 'collective', 'nonprofit', 'nonprofit_collective', 'independent']) {
      expect(planTakesPayments(p), p).toBe(true)
    }
    expect(planTakesPayments('free')).toBe(false)
    expect(planTakesPayments(null)).toBe(false)
    expect(planTakesPayments('platinum')).toBe(false) // unknown is free (default-deny)
  })

  it('follows an operator override, and ignores one off the ladder', () => {
    expect(planTakesPayments('free', { space_payments: { enabled: false } })).toBe(true)
    expect(planTakesPayments('business', { space_payments: { minEntitlement: 'collective' } })).toBe(false)
    expect(planTakesPayments('free', { space_payments: { minEntitlement: 'crew' } })).toBe(false)
  })

  it('asks the channel floor too when named', () => {
    expect(planTakesPayments('business', {}, 'space_storefront')).toBe(true)
    expect(planTakesPayments('business', { space_storefront: { minEntitlement: 'collective' } }, 'space_storefront')).toBe(false)
  })
})

describe('spacePaymentsVerdict', () => {
  it('refuses a free Space with a structured refusal the upgrade moment can read', async () => {
    const v = await spacePaymentsVerdict('space-1')
    expect(v).toEqual({
      ok: false,
      refusal: { code: 'payments_plan', scope: 'free_space', spaceId: 'space-1', message: PAYMENTS_REFUSAL_SPACE },
    })
    expect(await spaceCanTakePayments('space-1')).toBe(false)
  })

  it('admits a Business Space, and uses a plan the caller already read', async () => {
    state.plan = 'business'
    expect((await spacePaymentsVerdict('space-1')).ok).toBe(true)
    state.plan = 'free'
    expect((await spacePaymentsVerdict('space-1', { plan: 'collective' })).ok).toBe(true)
  })

  it('always admits the platform root Space', async () => {
    expect((await spacePaymentsVerdict('root-space')).ok).toBe(true)
  })

  it('has no grandfather clause: a free Space is refused however old its listing (owner ruling 2026-10-06)', async () => {
    // The option no longer exists; an extra field is ignored rather than honoured.
    const v = await spacePaymentsVerdict('space-1', { grandfatheredAt: '2026-07-10T00:00:00Z' } as never)
    expect(v.ok).toBe(false)
  })

  it('fails closed on an unreadable Space or a missing id', async () => {
    state.readError = true
    expect((await spacePaymentsVerdict('space-1')).ok).toBe(false)
    expect((await spacePaymentsVerdict('')).ok).toBe(false)
  })

  it('🔴 never consults the grace window', async () => {
    state.plan = 'business'
    await spacePaymentsVerdict('space-1')
    state.plan = 'free'
    await spacePaymentsVerdict('space-1')
    expect(state.graceRead).not.toHaveBeenCalled()
  })
})

describe('personal selling is off, and the copy round-trips', () => {
  it('refuses every personal seller', () => {
    const v = personalPaymentsRefusal()
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.refusal.scope).toBe('personal')
  })

  it('isPaymentsRefusal recognises both host sentences and nothing else', () => {
    expect(isPaymentsRefusal(PAYMENTS_REFUSAL_SPACE)).toBe(true)
    expect(isPaymentsRefusal(PAYMENTS_REFUSAL_PERSONAL)).toBe(true)
    expect(isPaymentsRefusal(PAYMENTS_BUYER_REFUSAL)).toBe(false)
    expect(isPaymentsRefusal('Could not save.')).toBe(false)
  })

  it('carries no em dashes and no typed prices (CONTENT-VOICE)', () => {
    for (const s of [PAYMENTS_REFUSAL_SPACE, PAYMENTS_REFUSAL_PERSONAL, PAYMENTS_BUYER_REFUSAL]) {
      expect(s).not.toMatch(/—|\$\d/)
    }
  })
})
