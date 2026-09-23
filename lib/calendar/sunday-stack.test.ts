import { describe, it, expect } from 'vitest'
import { areBackToBack, stackDay, stackRuns } from './sunday-stack'
import type { CalendarEvent } from './item'

function item(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'slug' | 'title' | 'dayKey'>): CalendarEvent {
  return {
    timeLabel: '7:00 PM',
    whenLabel: 'When',
    startInstantIso: null,
    location: null,
    goingCount: 0,
    coverUrl: null,
    isCancelled: false,
    ...partial,
  }
}

describe('stackDay', () => {
  it('groups three back-to-back Sunday items as one stacked block with a segment per item', () => {
    const stacked = stackDay([
      item({ slug: 'a', title: 'Ceremony', dayKey: '2026-10-04', startInstantIso: '2026-10-04T16:00:00Z' }),
      item({ slug: 'b', title: 'Lunch', dayKey: '2026-10-04', startInstantIso: '2026-10-04T19:00:00Z' }),
      item({ slug: 'c', title: 'Workshop', dayKey: '2026-10-04', startInstantIso: '2026-10-04T21:00:00Z' }),
      item({ slug: 'd', title: 'Monday', dayKey: '2026-10-05', startInstantIso: '2026-10-05T16:00:00Z' }),
    ])
    expect(stacked[0]).toMatchObject({ dayKey: '2026-10-04', stacked: true })
    expect(stacked[0].items).toHaveLength(3)
    expect(stacked[0].runs).toHaveLength(1)
    expect(stacked[0].runs[0].map((i) => i.slug)).toEqual(['a', 'b', 'c'])
    expect(stacked[1].stacked).toBe(false)
    expect(stacked[1].runs).toEqual([[stacked[1].items[0]]])
  })

  // LIVE-467. The first cut stacked ANY day with two or more items, so two unrelated gatherings on
  // one day became one chip whose click opened only the first.
  it('does not stack two items that merely share a day', () => {
    const [day] = stackDay([
      item({ slug: 'a', title: 'Morning sit', dayKey: '2026-10-04' }),
      item({ slug: 'b', title: 'Evening talk', dayKey: '2026-10-04' }),
    ])
    expect(day.stacked).toBe(false)
    expect(day.runs).toHaveLength(2)
    expect(day.runs.map((run) => run.map((i) => i.slug))).toEqual([['a'], ['b']])
  })

  // 🔴 THE TIMED HALF OF THE SAME RULE (LIVE-475). Every case above uses items with no instant, so
  // they all run down areBackToBack's null branch: widening the 12-hour window to "any gap" left the
  // whole suite green while two morning-and-evening gatherings merged back into one chip.
  it('does not stack two TIMED items on one day that are hours apart', () => {
    const morning = item({ slug: 'am', title: 'Morning sit', dayKey: '2026-10-04', startInstantIso: '2026-10-04T02:00:00Z' })
    const evening = item({ slug: 'pm', title: 'Evening talk', dayKey: '2026-10-04', startInstantIso: '2026-10-04T20:00:00Z' })
    expect(areBackToBack(morning, evening)).toBe(false)
    const [day] = stackDay([morning, evening])
    expect(day.stacked).toBe(false)
    expect(day.runs.map((run) => run.map((i) => i.slug))).toEqual([['am'], ['pm']])
  })

  it('stacks by the same rule areBackToBack states, in start order', () => {
    const late = item({ slug: 'late', title: 'Late', dayKey: '2026-10-04', startInstantIso: '2026-10-04T20:00:00Z' })
    const early = item({ slug: 'early', title: 'Early', dayKey: '2026-10-04', startInstantIso: '2026-10-04T18:00:00Z' })
    expect(areBackToBack(early, late)).toBe(true)
    expect(stackRuns([late, early]).map((run) => run.map((i) => i.slug))).toEqual([['early', 'late']])
  })
})
