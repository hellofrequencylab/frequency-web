import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Stripe from 'stripe'

// SPACE DONATIONS (lib/billing/space-donation-checkout.ts). MONEY CODE, and the first checkout on a
// loop that has never completed once, so the guards matter more than the happy path. Locks:
//   1. resolveDonationCents — the shared floor, enforced identically by the button and the server.
//   2. recordSpaceDonationFromSession — a PAID donation session flips the pending row to succeeded
//      and books ONE Labs `commerce` row for the application fee. IDEMPOTENT: a redelivered event
//      flips no row and appends nothing. A session that is not a donation, or is not paid, is a clean
//      no-op, which is what makes it safe to run for EVERY checkout in the webhook's recorder list.
//      A DB refusal on the flip THROWS, so the webhook releases its claim and Stripe redelivers.
//   3. abandonSpaceDonationFromSession — an expired / failed session releases a pending row only.
//   4. recordSpaceDonationRefundFromCharge — a FULL refund reverses exactly the fee that was booked;
//      a PARTIAL refund changes nothing.
// The DB + ledger are mocked, mirroring lib/billing/tips.test.ts.

const { rows, updateError, updatePatch, eqCalls, recordFinancialTransaction } = vi.hoisted(() => ({
  rows: vi.fn(),
  updateError: vi.fn(),
  updatePatch: vi.fn(),
  eqCalls: vi.fn(),
  recordFinancialTransaction: vi.fn(async () => {}),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'space_donations') throw new Error(`unexpected table ${table}`)
      return {
        update: (patch: unknown) => {
          updatePatch(patch)
          return {
            eq: (c1: string, v1: unknown) => ({
              eq: (c2: string, v2: unknown) => {
                eqCalls([c1, v1], [c2, v2])
                return {
                  select: () => Promise.resolve({ data: rows(), error: updateError() }),
                  then: (resolve: (r: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: null }).then(resolve),
                }
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
  ENTITY_ID: { labs: 'labs-entity' },
}))

// The checkout half needs neither Stripe nor the fee engine for these cases; stub the module edge so
// importing the file never reaches a real client.
vi.mock('./stripe', () => ({ stripe: null, appUrl: () => 'https://example.test' }))
vi.mock('./connect', () => ({ getConnectStatus: vi.fn(), payoutsLive: vi.fn(async () => false) }))

const {
  resolveDonationCents,
  recordSpaceDonationFromSession,
  abandonSpaceDonationFromSession,
  recordSpaceDonationRefundFromCharge,
  createSpaceDonationCheckout,
  DONATION_MIN_CENTS,
} = await import('./space-donation-checkout')

const paidSession = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: 'cs_donation_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    metadata: { kind: 'space_donation' },
    ...over,
  }) as unknown as Stripe.Checkout.Session

beforeEach(() => {
  vi.clearAllMocks()
  recordFinancialTransaction.mockResolvedValue(undefined)
  rows.mockReturnValue([])
  updateError.mockReturnValue(null)
})

describe('resolveDonationCents', () => {
  it('refuses a gift below the floor, and says the floor', () => {
    const r = resolveDonationCents(50)
    expect('error' in r && r.error).toContain('Minimum gift')
  })

  it('refuses nothing, NaN and negatives with a plain prompt', () => {
    for (const bad of [0, -100, 'abc', null, undefined]) {
      expect('error' in resolveDonationCents(bad)).toBe(true)
    }
  })

  it('accepts the floor itself and rounds to whole cents', () => {
    expect(resolveDonationCents(DONATION_MIN_CENTS)).toEqual({ cents: DONATION_MIN_CENTS })
    expect(resolveDonationCents(2500.4)).toEqual({ cents: 2500 })
  })
})

describe('recordSpaceDonationFromSession', () => {
  it('flips the pending row and books exactly one ledger entry for the fee', async () => {
    rows.mockReturnValue([{ id: 'don_1', platform_fee_cents: 250, donor_profile_id: 'p1', currency: 'usd' }])
    await recordSpaceDonationFromSession(paidSession())
    expect(recordFinancialTransaction).toHaveBeenCalledTimes(1)
    expect(recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 250,
        revenueType: 'commerce',
        sourceTable: 'space_donations',
        sourceId: 'don_1',
        idempotencyKey: 'space-donation:don_1',
        stripePaymentIntentId: 'pi_1',
      }),
    )
  })

  it('is idempotent: a redelivered event flips no row, so it appends nothing', async () => {
    rows.mockReturnValue([])
    await recordSpaceDonationFromSession(paidSession())
    expect(recordFinancialTransaction).not.toHaveBeenCalled()
  })

  it('settles only pending rows keyed on the session id', async () => {
    rows.mockReturnValue([])
    await recordSpaceDonationFromSession(paidSession())
    expect(eqCalls).toHaveBeenCalledWith(
      ['stripe_checkout_session_id', 'cs_donation_1'],
      ['status', 'pending'],
    )
  })

  it('no-ops on a session that is not a donation (safe to run for EVERY checkout)', async () => {
    await recordSpaceDonationFromSession(paidSession({ metadata: { kind: 'tip' } }))
    expect(updatePatch).not.toHaveBeenCalled()
  })

  it('no-ops on an unpaid session, so a delayed payment records once on async_payment_succeeded', async () => {
    await recordSpaceDonationFromSession(paidSession({ payment_status: 'unpaid' }))
    expect(updatePatch).not.toHaveBeenCalled()
  })

  it('THROWS when the DB refuses the flip, so the webhook redelivers instead of acking a lost payment', async () => {
    updateError.mockReturnValue({ message: 'permission denied' })
    await expect(recordSpaceDonationFromSession(paidSession())).rejects.toThrow(/settle failed/)
  })
})

describe('abandonSpaceDonationFromSession', () => {
  it('releases only a pending row, and only for a donation session', async () => {
    await abandonSpaceDonationFromSession(paidSession())
    expect(updatePatch).toHaveBeenCalledWith(expect.objectContaining({ status: 'abandoned' }))
    vi.clearAllMocks()
    await abandonSpaceDonationFromSession(paidSession({ metadata: { kind: 'commerce_order' } }))
    expect(updatePatch).not.toHaveBeenCalled()
  })
})

describe('recordSpaceDonationRefundFromCharge', () => {
  const charge = (over: Partial<Stripe.Charge> = {}) =>
    ({ amount: 5000, amount_refunded: 5000, payment_intent: 'pi_1', ...over }) as unknown as Stripe.Charge

  it('reverses exactly the fee the succeed path booked', async () => {
    rows.mockReturnValue([{ id: 'don_1', platform_fee_cents: 250, donor_profile_id: 'p1', currency: 'usd' }])
    await recordSpaceDonationRefundFromCharge(charge())
    expect(recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: -250,
        revenueType: 'refund',
        idempotencyKey: 'space-donation-refund:don_1',
      }),
    )
  })

  it('ignores a PARTIAL refund (the gift stays recorded and the ledger stays honest)', async () => {
    await recordSpaceDonationRefundFromCharge(charge({ amount_refunded: 1000 }))
    expect(updatePatch).not.toHaveBeenCalled()
  })
})

