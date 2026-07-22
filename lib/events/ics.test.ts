import { describe, it, expect } from 'vitest'
import {
  icsStamp,
  icsEscape,
  foldLine,
  icsEventInstants,
  buildVevent,
  renderCalendar,
  rruleForRecurrence,
  computeFeedExdates,
  planCalendarFeed,
  type FeedGroupRow,
} from './ics'

describe('icsStamp', () => {
  it('formats a Date as a UTC YYYYMMDDTHHMMSSZ stamp', () => {
    expect(icsStamp(new Date('2026-07-01T19:05:09Z'))).toBe('20260701T190509Z')
  })
  it('zero-pads every field', () => {
    expect(icsStamp(new Date('2026-01-02T03:04:05Z'))).toBe('20260102T030405Z')
  })
})

describe('icsEscape', () => {
  it('escapes backslash, semicolon, comma and newline per RFC 5545', () => {
    expect(icsEscape('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne')
    expect(icsEscape('carriage\r\nreturn')).toBe('carriage\\nreturn')
  })

  it('collapses a lone CR as well as a lone LF (no raw line-ending smuggling)', () => {
    // A lenient ICS parser can split on a bare CR; escaping it blocks property/VEVENT injection.
    expect(icsEscape('Party\rSUMMARY:fake')).toBe('Party\\nSUMMARY:fake')
    expect(icsEscape('a\nb\rc')).toBe('a\\nb\\nc')
  })
})

describe('foldLine', () => {
  it('leaves a short line untouched', () => {
    expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi')
  })
  it('folds a >75-char line with a leading space on continuation', () => {
    const long = 'X'.repeat(200)
    const folded = foldLine(long)
    expect(folded).toContain('\r\n ')
    // Every non-first segment begins with a single space; rejoining recovers the original.
    expect(folded.split('\r\n ').join('')).toBe(long)
    expect(folded.split('\r\n ')[0]).toHaveLength(75)
  })
})

describe('icsEventInstants (the timezone contract)', () => {
  it('resolves the stored wall-clock through the event zone to the TRUE UTC instant', () => {
    // 7:00 PM stored as UTC parts, interpreted in Los Angeles (PDT, UTC-7 in July) -> 02:00 UTC next day.
    const { start } = icsEventInstants('2026-07-01T19:00:00Z', null, 'America/Los_Angeles')
    expect(icsStamp(start)).toBe('20260702T020000Z')
  })

  it('REGRESSION: never stamps the raw wall-clock digits as UTC (the feed-route bug)', () => {
    // The old feed route did `new Date(row.starts_at)` and stamped it directly, emitting 190000Z for a
    // 7pm-PT event (7-8h off). The correct instant is 02:00Z the next day — assert we are NOT 19:00Z.
    const { start } = icsEventInstants('2026-07-01T19:00:00Z', null, 'America/Los_Angeles')
    expect(icsStamp(start)).not.toBe('20260701T190000Z')
  })

  it('resolves the same wall-clock differently for an eastern zone (DST-aware)', () => {
    // 7:00 PM in New York (EDT, UTC-4 in July) -> 23:00 UTC the same day.
    const { start } = icsEventInstants('2026-07-01T19:00:00Z', null, 'America/New_York')
    expect(icsStamp(start)).toBe('20260701T230000Z')
  })

  it('defaults end to start + 1h when ends_at is absent', () => {
    const { start, end } = icsEventInstants('2026-07-01T19:00:00Z', null, 'America/Los_Angeles')
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000)
  })

  it('resolves a present ends_at through the same zone', () => {
    const { end } = icsEventInstants('2026-07-01T19:00:00Z', '2026-07-01T21:30:00Z', 'America/Los_Angeles')
    expect(icsStamp(end)).toBe('20260702T043000Z')
  })

  it('falls back to HOME zone for an invalid/empty time_zone', () => {
    // resolveZone coerces junk to America/Los_Angeles, so this matches the LA result above.
    const { start } = icsEventInstants('2026-07-01T19:00:00Z', null, 'Not/AZone')
    expect(icsStamp(start)).toBe('20260702T020000Z')
  })
})

