import { describe, expect, it } from 'vitest'
import { groupSlotsByDay, monthWeeks, openMonthRange } from '@/lib/spaces/booking-format'
import type { OpenSlot } from '@/lib/spaces/booking'

const slot = (startsAt: string): OpenSlot => ({ startsAt, slotMinutes: 30 })

describe('BOOK-013 month grid helpers', () => {
  it('groups slots by the viewer-zone calendar day, not the UTC day', () => {
    // 02:00 UTC on Nov 3 is still Nov 2 in New York.
    const days = groupSlotsByDay(
      [slot('2026-11-03T02:00:00Z'), slot('2026-11-03T15:00:00Z'), slot('2026-11-04T15:00:00Z')],
      'America/New_York',
    )
    expect(days.map((d) => [d.key, d.slots.length])).toEqual([
      ['2026-11-02', 1],
      ['2026-11-03', 1],
      ['2026-11-04', 1],
    ])
  })

  it('pages from the first open month to the last, keeping an empty month between', () => {
    const days = groupSlotsByDay([slot('2026-11-20T15:00:00Z'), slot('2027-01-05T15:00:00Z')], 'UTC')
    expect(openMonthRange(days)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(openMonthRange([])).toEqual([])
  })

  it('lays a month out in Sunday-first weeks with null padding', () => {
    const weeks = monthWeeks('2026-11') // Nov 1 2026 is a Sunday; 30 days
    expect(weeks[0][0]).toBe('2026-11-01')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks.flat().filter(Boolean)).toHaveLength(30)
    const feb = monthWeeks('2027-02') // Feb 1 2027 is a Monday; 28 days
    expect(feb[0].slice(0, 2)).toEqual([null, '2027-02-01'])
    expect(feb.flat().filter(Boolean).at(-1)).toBe('2027-02-28')
  })
})
