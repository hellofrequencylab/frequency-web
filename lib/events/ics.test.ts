import { describe, it, expect } from 'vitest'
import {
  icsStamp,
  icsLocalStamp,
  icsEscape,
  foldLine,
  icsEventInstants,
  icsLocalWallTimes,
  buildVevent,
  buildVtimezone,
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

describe('icsLocalStamp (TZID-form wall-clock stamp)', () => {
  it('formats the UTC parts WITHOUT a Z (the parts are the event-local time)', () => {
    expect(icsLocalStamp(new Date('2026-07-01T19:05:09Z'))).toBe('20260701T190509')
  })
})

describe('icsLocalWallTimes (stored wall-clock for the TZID recurring form)', () => {
  it('passes the stored parts through untouched (no zone resolution)', () => {
    const { start, end } = icsLocalWallTimes('2026-07-01T19:00:00Z', '2026-07-01T21:30:00Z')
    expect(icsLocalStamp(start)).toBe('20260701T190000')
    expect(icsLocalStamp(end)).toBe('20260701T213000')
  })
  it('defaults end to start + 1 wall-clock hour when ends_at is absent', () => {
    const { start, end } = icsLocalWallTimes('2026-07-01T19:00:00Z', null)
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000)
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

  it('emits LOCAL-time DTSTART/DTEND with TZID when tzid is set (the recurring DST fix)', () => {
    // A recurring anchor passes the STORED wall-clock parts + the event zone; the client then expands
    // the RRULE in that zone, so a 7pm series stays 7pm on both sides of a DST transition.
    const block = buildVevent({
      ...base,
      start: new Date('2026-10-28T19:00:00Z'), // stored parts = 7:00 PM local
      end: new Date('2026-10-28T21:00:00Z'),
      tzid: 'America/Los_Angeles',
      rrule: 'FREQ=WEEKLY',
    })
    expect(block).toContain('DTSTART;TZID=America/Los_Angeles:20261028T190000')
    expect(block).toContain('DTEND;TZID=America/Los_Angeles:20261028T210000')
    // Never the UTC form on a TZID vevent.
    expect(block.some((l) => l.startsWith('DTSTART:'))).toBe(false)
  })

  it('emits EXDATE in the SAME TZID local form so the exclusion matches the client expansion', () => {
    const block = buildVevent({
      ...base,
      start: new Date('2026-10-28T19:00:00Z'),
      end: new Date('2026-10-28T20:00:00Z'),
      tzid: 'America/Los_Angeles',
      rrule: 'FREQ=WEEKLY',
      exdates: [new Date('2026-11-11T19:00:00Z')], // wall-clock parts, past the Nov 1 fall-back
    })
    expect(block).toContain('EXDATE;TZID=America/Los_Angeles:20261111T190000')
    expect(block.some((l) => l.startsWith('EXDATE:'))).toBe(false)
  })
})

describe('computeFeedExdates (missing/cancelled occurrences the RRULE must not resurrect)', () => {
  // The math runs entirely in WALL-CLOCK space (the stored parts, the space the TZID-form DTSTART
  // expands in and the materializer steps in), so expected occurrences are the anchor +7d steps at
  // 19:00. `now`/`horizonDays` are injected so the expansion window is deterministic.
  const anchor = {
    starts_at: '2026-07-01T19:00:00Z',
    recurrence_type: 'weekly' as const,
    recurrence_until: null,
  }
  const NOW = new Date('2026-07-01T00:00:00Z')

  it('returns [] for a non-recurring anchor (nothing to subtract)', () => {
    expect(
      computeFeedExdates(
        { starts_at: '2026-07-01T19:00:00Z', recurrence_type: 'none', recurrence_until: null },
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

  it('stays in wall-clock space: the EXDATE keeps the stored 19:00, never a zone-shifted instant', () => {
    // The anchor VEVENT is DTSTART;TZID=<zone>:...T190000, so the client expands occurrences at 19:00
    // LOCAL — an EXDATE must carry that same local stamp (a UTC-resolved 02:00Z would not match and
    // the cancelled date would resurrect).
    const present = ['2026-07-01T19:00:00Z', '2026-07-15T19:00:00Z'] // 07-08 cancelled
    const ex = computeFeedExdates(anchor, present, { now: NOW, horizonDays: 20 })
    expect(ex.map(icsLocalStamp)).toEqual(['20260708T190000'])
  })

  it('EXDATE stays on the same wall-clock across a DST transition (fall-back Nov 1)', () => {
    // Weekly 19:00 series starting Oct 28 2026 (PDT side); Nov 11 (PST side) is cancelled. Wall-clock
    // math keeps every stamp at T190000 — the old absolute-space version shifted the post-transition
    // instants by an hour relative to the client's fixed-offset expansion.
    const dstAnchor = { starts_at: '2026-10-28T19:00:00Z', recurrence_type: 'weekly' as const, recurrence_until: null }
    const present = ['2026-10-28T19:00:00Z', '2026-11-04T19:00:00Z', '2026-11-18T19:00:00Z']
    const ex = computeFeedExdates(dstAnchor, present, { now: new Date('2026-10-28T00:00:00Z'), horizonDays: 22 })
    expect(ex.map(icsLocalStamp)).toEqual(['20261111T190000'])
  })

  it('mirrors the materializer\'s monthly clamp: a present Feb-28 child of a day-31 anchor is NOT EXDATEd', () => {
    // Jan 31 monthly anchor: the DB materializes Feb 28 (clamp) and Mar 31. Both present -> nothing to
    // subtract; the BYMONTHDAY=28,29,30,31;BYSETPOS=-1 RRULE generates the same days.
    const m = { starts_at: '2027-01-31T19:00:00Z', recurrence_type: 'monthly' as const, recurrence_until: null }
    const present = ['2027-01-31T19:00:00Z', '2027-02-28T19:00:00Z', '2027-03-31T19:00:00Z']
    const ex = computeFeedExdates(m, present, { now: new Date('2027-01-31T00:00:00Z'), horizonDays: 60 })
    expect(ex).toEqual([])
  })

  it('EXDATEs a CANCELLED clamped occurrence at its clamped local time (Feb 28, not a skipped Feb 31)', () => {
    const m = { starts_at: '2027-01-31T19:00:00Z', recurrence_type: 'monthly' as const, recurrence_until: null }
    const present = ['2027-01-31T19:00:00Z', '2027-03-31T19:00:00Z'] // Feb 28 cancelled
    const ex = computeFeedExdates(m, present, { now: new Date('2027-01-31T00:00:00Z'), horizonDays: 60 })
    expect(ex.map(icsLocalStamp)).toEqual(['20270228T190000'])
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

  it('adds the last-day idiom for a day-29/30/31 monthly anchor (short months must clamp, not skip)', () => {
    // Plain FREQ=MONTHLY from a day-31 DTSTART skips February entirely (RFC 5545; Google/Apple both
    // do), but the DB materializes Jan 31 -> Feb 28. BYMONTHDAY window + BYSETPOS=-1 reproduces the
    // clamp: the latest of the four candidate days the month actually has.
    expect(rruleForRecurrence('monthly', null, 31)).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
    expect(rruleForRecurrence('monthly', null, 30)).toBe('FREQ=MONTHLY;BYMONTHDAY=27,28,29,30;BYSETPOS=-1')
    expect(rruleForRecurrence('monthly', null, 29)).toBe('FREQ=MONTHLY;BYMONTHDAY=26,27,28,29;BYSETPOS=-1')
  })

  it('leaves day <= 28 monthly and every daily/weekly cadence as the plain FREQ', () => {
    expect(rruleForRecurrence('monthly', null, 28)).toBe('FREQ=MONTHLY')
    expect(rruleForRecurrence('monthly', null, 1)).toBe('FREQ=MONTHLY')
    expect(rruleForRecurrence('weekly', null, 31)).toBe('FREQ=WEEKLY')
    expect(rruleForRecurrence('daily', null, 31)).toBe('FREQ=DAILY')
  })

  it('keeps UNTIL a UTC (Z) stamp on the day-31 form — RFC 5545: UNTIL is UTC whenever DTSTART is zoned', () => {
    expect(rruleForRecurrence('monthly', new Date('2027-06-01T02:00:00Z'), 31)).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20270601T020000Z',
    )
  })
})

describe('planCalendarFeed (monthly day-31 clamp parity, the disappearing-February bug)', () => {
  const NOW = new Date('2027-01-31T00:00:00Z')
  const rows: FeedGroupRow[] = [
    { id: 'M', starts_at: '2027-01-31T19:00:00Z', time_zone: 'America/Los_Angeles', recurrence_type: 'monthly', recurrence_until: null, parent_event_id: null },
    { id: 'F', starts_at: '2027-02-28T19:00:00Z', time_zone: 'America/Los_Angeles', recurrence_type: 'none', recurrence_until: null, parent_event_id: 'M' },
    { id: 'R', starts_at: '2027-03-31T19:00:00Z', time_zone: 'America/Los_Angeles', recurrence_type: 'none', recurrence_until: null, parent_event_id: 'M' },
  ]

  it('emits the BYMONTHDAY/BYSETPOS last-day idiom and NO exdate for the present clamped Feb 28', () => {
    const m = planCalendarFeed(rows, { now: NOW, horizonDays: 60 }).find((p) => p.row.id === 'M')!
    expect(m.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
    // Feb 28 + Mar 31 are present AND generated by the RRULE — nothing to subtract, nothing lost.
    expect(m.exdates).toEqual([])
  })

  it('EXDATEs a cancelled clamped occurrence in local wall-clock form', () => {
    const withoutFeb = rows.filter((r) => r.id !== 'F')
    const m = planCalendarFeed(withoutFeb, { now: NOW, horizonDays: 60 }).find((p) => p.row.id === 'M')!
    expect(m.exdates.map(icsLocalStamp)).toEqual(['20270228T190000'])
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

  it('emits ONE VTIMEZONE per DISTINCT tzid, before the VEVENTs', () => {
    const NOW = new Date('2026-07-01T00:00:00Z')
    const body = renderCalendar({
      vevents: [vevent],
      // Two vevents in LA + one in New York -> exactly two VTIMEZONE blocks.
      tzids: ['America/Los_Angeles', 'America/Los_Angeles', 'America/New_York'],
      now: NOW,
    })
    expect(body.match(/BEGIN:VTIMEZONE/g)).toHaveLength(2)
    expect(body.match(/TZID:America\/Los_Angeles\r\n/g)).toHaveLength(1)
    expect(body.match(/TZID:America\/New_York\r\n/g)).toHaveLength(1)
    // The zone definitions precede the events that reference them.
    expect(body.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(body.indexOf('BEGIN:VEVENT'))
  })

  it('emits no VTIMEZONE when tzids is absent/empty (all-UTC one-off calendar unchanged)', () => {
    expect(renderCalendar({ vevents: [vevent] })).not.toContain('VTIMEZONE')
    expect(renderCalendar({ vevents: [vevent], tzids: [] })).not.toContain('VTIMEZONE')
  })
})

describe('buildVtimezone (Intl-derived VTIMEZONE rules)', () => {
  const NOW = new Date('2026-07-01T00:00:00Z')

  it('America/Los_Angeles gets the US RRULE pair (2nd Sun Mar / 1st Sun Nov, -0800/-0700)', () => {
    const block = buildVtimezone('America/Los_Angeles', NOW)
    expect(block[0]).toBe('BEGIN:VTIMEZONE')
    expect(block).toContain('TZID:America/Los_Angeles')
    expect(block).toContain('DTSTART:19700308T020000')
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU')
    expect(block).toContain('DTSTART:19701101T020000')
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU')
    expect(block).toContain('TZOFFSETFROM:-0800')
    expect(block).toContain('TZOFFSETTO:-0700')
    expect(block[block.length - 1]).toBe('END:VTIMEZONE')
  })

  it('America/New_York gets the US pair at -0500/-0400', () => {
    const block = buildVtimezone('America/New_York', NOW)
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU')
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU')
    expect(block).toContain('TZOFFSETFROM:-0500')
    expect(block).toContain('TZOFFSETTO:-0400')
  })

  it('America/Phoenix (no DST) gets a single fixed STANDARD block at -0700', () => {
    const block = buildVtimezone('America/Phoenix', NOW)
    expect(block.filter((l) => l.startsWith('BEGIN:'))).toEqual(['BEGIN:VTIMEZONE', 'BEGIN:STANDARD'])
    expect(block).toContain('TZOFFSETFROM:-0700')
    expect(block).toContain('TZOFFSETTO:-0700')
    expect(block.some((l) => l.startsWith('RRULE:'))).toBe(false)
  })

  it('Europe/London gets the EU pair (last Sun Mar at 01:00 local, last Sun Oct at 02:00 BST)', () => {
    const block = buildVtimezone('Europe/London', NOW)
    expect(block).toContain('DTSTART:19700329T010000')
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')
    expect(block).toContain('DTSTART:19701025T020000')
    expect(block).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU')
    expect(block).toContain('TZOFFSETFROM:+0000')
    expect(block).toContain('TZOFFSETTO:+0100')
  })

  it('Europe/Berlin gets the EU pair shifted to its own local wall times (02:00 / 03:00)', () => {
    const block = buildVtimezone('Europe/Berlin', NOW)
    expect(block).toContain('DTSTART:19700329T020000')
    expect(block).toContain('DTSTART:19701025T030000')
    expect(block).toContain('TZOFFSETFROM:+0100')
    expect(block).toContain('TZOFFSETTO:+0200')
  })

  it('UTC gets a single fixed STANDARD block at +0000', () => {
    const block = buildVtimezone('UTC', NOW)
    expect(block).toContain('TZID:UTC')
    expect(block).toContain('TZOFFSETFROM:+0000')
    expect(block).toContain('TZOFFSETTO:+0000')
    expect(block.some((l) => l.startsWith('RRULE:'))).toBe(false)
  })
})

describe('recurring local-time contract (DST-crossing weekly series, end to end)', () => {
  it('the anchor VEVENT carries the wall-clock DTSTART;TZID — same 7:00 PM on both sides of fall-back', () => {
    // What the feed routes assemble for a recurring anchor: local wall times + tzid + RRULE. The old
    // UTC form (DTSTART:20261029T020000Z, PDT-resolved) made every post-Nov-1 occurrence render 8pm.
    const { start, end } = icsLocalWallTimes('2026-10-28T19:00:00Z', null)
    const block = buildVevent(
      { uid: 'w1', start, end, summary: 'Weekly circle', tzid: 'America/Los_Angeles', rrule: 'FREQ=WEEKLY' },
      new Date('2026-10-01T00:00:00Z'),
    )
    expect(block).toContain('DTSTART;TZID=America/Los_Angeles:20261028T190000')
    expect(block).toContain('RRULE:FREQ=WEEKLY')
    // No fixed-offset UTC stamp anywhere in the start/end lines.
    expect(block.some((l) => l.startsWith('DTSTART:') || l.startsWith('DTEND:'))).toBe(false)
  })

  it('a NON-recurring VEVENT keeps the true-instant UTC form (no TZID, no VTIMEZONE needed)', () => {
    // Single instants have no expansion to drift — the one-off path is byte-for-byte what it was.
    const { start, end } = icsEventInstants('2026-10-28T19:00:00Z', null, 'America/Los_Angeles')
    const block = buildVevent({ uid: 'o1', start, end, summary: 'One night only' }, new Date('2026-10-01T00:00:00Z'))
    expect(block).toContain('DTSTART:20261029T020000Z') // 7pm PDT = 02:00Z next day
    expect(block.some((l) => l.startsWith('DTSTART;TZID='))).toBe(false)
  })
})
