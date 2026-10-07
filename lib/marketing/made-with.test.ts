import { describe, expect, it } from 'vitest'
import { MADE_WITH_CAMPAIGN, madeWithUrl } from './made-with'

describe('madeWithUrl', () => {
  it('links home with one campaign and the surface as the medium', () => {
    expect(madeWithUrl('booking-page')).toBe(
      `/?utm_source=made-with&utm_medium=booking-page&utm_campaign=${MADE_WITH_CAMPAIGN}`,
    )
  })

  it('takes an absolute origin for email, with or without a trailing slash', () => {
    expect(madeWithUrl('booking-email', 'https://x.test/')).toBe(madeWithUrl('booking-email', 'https://x.test'))
    expect(madeWithUrl('order-receipt', 'https://x.test').startsWith('https://x.test/?')).toBe(true)
  })
})