describe('buildVevent', () => {
  const base = {
    uid: 'evt-1',
    start: new Date('2026-07-02T02:00:00Z'),
    end: new Date('2026-07-02T03:00:00Z'),
    summary: 'Full Moon Circle',
    url: 'https://frequencylocal.com/events/full-moon',
  }

  it('emits the required VEVENT lines with the injected DTSTAMP', () => {
    const block = buildVevent(base, new Date('2026-06-01T00:00:00Z'))
    expect(block[0]).toBe('BEGIN:VEVENT')
    expect(block).toContain('UID:evt-1@frequency')
    expect(block).toContain('DTSTAMP:20260601T000000Z')
    expect(block).toContain('DTSTART:20260702T020000Z')
    expect(block).toContain('DTEND:20260702T030000Z')
    expect(block).toContain('SUMMARY:Full Moon Circle')
    expect(block).toContain('URL:https://frequencylocal.com/events/full-moon')
    expect(block[block.length - 1]).toBe('END:VEVENT')
  })

  it('omits optional venue/description when absent (a masked feed drops them)', () => {
    const block = buildVevent(base)
    expect(block.some((l) => l.startsWith('LOCATION:'))).toBe(false)
    expect(block.some((l) => l.startsWith('DESCRIPTION:'))).toBe(false)
    expect(block).not.toContain('STATUS:CANCELLED')
  })

  it('includes venue + description + escapes them, and marks cancellation', () => {
    const block = buildVevent({
      ...base,
      location: '123 Main St, Ojai',
      description: 'Bring a blanket; tea provided',
      cancelled: true,
    })
    expect(block).toContain('LOCATION:123 Main St\\, Ojai')
    expect(block).toContain('DESCRIPTION:Bring a blanket\\; tea provided')
    expect(block).toContain('STATUS:CANCELLED')
  })

  it('emits an RRULE line right after DTEND when rrule is set, and none when absent', () => {
    const withRule = buildVevent({ ...base, rrule: 'FREQ=WEEKLY' })
    expect(withRule).toContain('RRULE:FREQ=WEEKLY')
    // RRULE must sit inside the block (a client reads it as a property of this VEVENT).
    expect(withRule.indexOf('RRULE:FREQ=WEEKLY')).toBeGreaterThan(withRule.indexOf('DTEND:20260702T030000Z'))
    expect(buildVevent(base).some((l) => l.startsWith('RRULE:'))).toBe(false)
  })

  it('emits one EXDATE line per exdate, AFTER the RRULE, and skips an invalid Date', () => {
    const block = buildVevent({
      ...base,
      rrule: 'FREQ=WEEKLY',
      exdates: [new Date('2026-07-16T02:00:00Z'), new Date('not-a-date'), new Date('2026-07-30T02:00:00Z')],
    })
    expect(block).toContain('EXDATE:20260716T020000Z')
    expect(block).toContain('EXDATE:20260730T020000Z')
    // Only the two valid dates become lines (NaN is dropped, never emitted as EXDATE:Invalid).
    expect(block.filter((l) => l.startsWith('EXDATE:'))).toHaveLength(2)
    // EXDATE follows the RRULE it excepts.
    expect(block.indexOf('EXDATE:20260716T020000Z')).toBeGreaterThan(block.indexOf('RRULE:FREQ=WEEKLY'))
  })

  it('emits no EXDATE lines when exdates is absent or empty', () => {
    expect(buildVevent({ ...base, rrule: 'FREQ=WEEKLY' }).some((l) => l.startsWith('EXDATE:'))).toBe(false)
    expect(buildVevent({ ...base, rrule: 'FREQ=WEEKLY', exdates: [] }).some((l) => l.startsWith('EXDATE:'))).toBe(false)
  })
})

