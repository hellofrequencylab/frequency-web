import { describe, it, expect } from 'vitest'
import {
  commercePaymentMethodParams,
  JOURNEY_PMC_ENV,
  COMMERCE_PMC_ENV,
} from './payment-methods'

// THE COMMERCE PAYMENT-METHOD SEAM (LIVE-396 instalments). What these pin:
//   * the DEFAULT is "change nothing" — with no env, commerce keeps inheriting the Stripe
//     Dashboard exactly as it did before this seam existed. A seam that silently narrowed the set
//     would be a second, quieter way to lose a payment method, which is the failure tickets.ts
//     warns about in its own header;
//   * a Journey-only cart takes the Journey configuration, which is where instalments live;
//   * a MIXED cart does not, so one qualifying line cannot let a buyer finance the rest;
//   * the two Stripe parameters are never merged (passing both is a request error at Stripe).

type Env = Record<string, string | undefined>

const NONE: Env = {}

describe('commercePaymentMethodParams', () => {
  it('🔴 changes nothing when the owner has named no configuration', () => {
    expect(commercePaymentMethodParams({ journeyOnly: true, env: NONE })).toEqual({})
    expect(commercePaymentMethodParams({ journeyOnly: false, env: NONE })).toEqual({})
  })

  it('uses the Journey configuration for a Journey-only cart', () => {
    const env = { [JOURNEY_PMC_ENV]: 'pmc_journey' } satisfies Env
    expect(commercePaymentMethodParams({ journeyOnly: true, env })).toEqual({
      payment_method_configuration: 'pmc_journey',
    })
  })

  it('does NOT use it for a mixed cart, so a Journey cannot finance a t-shirt', () => {
    const env = { [JOURNEY_PMC_ENV]: 'pmc_journey' } satisfies Env
    expect(commercePaymentMethodParams({ journeyOnly: false, env })).toEqual({})
  })

  it('falls back to the commerce configuration when one is set', () => {
    const env = { [COMMERCE_PMC_ENV]: 'pmc_commerce' } satisfies Env
    expect(commercePaymentMethodParams({ journeyOnly: false, env })).toEqual({
      payment_method_configuration: 'pmc_commerce',
    })
    // A Journey cart with no Journey config still gets the commerce one rather than nothing.
    expect(commercePaymentMethodParams({ journeyOnly: true, env })).toEqual({
      payment_method_configuration: 'pmc_commerce',
    })
  })

  it('prefers the Journey configuration over the commerce one on a Journey cart', () => {
    const env = {
      [JOURNEY_PMC_ENV]: 'pmc_journey',
      [COMMERCE_PMC_ENV]: 'pmc_commerce',
    } satisfies Env
    expect(commercePaymentMethodParams({ journeyOnly: true, env })).toEqual({
      payment_method_configuration: 'pmc_journey',
    })
    expect(commercePaymentMethodParams({ journeyOnly: false, env })).toEqual({
      payment_method_configuration: 'pmc_commerce',
    })
  })

  it('treats a blank or whitespace env as unset rather than as an empty id', () => {
    for (const bad of ['', '   ', '\t']) {
      const env = { [JOURNEY_PMC_ENV]: bad, [COMMERCE_PMC_ENV]: bad } satisfies Env
      expect(commercePaymentMethodParams({ journeyOnly: true, env })).toEqual({})
    }
  })

  it('never returns both Stripe parameters at once', () => {
    const env = {
      [JOURNEY_PMC_ENV]: 'pmc_journey',
      [COMMERCE_PMC_ENV]: 'pmc_commerce',
    } satisfies Env
    for (const journeyOnly of [true, false]) {
      const out = commercePaymentMethodParams({ journeyOnly, env }) as Record<string, unknown>
      expect('payment_method_types' in out).toBe(false)
      expect(Object.keys(out).length).toBeLessThanOrEqual(1)
    }
  })
})