describe('createSpaceDonationCheckout', () => {
  it('is GATED: no Stripe key means no session and a plain refusal, never a throw', async () => {
    const r = await createSpaceDonationCheckout({ spaceId: 's1', amountCents: 2500, donorProfileId: 'p1' })
    expect(r.url).toBeUndefined()
    expect(r.error).toBe('Giving is not turned on yet.')
  })
})

describe('the pre-migration window', () => {
  // charge.refunded carries no session metadata, so the refund path runs for EVERY full refund on the
  // platform. Before the migration lands it would otherwise throw "relation does not exist" and
  // 500-loop the Stripe webhook, re-firing the ticket / commerce / tip / supporter handlers beside it.
  it('treats a MISSING TABLE as a no-op on the refund path, and still throws on any real error', async () => {
    updateError.mockReturnValue({ code: '42P01', message: 'relation "space_donations" does not exist' })
    await expect(
      recordSpaceDonationRefundFromCharge({
        amount: 5000,
        amount_refunded: 5000,
        payment_intent: 'pi_1',
      } as unknown as Stripe.Charge),
    ).resolves.toBeUndefined()

    updateError.mockReturnValue({ code: '42501', message: 'permission denied' })
    await expect(
      recordSpaceDonationRefundFromCharge({
        amount: 5000,
        amount_refunded: 5000,
        payment_intent: 'pi_1',
      } as unknown as Stripe.Charge),
    ).rejects.toThrow(/refund flip failed/)
  })
})