describe('computeFeedExdates (missing/cancelled occurrences the RRULE must not resurrect)', () => {
  // A UTC series keeps stored wall-clock == true instant, so the expected occurrences are the anchor +7d
  // steps at 19:00Z. `now`/`horizonDays` are injected so the expansion window is deterministic.
  const anchor = {
    starts_at: '2026-07-01T19:00:00Z',
    recurrence_type: 'weekly' as const,
    recurrence_until: null,
    time_zone: 'UTC',
  }
  const NOW = new Date('2026-07-01T00:00:00Z')

  it('returns [] for a non-recurring anchor (nothing to subtract)', () => {
    expect(
      computeFeedExdates(
        { starts_at: '2026-07-01T19:00:00Z', recurrence_type: 'none', recurrence_until: null, time_zone: 'UTC' },
        ['2026-07-01T19:00:00Z'],
        { now: NOW, horizonDays: 30 },
      ),
    ).toEqual([])
  })

  it('returns [] when every expected occurrence is present', () => {
    const present = [
      '2026-07-01T19:00:00Z', '2026-07-08T19:00:00Z', '2026-07-15T19:00:00Z',
      '2026-07-22T19:00:00Z', '2026-07-29T19:00:00Z',
    ]
    expect(computeFeedExdates(anchor, present, { now: NOW, horizonDays: 30 })).toEqual([])
  })

  it('EXDATEs a single cancelled middle occurrence (07-15 absent from the feed)', () => {
    const present = ['2026-07-01T19:00:00Z', '2026-07-08T19:00:00Z', '2026-07-22T19:00:00Z', '2026-07-29T19:00:00Z']
    const ex = computeFeedExdates(anchor, present, { now: NOW, horizonDays: 30 })
    expect(ex.map(icsStamp)).toEqual(['20260715T190000Z'])
  })

  it('RESURRECTION GUARD: EXDATEs a cancelled TAIL — bound is the horizon, not the last present date', () => {
    // Only the anchor is present; every later materialized occurrence was cancelled. All must be excluded
    // or the RRULE would regenerate them. Bounding to maxPresent (the anchor) would wrongly emit none.
    const ex = computeFeedExdates(anchor, ['2026-07-01T19:00:00Z'], { now: NOW, horizonDays: 30 })
    expect(ex.map(icsStamp)).toEqual([
      '20260708T190000Z', '20260715T190000Z', '20260722T190000Z', '20260729T190000Z',
    ])
  })

  it('never EXDATEs past recurrence_until (the series end the RRULE UNTIL carries)', () => {
    const ex = computeFeedExdates(
      { ...anchor, recurrence_until: '2026-07-15T23:59:59Z' },
      ['2026-07-01T19:00:00Z'],
      { now: NOW, horizonDays: 60 },
    )
    // Only 07-08 and 07-15 are in-series; 07-22+ are past the end, so no EXDATE for them.
    expect(ex.map(icsStamp)).toEqual(['20260708T190000Z', '20260715T190000Z'])
  })

  it('never EXDATEs beyond the materialization horizon (un-materialized future stays in the RRULE)', () => {
    // horizon = now + 10 days -> only 07-08 is expected; 07-15+ are not materialized yet, so they are NOT
    // subtracted (the client keeps generating the ongoing series).
    const ex = computeFeedExdates(anchor, ['2026-07-01T19:00:00Z'], { now: NOW, horizonDays: 10 })
    expect(ex.map(icsStamp)).toEqual(['20260708T190000Z'])
  })

  it('resolves EXDATE through the event zone (a 7pm-PT occurrence -> 02:00Z the next day)', () => {
    // Wall-clock 19:00 stored as UTC parts, interpreted in LA (PDT, UTC-7) -> the true instant is 02:00Z
    // the following day. Present rows are matched in the same true-instant space.
    const pt = { ...anchor, time_zone: 'America/Los_Angeles' }
    const present = ['2026-07-01T19:00:00Z', '2026-07-15T19:00:00Z'] // 07-08 cancelled
    const ex = computeFeedExdates(pt, present, { now: NOW, horizonDays: 20 })
    // 07-08 19:00 PT -> 07-09 02:00Z.
    expect(ex.map(icsStamp)).toEqual(['20260709T020000Z'])
  })
})

