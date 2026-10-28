import { describe, expect, it } from 'vitest'
import { HOLD_LENGTHS, holdDaysLeft, holdEnd, holdLine, holdReleaseNote, holdRemaining, isHoldLapsed } from './hold'

const today = '2026-10-21'

describe('hold', () => {
  it('offers three, seven and fourteen days', () => {
    expect([...HOLD_LENGTHS]).toEqual([3, 7, 14])
    expect(holdEnd(today, 7)).toBe('2026-10-28')
    expect(holdEnd(today, 14)).toBe('2026-11-04')
  })
  it('counts the days left', () => {
    expect(holdDaysLeft('2026-10-27', today)).toBe(6)
    expect(holdDaysLeft('2026-10-20', today)).toBe(-1)
  })
  it('pluralises', () => {
    expect(holdRemaining('2026-10-27', today)).toBe('6 days left')
    expect(holdRemaining('2026-10-22', today)).toBe('1 day left')
    expect(holdRemaining('2026-10-21', today)).toBe('Ends today')
    expect(holdRemaining('2026-10-20', today)).toBe('Lapsed')
  })
  it('lapses the day after the last day, not on it', () => {
    expect(isHoldLapsed('2026-10-21', today)).toBe(false)
    expect(isHoldLapsed('2026-10-20', today)).toBe(true)
    expect(isHoldLapsed(null, today)).toBe(false)
  })
  it('writes the board line', () => {
    expect(holdLine('2026-10-27', today)).toBe('Holding until Oct 27 · 6 days left')
    expect(holdLine('2026-10-22', today)).toBe('Holding until Oct 22 · 1 day left')
    expect(holdLine('2026-10-20', today)).toBe('Hold lapsed Oct 20')
    expect(holdLine(null, today)).toBe('')
  })
  it('writes the release note', () => {
    expect(holdReleaseNote('2026-10-28', 'Wed, Oct 28')).toBe('Released on Wed, Oct 28 if nobody confirms')
    expect(holdReleaseNote('', '')).toBe('')
  })
})
