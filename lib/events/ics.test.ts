import { describe, it, expect } from 'vitest'
import {
  icsStamp,
  icsEscape,
  foldLine,
  icsEventInstants,
  buildVevent,
  renderCalendar,
  rruleForRecurrence,
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