describe('planCalendarFeed (collapse a materialized series to one RRULE VEVENT)', () => {
  const NOW = new Date('2026-07-01T00:00:00Z')

  const rows: FeedGroupRow[] = [
    { id: 'A', starts_at: '2026-07-01T19:00:00Z', time_zone: 'UTC', recurrence_type: 'weekly', recurrence_until: null, parent_event_id: null },
    { id: 'C1', starts_at: '2026-07-08T19:00:00Z', time_zone: 'UTC', recurrence_type: 'none', recurrence_until: null, parent_event_id: 'A' },
    { id: 'C2', starts_at: '2026-07-22T19:00:00Z', time_zone: 'UTC', recurrence_type: 'none', recurrence_until: null, parent_event_id: 'A' },
    { id: 'N', starts_at: '2026-07-05T10:00:00Z', time_zone: 'UTC', recurrence_type: 'none', recurrence_until: null, parent_event_id: null },
    { id: 'O', starts_at: '2026-07-10T12:00:00Z', time_zone: 'UTC', recurrence_type: 'none', recurrence_until: null, parent_event_id: 'ZZZ' },
  ]

  it('collapses the anchor + its in-feed children into ONE RRULE plan and skips the children', () => {
    const plans = planCalendarFeed(rows, { now: NOW, horizonDays: 25 })
    const ids = plans.map((p) => p.row.id)
    // C1/C2 are folded into A's RRULE; A, N, O remain, IN INPUT ORDER.
    expect(ids).toEqual(['A', 'N', 'O'])
    const a = plans.find((p) => p.row.id === 'A')!
    expect(a.rrule).toBe('FREQ=WEEKLY')
  })

  it('EXDATEs the anchor plan for a cancelled occurrence between present children (07-15)', () => {
    const a = planCalendarFeed(rows, { now: NOW, horizonDays: 25 }).find((p) => p.row.id === 'A')!
    // present = anchor 07-01, C1 07-08, C2 07-22; horizon (25d) -> 07-26, so expected 07-08/07-15/07-22.
    expect(a.exdates.map(icsStamp)).toEqual(['20260715T190000Z'])
  })

  it('renders a non-recurring event and an ORPHAN child (anchor absent) as their own VEVENTs', () => {
    const plans = planCalendarFeed(rows, { now: NOW, horizonDays: 25 })
    const n = plans.find((p) => p.row.id === 'N')!
    const o = plans.find((p) => p.row.id === 'O')!
    expect(n.rrule).toBeNull()
    expect(n.exdates).toEqual([])
    // O's parent 'ZZZ' is not in the feed, so O is NOT dropped — it stays a standalone VEVENT.
    expect(o.rrule).toBeNull()
    expect(o.exdates).toEqual([])
  })

  it('leaves a feed with no recurring anchors entirely one-VEVENT-per-row', () => {
    const flat: FeedGroupRow[] = [
      { id: 'x', starts_at: '2026-07-02T10:00:00Z', recurrence_type: 'none', parent_event_id: null },
      { id: 'y', starts_at: '2026-07-03T10:00:00Z', recurrence_type: null, parent_event_id: null },
    ]
    const plans = planCalendarFeed(flat, { now: NOW })
    expect(plans.map((p) => p.row.id)).toEqual(['x', 'y'])
    expect(plans.every((p) => p.rrule === null && p.exdates.length === 0)).toBe(true)
  })
})

describe('rruleForRecurrence (enum recurrence -> RFC 5545 RRULE)', () => {
  it('maps each cadence to its FREQ', () => {
    expect(rruleForRecurrence('daily')).toBe('FREQ=DAILY')
    expect(rruleForRecurrence('weekly')).toBe('FREQ=WEEKLY')
    expect(rruleForRecurrence('monthly')).toBe('FREQ=MONTHLY')
  })
  it('returns null for a one-time / unknown / absent cadence', () => {
    expect(rruleForRecurrence('none')).toBeNull()
    expect(rruleForRecurrence(null)).toBeNull()
    expect(rruleForRecurrence('yearly')).toBeNull()
  })
  it('appends UNTIL as a UTC stamp when a valid series-end instant is given', () => {
    expect(rruleForRecurrence('weekly', new Date('2026-09-01T02:00:00Z'))).toBe('FREQ=WEEKLY;UNTIL=20260901T020000Z')
  })
  it('ignores an invalid UNTIL instant (no UNTIL rather than NaN)', () => {
    expect(rruleForRecurrence('daily', new Date('not-a-date'))).toBe('FREQ=DAILY')
  })
})

describe('renderCalendar', () => {
  const vevent = buildVevent(
    {
      uid: 'evt-1',
      start: new Date('2026-07-02T02:00:00Z'),
      end: new Date('2026-07-02T03:00:00Z'),
      summary: 'Full Moon Circle',
    },
    new Date('2026-06-01T00:00:00Z'),
  )

  it('wraps events in a VCALENDAR envelope with CRLF endings and a trailing CRLF', () => {
    const body = renderCalendar({ vevents: [vevent] })
    expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(body).toContain('VERSION:2.0')
    expect(body).toContain('PRODID:-//Frequency//Community Events//EN')
    expect(body.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // No feed name/desc hints for a bare single-event export.
    expect(body).not.toContain('X-WR-CALNAME')
  })

  it('adds X-WR-CALNAME/CALDESC hints (escaped) when a feed name is given', () => {
    const body = renderCalendar({
      vevents: [vevent],
      name: 'Royal Temple, Events',
      description: 'Upcoming happenings',
    })
    expect(body).toContain('X-WR-CALNAME:Royal Temple\\, Events')
    expect(body).toContain('X-WR-CALDESC:Upcoming happenings')
  })
})
