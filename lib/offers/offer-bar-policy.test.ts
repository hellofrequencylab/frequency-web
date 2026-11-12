import { describe, expect, it } from 'vitest'
import { offerBarDisplayState } from './offer-bar-policy'

describe('offer bar beta display policy', () => {
  const live = { endsAtMs: Date.parse('2027-02-04T12:00:00Z'), pending: false }

  it('hides the countdown through the final beta day in Pacific time', () => {
    expect(offerBarDisplayState(live, new Date('2027-02-01T07:59:59.999Z'))).toEqual({
      endsAtMs: null,
      pending: false,
    })
  })

  it('restores the existing countdown at midnight after beta in Pacific time', () => {
    expect(offerBarDisplayState(live, new Date('2027-02-01T08:00:00.000Z'))).toBe(live)
  })

  it('keeps the one-time pending offer navigation state during beta', () => {
    expect(offerBarDisplayState({ endsAtMs: null, pending: true }, new Date('2026-11-11T12:00:00Z'))).toEqual({
      endsAtMs: null,
      pending: true,
    })
  })

  it('leaves an absent offer unchanged', () => {
    expect(offerBarDisplayState(null, new Date('2026-11-11T12:00:00Z'))).toBeNull()
  })
})
