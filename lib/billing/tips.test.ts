import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// TIPS (lib/billing/tips.ts). MONEY CODE. Locks the two webhook recorders:
//   1. recordTipFromSession — a PAID tip session flips the pending row to succeeded and books
//      ONE Labs `commerce` row (the platform fee, 0 since ADR-913). IDEMPOTENT: a redelivered
//      event flips no row, so no second append. An unpaid session (a delayed-notification
//      method arriving at checkout.session.completed, L2-06) is a clean no-op — it records when
//      async_payment_succeeded delivers the same session as 'paid'.
//   2. recordTipRefundFromCharge (L2-07, 2026-09-05) — a FULL dashboard refund flips the
//      succeeded row to refunded and books ONE negative Labs `refund` row keyed on the row id;
//      a partial refund / a foreign charge / a redelivery changes nothing; a DB refusal THROWS.
// The DB + ledger are mocked, mirroring lib/billing/supporter.test.ts.

const { tipsUpdate, tipsEqArgs, tipsSelectRows, tipsUpdateError, recordFinancialTransaction } = vi.hoisted(() => ({
  tipsUpdate: vi.fn(),
  tipsEqArgs: vi.fn(),
  tipsSelectRows: vi.fn(),
  tipsUpdateError: vi.fn(),
  recordFinancialTransaction: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'tips') throw new Error(`unexpected table ${table}`)
      return {
        update: (patch: unknown) => {
          tipsUpdate(patch)
          return {
            eq: (c1: string, v1: unknown) => ({
              eq: (c2: string, v2: unknown) => {
                tipsEqArgs([c1, v1], [c2, v2])
                return { select: () => Promise.resolve({ data: tipsSelectRows(), error: tipsUpdateError() }) }
              },
            }),
          }
        },
      }
    },
  }),
}))
vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction,
  ENTITY_ID: { foundation: 'f0000000-0000-4000-a000-000000000001', labs: '1ab50000-0000-4000-a000-000000000002' },
}))
vi.mock('./stripe', () => ({ stripe: null, appUrl: () => 'http://t' }))
vi.mock('./connect', () => ({ getConnectStatus: async () => ({}), payoutsLive: async () => false }))

import { recordTipFromSession, recordTipRefundFromCharge } from './tips'

const LABS = '1ab50000-0000-4000-a000-000000000002'

function tipSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_tip_1',
    payment_status: 'paid',
    payment_intent: 'pi_tip_1',
    metadata: { kind: 'tip', from_profile_id: 'p1', to_profile_id: 'p2' },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

function fullRefund(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return { id: 'ch_1', amount: 500, amount_refunded: 500, payment_intent: 'pi_tip_1', ...overrides } as unknown as Stripe.Charge
}

beforeEach(() => {
  vi.clearAllMocks()
  tipsUpdateError.mockReturnValue(null)
  tipsSelectRows.mockReturnValue([{ id: 'tip-1', platform_fee_cents: 0, from_profile_id: 'p1', currency: 'usd' }])
  recordFinancialTransaction.mockResolvedValue({ recorded: true })
})

describe('recordTipFromSession - the succeed path', () => {
  it('a paid tip session flips pending -> succeeded keyed on the session id and books ONE Labs row', async () => {
    await recordTipFromSession(tipSession())
    expect(tipsUpdate).toHaveBeenCalledTimes(1)
    expect(tipsUpdate.mock.calls[0][0]).toMatchObject({ status: 'succeeded', stripe_payment_intent_id: 'pi_tip_1' })
    expect(tipsEqArgs).toHaveBeenCalledWith(['stripe_checkout_session_id', 'cs_tip_1'], ['status', 'pending'])
    expect(recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      entityId: LABS,
      revenueType: 'commerce',
      sourceTable: 'tips',
      sourceId: 'tip-1',
      idempotencyKey: 'tip:tip-1',
    })
  })

  it('an UNPAID session (delayed-notification method at `completed`, L2-06) writes nothing', async () => {
    await recordTipFromSession(tipSession({ payment_status: 'unpaid' }))
    expect(tipsUpdate).not.toHaveBeenCalled()
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('is idempotent: a redelivered paid session flips no row, so NO second ledger append', async () => {
    tipsSelectRows.mockReturnValue([])
    await recordTipFromSession(tipSession())
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('ignores a session of another kind', async () => {
    await recordTipFromSession(tipSession({ metadata: { kind: 'commerce_order' } }))
    expect(tipsUpdate).not.toHaveBeenCalled()
  })
})

describe('recordTipRefundFromCharge - dashboard refund reconciliation (L2-07)', () => {
  it('a FULL refund flips succeeded -> refunded (keyed on the payment intent) and books ONE reversing Labs row', async () => {
    tipsSelectRows.mockReturnValue([{ id: 'tip-1', platform_fee_cents: 25, from_profile_id: 'p1', currency: 'usd' }])
    await recordTipRefundFromCharge(fullRefund())

    expect(tipsUpdate).toHaveBeenCalledTimes(1)
    expect(tipsUpdate.mock.calls[0][0]).toMatchObject({ status: 'refunded' })
    expect(tipsUpdate.mock.calls[0][0]).toHaveProperty('refunded_at')
    expect(tipsEqArgs).toHaveBeenCalledWith(['stripe_payment_intent_id', 'pi_tip_1'], ['status', 'succeeded'])

    // The reversal is the fee the succeed path booked, negative, on the same entity, keyed once.
    expect(recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(recordFinancialTransaction.mock.calls[0][0]).toMatchObject({
      entityId: LABS,
      revenueType: 'refund',
      amountCents: -25,
      profileId: 'p1',
      stripePaymentIntentId: 'pi_tip_1',
      sourceTable: 'tips',
      sourceId: 'tip-1',
      idempotencyKey: 'tip-refund:tip-1',
    })
  })

  it('is idempotent: a redelivered charge.refunded matches no succeeded row, so NO second reversal', async () => {
    tipsSelectRows.mockReturnValue([])
    await recordTipRefundFromCharge(fullRefund())
    expect(tipsUpdate).toHaveBeenCalledTimes(1)
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a PARTIAL refund flips nothing and reverses nothing', async () => {
    await recordTipRefundFromCharge(fullRefund({ amount_refunded: 100 }))
    expect(tipsUpdate).not.toHaveBeenCalled()
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('a charge with no payment intent is a clean no-op', async () => {
    await recordTipRefundFromCharge(fullRefund({ payment_intent: null }))
    expect(tipsUpdate).not.toHaveBeenCalled()
  })

  it('THROWS when the DB refuses the flip, so the webhook 500s instead of acking a lost refund', async () => {
    // The live schema (20260609010000) CHECK-constrains status to pending/succeeded/failed and has
    // no refunded_at column until the widening migration lands; a refusal must be loud, not swallowed.
    tipsUpdateError.mockReturnValue({ code: '42703', message: 'column "refunded_at" does not exist' })
    await expect(recordTipRefundFromCharge(fullRefund())).rejects.toThrow(/refund flip failed/)
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })
})
