import { describe, it, expect } from 'vitest'
import { seatsRemaining, isSoldOut, seatLine, SEATS_VISIBLE_AT } from './paid'

describe('seatsRemaining', () => {
  it('is null for an uncapped Journey', () => {
    expect(seatsRemaining({ enrollCap: null, enrolled: 40 })).toBeNull()
  })
  it('treats a nonsense cap as uncapped rather than as sold out', () => {
    expect(seatsRemaining({ enrollCap: 0, enrolled: 3 })).toBeNull()
    expect(seatsRemaining({ enrollCap: -5, enrolled: 3 })).toBeNull()
  })
  it('counts down against the cap', () => {
    expect(seatsRemaining({ enrollCap: 12, enrolled: 9 })).toBe(3)
  })
  it('never goes negative when a cap was lowered under the roster', () => {
    expect(seatsRemaining({ enrollCap: 12, enrolled: 20 })).toBe(0)
  })
  it('reads a negative enrolment count as zero', () => {
    expect(seatsRemaining({ enrollCap: 12, enrolled: -3 })).toBe(12)
  })
})

describe('isSoldOut', () => {
  it('is false when uncapped, however many are in', () => {
    expect(isSoldOut({ enrollCap: null, enrolled: 999 })).toBe(false)
  })
  it('is true at the cap', () => {
    expect(isSoldOut({ enrollCap: 12, enrolled: 12 })).toBe(true)
  })
  it('is false one under the cap', () => {
    expect(isSoldOut({ enrollCap: 12, enrolled: 11 })).toBe(false)
  })
})

describe('seatLine', () => {
  // The rule that keeps an early window from reading as unpopular.
  it('says nothing while there is plenty of room', () => {
    expect(seatLine({ enrollCap: 12, enrolled: 2 })).toBeNull()
    expect(seatLine({ enrollCap: 12, enrolled: 12 - SEATS_VISIBLE_AT - 1 })).toBeNull()
  })
  it('starts speaking at the threshold', () => {
    expect(seatLine({ enrollCap: 12, enrolled: 12 - SEATS_VISIBLE_AT })).toBe(`${SEATS_VISIBLE_AT} spots left`)
  })
  it('is singular at one', () => {
    expect(seatLine({ enrollCap: 12, enrolled: 11 })).toBe('1 spot left')
  })
  it('says Full at zero', () => {
    expect(seatLine({ enrollCap: 12, enrolled: 12 })).toBe('Full')
  })
  it('says nothing at all for an uncapped Journey', () => {
    expect(seatLine({ enrollCap: null, enrolled: 3 })).toBeNull()
  })
  // No branch may produce a number a host typed; every line here is derived from the two inputs.
  it('never reports more spots than the cap', () => {
    for (let enrolled = 0; enrolled <= 12; enrolled++) {
      const line = seatLine({ enrollCap: 12, enrolled })
      if (line && line !== 'Full') {
        expect(Number(line.split(' ')[0])).toBeLessThanOrEqual(SEATS_VISIBLE_AT)
      }
    }
  })
})
