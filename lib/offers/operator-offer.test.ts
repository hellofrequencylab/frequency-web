import { describe, expect, it } from 'vitest'
import { OFFER_HOURS, formatRemaining, offerEndsAtMs, readOperatorOffer } from './operator-offer'

const HOUR = 3_600_000

describe('timed Beta offer', () => {
  it('runs 72 hours', () => {
    expect(offerEndsAtMs(0, null)).toBe(OFFER_HOURS * HOUR)
  })
  it('never runs past the Beta end', () => {
    expect(offerEndsAtMs(0, 10 * HOUR)).toBe(10 * HOUR)
  })
  it('reads live, expired and missing records', () => {
    const meta = { operator_offer: { startedAt: new Date(0).toISOString(), endsAt: new Date(HOUR).toISOString() } }
    expect(readOperatorOffer(meta, HOUR - 1).status).toBe('live')
    expect(readOperatorOffer(meta, HOUR).status).toBe('expired')
    expect(readOperatorOffer({}, 0).status).toBe('none')
    expect(readOperatorOffer({ operator_offer: { startedAt: 'x', endsAt: 'y' } }, 0).status).toBe('none')
  })
  it('formats the remaining time', () => {
    expect(formatRemaining(2 * 86_400_000 + 4 * HOUR + 12 * 60_000)).toBe('2d 04h 12m')
    expect(formatRemaining(3 * HOUR + 5 * 60_000 + 9000)).toBe('3h 05m 09s')
    expect(formatRemaining(-5)).toBe('0h 00m 00s')
  })
})
