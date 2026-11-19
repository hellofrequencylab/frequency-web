import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const retrieve = vi.fn()
const update = vi.fn()
vi.mock('./stripe', () => ({ stripe: { subscriptions: { retrieve: (...a: unknown[]) => retrieve(...a), update: (...a: unknown[]) => update(...a) } } }))

import { endMembershipFindersFee, isFirstFindersFeeInvoice, renewalFeePercent } from './membership-finders-fee'

const invoice = (over: Record<string, unknown> = {}, meta: Record<string, string> = { kind: 'space_membership', finders_fee: '1' }) =>
  ({
    billing_reason: 'subscription_create',
    parent: { subscription_details: { subscription: 'sub_1', metadata: meta } },
    ...over,
  }) as never

// ADR-1978: a membership's finder's fee is charged on the first payment only. A subscription can only
// carry a percent, which Stripe takes from every invoice, so the first paid invoice has to drop it.
describe('the finder’s fee on a membership is charged once', () => {
  beforeEach(() => {
    retrieve.mockReset()
    update.mockReset()
    delete process.env.CARD_FEE_PASS_THROUGH_FROM
  })
  afterEach(() => {
    delete process.env.CARD_FEE_PASS_THROUGH_FROM
  })

  it('only the first invoice of a marked Space membership qualifies', () => {
    expect(isFirstFindersFeeInvoice(invoice())).toBe(true)
    expect(isFirstFindersFeeInvoice(invoice({ billing_reason: 'subscription_cycle' }))).toBe(false)
    expect(isFirstFindersFeeInvoice(invoice({}, { kind: 'space_membership' }))).toBe(false)
    expect(isFirstFindersFeeInvoice(invoice({}, { kind: 'space_plan', finders_fee: '1' }))).toBe(false)
    expect(isFirstFindersFeeInvoice({ billing_reason: 'subscription_create', parent: null } as never)).toBe(false)
  })

  it('drops the percent to nothing after the first payment while the card fee is off', async () => {
    retrieve.mockResolvedValue({ metadata: { kind: 'space_membership', finders_fee: '1' }, items: { data: [{ price: { unit_amount: 5000 }, quantity: 1 }] } })
    expect(await endMembershipFindersFee(invoice())).toEqual({ ended: true })
    expect(update).toHaveBeenCalledWith('sub_1', {
      application_fee_percent: 0,
      metadata: { kind: 'space_membership', finders_fee: 'charged' },
    })
  })

  it('leaves the card fee on the renewals once it passes through', async () => {
    process.env.CARD_FEE_PASS_THROUGH_FROM = '2020-01-01T00:00:00Z'
    expect(renewalFeePercent(5000)).toBe(3.5)
    retrieve.mockResolvedValue({ metadata: { finders_fee: '1' }, items: { data: [{ price: { unit_amount: 5000 }, quantity: 1 }] } })
    await endMembershipFindersFee(invoice())
    expect(update.mock.calls[0][1].application_fee_percent).toBe(3.5)
  })

  it('a redelivered first invoice changes nothing', async () => {
    retrieve.mockResolvedValue({ metadata: { finders_fee: 'charged' }, items: { data: [] } })
    expect(await endMembershipFindersFee(invoice())).toEqual({ ended: false })
    expect(update).not.toHaveBeenCalled()
  })

  it('a renewal never reads Stripe', async () => {
    expect(await endMembershipFindersFee(invoice({ billing_reason: 'subscription_cycle' }))).toEqual({ ended: false })
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('a failed update throws, so Stripe redelivers instead of charging every renewal', async () => {
    retrieve.mockResolvedValue({ metadata: { finders_fee: '1' }, items: { data: [{ price: { unit_amount: 5000 }, quantity: 1 }] } })
    update.mockRejectedValue(new Error('stripe down'))
    await expect(endMembershipFindersFee(invoice())).rejects.toThrow('stripe down')
  })

  it('is wired: the checkout marks a fee-bearing join and the invoice webhook ends it', () => {
    const checkout = readFileSync('lib/billing/space-membership-checkout.ts', 'utf8')
    expect(checkout).toContain("...(fee > 0 ? { [FINDERS_FEE_MARK]: '1' } : {})")
    const hook = readFileSync('app/api/webhooks/stripe/route.ts', 'utf8')
    expect(hook).toContain('await endMembershipFindersFee(event.data.object as Stripe.Invoice)')
  })
})
