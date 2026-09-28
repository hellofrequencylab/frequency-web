import { describe, expect, it } from 'vitest'
import { monthKey } from '@/lib/calendar/month-window'
import {
  EMPTY_MONTH_KEYS,
  monthDidNotLoad,
  monthFromKey,
  withMonth,
  withoutMonth,
} from '@/lib/calendar/month-requests'

// LIVE-528. The decision the grid renders, replayed without a browser: which months are in flight,
// which ones failed, and whose answer a clear is allowed to speak for.

const OCT = '2026-10'
const NOV = '2026-11'

describe('month request keys', () => {
  it('keeps one month failure through another month whole request', () => {
    // October is asked for and fails.
    let failed = withMonth(withoutMonth(EMPTY_MONTH_KEYS, OCT), OCT)
    expect(monthDidNotLoad(failed, OCT)).toBe(true)

    // November is asked for (which clears November, and only November) and loads fine.
    failed = withoutMonth(failed, NOV)
    expect(monthDidNotLoad(failed, NOV)).toBe(false)

    // Back on October: it still did not load, so it still says so and can still be retried. This is
    // what a single failedKey could not do -- the second request cleared the first month answer.
    expect(monthDidNotLoad(failed, OCT)).toBe(true)
  })

  it('holds a failure per month, not one at a time', () => {
    const failed = withMonth(withMonth(EMPTY_MONTH_KEYS, OCT), NOV)
    expect([...failed].sort()).toEqual([OCT, NOV])
    expect(monthDidNotLoad(withoutMonth(failed, OCT), NOV)).toBe(true)
  })

  it('returns the same set when there is nothing to change, so a reset cannot loop', () => {
    const one = withMonth(EMPTY_MONTH_KEYS, OCT)
    expect(withMonth(one, OCT)).toBe(one)
    expect(withoutMonth(one, NOV)).toBe(one)
    expect(withoutMonth(one, OCT)).toBe(EMPTY_MONTH_KEYS)
    expect(withoutMonth(EMPTY_MONTH_KEYS, OCT)).toBe(EMPTY_MONTH_KEYS)
  })

  it('reads a month key back into the parts loadMonth takes', () => {
    expect(monthFromKey(monthKey(2026, 10))).toEqual({ year: 2026, month1: 10 })
    expect(monthFromKey('2026-1')).toBeNull()
    expect(monthFromKey('2026-13')).toBeNull()
    expect(monthFromKey('not a month')).toBeNull()
  })
})
