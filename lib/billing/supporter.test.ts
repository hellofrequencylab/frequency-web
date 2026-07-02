import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// SUPPORTER CONTRIBUTIONS (lib/billing/supporter.ts). MONEY CODE. Locks:
//   1. isValidContributionAmount — the PWYW floor + ceiling gate (default-deny), PURE.
//   2. recordSupporterContributionFromSession — the single grant point: a PAID contribution
//      session flips the pending ledger row to succeeded, books ONE Foundation donation, and
//      turns the Supporter badge on. IDEMPOTENT: a redelivered event flips no row, so no second
//      ledger append. A non-contribution / unpaid session is a clean no-op.
// The DB + ledger are mocked (createAdminClient captures the writes; recordFinancialTransaction
// is spied), mirroring lib/billing/founders.test.ts.

const {
  contribUpdate,
  contribSelectRows,
  contribInsert,
  contribInsertError,
  profilesUpdate,
  recordFinancialTransaction,
} = vi.hoisted(() => ({
  contribUpdate: vi.fn(),
  contribSelectRows: vi.fn(),
  contribInsert: vi.fn(),
  contribInsertError: vi.fn(),
  profilesUpdate: vi.fn(),
  recordFinancialTransaction: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'supporter_contributions') {
        return {
          insert: (v: unknown) => {
            contribInsert(v)
            return Promise.resolve({ error: contribInsertError() })
          },
          update: (patch: unknown) => {
            contribUpdate(patch)
            return {
              eq: () => ({
                eq: () => ({
                  select: () => Promise.resolve({ data: contribSelectRows(), error: null }),
                }),
              }),
            }
          },
        }
      }
      if (table === 'profiles') {
        return {
          update: (patch: unknown) => {
            profilesUpdate(patch)
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction,
  ENTITY_ID: { foundation: 'f0000000-0000-4000-a000-000000000001', labs: '1ab50000-0000-4000-a000-000000000002' },
}))

import {
  isValidContributionAmount,
  insertPendingContribution,
  recordSupporterContributionFromSession,
  SUPPORTER_CONTRIBUTION_KIND,
  SUPPORTER_MAX_CENTS,
} from './supporter'

function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_1',
    payment_status: 'paid',
    payment_intent: 'pi_123',
    client_reference_id: 'profile-1',
    metadata: { kind: SUPPORTER_CONTRIBUTION_KIND, profile_id: 'profile-1' },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

beforeEach(() => {
  vi.clearAllMocks()
  contribInsertError.mockReturnValue(null)
  contribSelectRows.mockReturnValue([
    { id: 'contrib-1', amount_cents: 1200, profile_id: 'profile-1', currency: 'usd' },
  ])
  recordFinancialTransaction.mockResolvedValue({ recorded: true })
})

describe('isValidContributionAmount - PWYW floor + ceiling (PURE, default-deny)', () => {
  it('accepts an amount at or above the operator floor and at or below the ceiling', () => {
    expect(isValidContributionAmount(500, 500)).toBe(true) // exactly the floor
    expect(isValidContributionAmount(1200, 500)).toBe(true)
    expect(isValidContributionAmount(SUPPORTER_MAX_CENTS, 500)).toBe(true) // exactly the ceiling
  })

  it('rejects below the floor, above the ceiling, and non-finite amounts', () => {
    expect(isValidContributionAmount(499, 500)).toBe(false)
    expect(isValidContributionAmount(SUPPORTER_MAX_CENTS + 1, 500)).toBe(false)
    expect(isValidContributionAmount(Number.NaN, 500)).toBe(false)
    expect(isValidContributionAmount(Infinity, 500)).toBe(false)
  })

  it('never lets a zero/negative floor open a free contribution (floor clamps to >= 1 cent)', () => {
    expect(isValidContributionAmount(0, 0)).toBe(false)
    expect(isValidContributionAmount(1, 0)).toBe(true)
  })
})

describe('recordSupporterContributionFromSession - grant correctness', () => {
  it('paid contribution: flips pending -> succeeded, books ONE Foundation donation, turns the badge on', async () => {
    const res = await recordSupporterContributionFromSession(paidSession())
    expect(res).toEqual({ recorded: true, amountCents: 1200 })

    // The ledger row is advanced with the payment intent id.
    expect(contribUpdate).toHaveBeenCalledTimes(1)
    expect(contribUpdate.mock.calls[0][0]).toMatchObject({ status: 'succeeded', stripe_payment_intent_id: 'pi_123' })

    // Exactly one Foundation donation, keyed idempotently on the ledger row id.
    expect(recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      entityId: 'f0000000-0000-4000-a000-000000000001',
      revenueType: 'donation',
      amountCents: 1200,
      profileId: 'profile-1',
      sourceTable: 'supporter_contributions',
      sourceId: 'contrib-1',
      idempotencyKey: 'supporter_contribution:contrib-1',
    })

    // The Supporter badge is turned on for the contributor.
    expect(profilesUpdate).toHaveBeenCalledWith({ is_supporter: true })
  })
})

describe('recordSupporterContributionFromSession - idempotency + no-op guards', () => {
  it('is idempotent: a redelivered event flips no row, so NO second ledger append / badge write', async () => {
    contribSelectRows.mockReturnValue([]) // already succeeded — nothing to advance
    const res = await recordSupporterContributionFromSession(paidSession())
    expect(res).toEqual({ recorded: false, amountCents: 0 })
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('ignores a non-contribution session (different kind) and writes nothing', async () => {
    const res = await recordSupporterContributionFromSession(
      paidSession({ metadata: { kind: 'tip', profile_id: 'profile-1' } }),
    )
    expect(res).toBeNull()
    expect(contribUpdate).not.toHaveBeenCalled()
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('ignores an unpaid session and writes nothing', async () => {
    const res = await recordSupporterContributionFromSession(paidSession({ payment_status: 'unpaid' }))
    expect(res).toBeNull()
    expect(contribUpdate).not.toHaveBeenCalled()
  })
})

describe('insertPendingContribution', () => {
  it('inserts a pending row and returns null on success', async () => {
    const err = await insertPendingContribution({ profileId: 'profile-1', amountCents: 1200, checkoutSessionId: 'cs_test_1' })
    expect(err).toBeNull()
    expect(contribInsert).toHaveBeenCalledWith({
      profile_id: 'profile-1',
      amount_cents: 1200,
      currency: 'usd',
      status: 'pending',
      stripe_checkout_session_id: 'cs_test_1',
    })
  })

  it('returns the DB error message when the insert fails (so the action can refuse the URL)', async () => {
    contribInsertError.mockReturnValue({ message: 'boom' })
    const err = await insertPendingContribution({ profileId: 'profile-1', amountCents: 1200, checkoutSessionId: 'cs_test_1' })
    expect(err).toBe('boom')
  })
})
