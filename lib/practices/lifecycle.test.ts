import { describe, it, expect } from 'vitest'
import { habitualHour, localHour, termIsComplete, completionBody, DEFAULT_REMINDER_HOUR } from './lifecycle'

describe('habitualHour (the member-shaped reminder time)', () => {
  const at = (h: number) => `2026-08-03T${String(h).padStart(2, '0')}:30:00Z`

  it('picks the mode of the local hours', () => {
    expect(habitualHour([at(7), at(7), at(19)], 'UTC')).toBe(7)
  })

  it('ties break toward the EARLIER hour (nudge before, not after)', () => {
    expect(habitualHour([at(19), at(7)], 'UTC')).toBe(7)
  })

  it('respects the timezone (18:30 UTC = 11:30 in Los Angeles, DST)', () => {
    expect(habitualHour(['2026-08-03T18:30:00Z'], 'America/Los_Angeles')).toBe(11)
  })

  it('empty history falls to the default', () => {
    expect(habitualHour([], 'UTC')).toBe(DEFAULT_REMINDER_HOUR)
    expect(habitualHour(['garbage'], 'UTC')).toBe(DEFAULT_REMINDER_HOUR)
  })
})

describe('localHour', () => {
  it('resolves a tz-local hour and survives a bad tz (falls to UTC)', () => {
    expect(localHour('2026-08-03T18:30:00Z', 'UTC')).toBe(18)
    expect(localHour('2026-08-03T18:30:00Z', 'Not/AZone')).toBe(18)
    expect(localHour('garbage', 'UTC')).toBeNull()
  })

  it('midnight formats to hour 0, never 24 (Intl h23 quirk guarded)', () => {
    expect(localHour('2026-08-03T00:10:00Z', 'UTC')).toBe(0)
  })
})

describe('termIsComplete (inclusive end)', () => {
  it('the last day itself is NOT complete; the morning after is', () => {
    expect(termIsComplete('2026-08-30', '2026-08-30')).toBe(false)
    expect(termIsComplete('2026-08-30', '2026-08-31')).toBe(true)
  })

  it('ongoing (null) never completes', () => {
    expect(termIsComplete(null, '2099-01-01')).toBe(false)
  })
})

describe('completionBody (plain voice)', () => {
  it('names the span and the practice, no em dashes, no narrated feelings', () => {
    const b = completionBody('Morning Stillness', 4)
    expect(b).toBe('4 weeks of Morning Stillness complete. Go again, or keep it going for good.')
    expect(b).not.toMatch(/[—–]/)
    const one = completionBody('Morning Stillness', 1)
    expect(one).toContain('1 week of')
  })
})
