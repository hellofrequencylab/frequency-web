import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatShort, formatTime } from './upcoming-event-rows'

// starts_at is stored UTC-naive (the event's wall-clock kept as UTC parts — lib/events/datetime),
// so these row formatters must read UTC parts, exactly like the edit page's toInput round-trip.
// Without timeZone:'UTC' they render in the SERVER's zone and every row shifts on a non-UTC
// runtime; a late-evening event even lands on the wrong DAY.
describe('upcoming event rows render the stored wall-clock (UTC parts)', () => {
  // 11:30 PM — the day-boundary case: any non-UTC rendering west of UTC moves it to Jul 3,
  // east of UTC to Jul 5.
  const lateNight = '2026-07-04T23:30:00.000Z'

  it('formatShort shows the stored calendar day', () => {
    expect(formatShort(lateNight)).toBe('Sat, Jul 4')
  })

  it('formatTime shows the stored wall-clock time', () => {
    expect(formatTime(lateNight)).toBe('11:30 PM')
  })
})

// Behavioural assertions above pass trivially on a UTC CI box even without the pin, so also
// guard the source: every formatter (including the DateChip's month/day) must stay pinned to
// UTC parts. Same precedent as upcoming-widget.test.ts next door.
describe('the formatters stay pinned to UTC parts', () => {
  const src = readFileSync(join(__dirname, 'upcoming-event-rows.tsx'), 'utf8')

  it("every toLocale* call carries timeZone: 'UTC'", () => {
    const toLocaleCalls = src.match(/toLocale\w+\(/g)?.length ?? 0
    const utcPins = src.match(/timeZone: 'UTC'/g)?.length ?? 0
    expect(toLocaleCalls).toBeGreaterThan(0)
    expect(utcPins).toBe(toLocaleCalls)
  })

  it('the DateChip day is a UTC part, never the server-local getDate()', () => {
    expect(src).toContain('getUTCDate()')
    expect(src).not.toMatch(/\.getDate\(\)/)
  })
})
