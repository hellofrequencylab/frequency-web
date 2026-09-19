import { describe, it, expect } from 'vitest'
import { purchaseConversionFromSession } from './purchase'

describe('purchaseConversionFromSession', () => {
  it('is silent on an unpaid session (delayed settlement waits for async_payment_succeeded)', () => {
    expect(
      purchaseConversionFromSession({
        id: 'cs_1',
        payment_status: 'unpaid',
        amount_total: 4400,
        currency: 'usd',
        metadata: { kind: 'ticket' },
      }),
    ).toBeNull()
  })

  it('is silent without a session id (nothing to key idempotency on)', () => {
    expect(purchaseConversionFromSession({ payment_status: 'paid', amount_total: 100 })).toBeNull()
  })

  it('emits commerce.purchase with value in major units and the GA client id', () => {
    const conv = purchaseConversionFromSession({
      id: 'cs_paid',
      payment_status: 'paid',
      amount_total: 44400,
      currency: 'USD',
      metadata: {
        kind: 'ticket',
        buyer_profile_id: 'p1',
        ga_client_id: '123.456',
      },
    })
    expect(conv).toMatchObject({
      event: 'commerce.purchase',
      shopEvent: null,
      actorProfileId: 'p1',
      idempotencyKey: 'commerce.purchase:cs_paid',
      props: {
        kind: 'ticket',
        value: 444,
        currency: 'usd',
        transaction_id: 'cs_paid',
        ga_client_id: '123.456',
      },
    })
  })

  it('names a commerce_order so the shop vertical reader has a writer', () => {
    const conv = purchaseConversionFromSession({
      id: 'cs_shop',
      payment_status: 'paid',
      amount_total: 800,
      currency: 'usd',
      metadata: { kind: 'commerce_order', buyer_profile_id: 'p2' },
    })
    expect(conv?.shopEvent).toBe('shop.order_completed')
    expect(conv?.actorProfileId).toBe('p2')
  })

  it('does not treat a space_plan client_reference_id as a person', () => {
    const conv = purchaseConversionFromSession({
      id: 'cs_plan',
      payment_status: 'paid',
      amount_total: 4900,
      currency: 'usd',
      mode: 'subscription',
      client_reference_id: 'space_1',
      metadata: { kind: 'space_plan', space_id: 'space_1' },
    })
    expect(conv?.actorProfileId).toBeNull()
    expect(conv?.props.kind).toBe('space_plan')
  })

  it('labels a kind-less member subscription so the allowlist creator still converts', () => {
    const conv = purchaseConversionFromSession({
      id: 'cs_crew',
      payment_status: 'paid',
      amount_total: 0,
      currency: 'usd',
      mode: 'subscription',
      client_reference_id: 'p3',
      metadata: { profile_id: 'p3', tier: 'crew' },
    })
    expect(conv?.props.kind).toBe('member_subscription')
    expect(conv?.actorProfileId).toBe('p3')
  })
})
