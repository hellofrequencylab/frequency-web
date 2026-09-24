import { describe, it, expect } from 'vitest'
import { isDayBand, spansDays, bandEdges, ALL_DAY_LABEL } from './item'

const at = (dayKey: string, timeLabel: string, endDayKey?: string) => ({ dayKey, timeLabel, endDayKey })

describe('the day band (LIVE-491)', () => {
  it('reads an all-day entry as a band, however long it is', () => {
    expect(isDayBand(at('2026-10-03', ALL_DAY_LABEL))).toBe(true)
  })

  it('reads a multi-day item as a band even when it carries a clock time', () => {
    // A retreat that starts at 4pm on Friday still OWNS Saturday and Sunday.
    expect(isDayBand(at('2026-10-02', '4:00 PM', '2026-10-04'))).toBe(true)
  })

  it('leaves an ordinary timed item alone', () => {
    expect(isDayBand(at('2026-10-06', '6:00 PM'))).toBe(false)
    expect(spansDays(at('2026-10-06', '6:00 PM'))).toBe(false)
  })

  it('does not call a same-day endDayKey a span', () => {
    // The adapters set endDayKey even for one-day items; that is not a span.
    expect(spansDays(at('2026-10-06', '6:00 PM', '2026-10-06'))).toBe(false)
    expect(isDayBand(at('2026-10-06', '6:00 PM', '2026-10-06'))).toBe(false)
  })

  it('rounds a one-day band at both ends', () => {
    const e = bandEdges(at('2026-10-03', ALL_DAY_LABEL), '2026-10-03')
    expect(e).toEqual({ startsHere: true, endsHere: true })
  })

  it('rounds a run only where it truly begins and ends, so the middle reads as one line', () => {
    const run = at('2026-10-02', ALL_DAY_LABEL, '2026-10-04')
    expect(bandEdges(run, '2026-10-02')).toEqual({ startsHere: true, endsHere: false })
    expect(bandEdges(run, '2026-10-03')).toEqual({ startsHere: false, endsHere: false })
    expect(bandEdges(run, '2026-10-04')).toEqual({ startsHere: false, endsHere: true })
  })

  it('treats a missing endDayKey as ending on its own day', () => {
    expect(bandEdges(at('2026-10-03', ALL_DAY_LABEL), '2026-10-03').endsHere).toBe(true)
  })
})
