import { describe, expect, it } from 'vitest'
import { buildVevent, renderCalendar } from '@/lib/events/ics'
import { entryFeedFields, type FeedEntryRow } from './entry-feed'

// THE PRIVATE FEED CARRIES A SERIES AS ONE VEVENT (PROG-CAL13). A repeating Pencil is emitted once,
// with its RRULE and one EXDATE per deliberately skipped day, in the entry's own zone and in the same
// form as DTSTART; a one-off has neither line and keeps the true-instant UTC form.

/** A 7pm to 9pm Pencil on Monday 5 October 2026, every other week, in Los Angeles, skipping Nov 2. */
const biweekly: FeedEntryRow = {
  id: 'entry-1',
  title: 'Sound bath',
  notes: 'Team only',
  location: 'The studio',
  starts_at: '2026-10-05T19:00:00.000Z',
  ends_at: '2026-10-05T21:00:00.000Z',
  time_zone: 'America/Los_Angeles',
  status: 'confirmed',
  recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2',
  exception_dates: ['2026-11-02'],
}
const NOW = new Date('2026-10-01T00:00:00Z')
const url = 'https://frequencylocal.com/spaces'

describe('entryFeedFields on a repeating Pencil', () => {
  it('emits ONE VEVENT carrying the RRULE and an EXDATE for the skipped day, in the entry zone', () => {
    const fields = entryFeedFields(biweekly, url)
    const block = buildVevent(fields, NOW)
    expect(block.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1)
    expect(block).toContain('DTSTART;TZID=America/Los_Angeles:20261005T190000')
    expect(block).toContain('DTEND;TZID=America/Los_Angeles:20261005T210000')
    expect(block).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2')
    // The skip is the master's own wall clock on that day, in the SAME form as DTSTART.
    expect(block).toContain('EXDATE;TZID=America/Los_Angeles:20261102T190000')
    expect(block.filter((l) => l.startsWith('EXDATE'))).toHaveLength(1)
    expect(block.indexOf('EXDATE;TZID=America/Los_Angeles:20261102T190000')).toBeGreaterThan(
      block.indexOf('RRULE:FREQ=WEEKLY;INTERVAL=2'),
    )
    // Never the UTC form on a series, and never a landing per VEVENT.
    expect(block.some((l) => l.startsWith('DTSTART:'))).toBe(false)
    expect(fields.tzid).toBe('America/Los_Angeles')
  })

  it('emits one EXDATE per skipped day, deduped and ordered, and none for an invalid day', () => {
    const block = buildVevent(
      entryFeedFields({ ...biweekly, exception_dates: ['2026-11-30', '2026-11-02', '2026-11-02', 'not a day'] }, url),
      NOW,
    )
    expect(block.filter((l) => l.startsWith('EXDATE'))).toEqual([
      'EXDATE;TZID=America/Los_Angeles:20261102T190000',
      'EXDATE;TZID=America/Los_Angeles:20261130T190000',
    ])
  })

  it('emits a VTIMEZONE for the series zone when the route hands it to renderCalendar', () => {
    const fields = entryFeedFields(biweekly, url)
    const body = renderCalendar({ vevents: [buildVevent(fields, NOW)], tzids: [fields.tzid], now: NOW })
    expect(body).toContain('BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles')
    expect(body.split('BEGIN:VEVENT')).toHaveLength(2)
  })

  it('treats a rule outside the dialect as a one-off rather than half-honouring it', () => {
    const block = buildVevent(entryFeedFields({ ...biweekly, recurrence_rule: 'FREQ=HOURLY' }, url), NOW)
    expect(block.some((l) => l.startsWith('RRULE'))).toBe(false)
    expect(block.some((l) => l.startsWith('EXDATE'))).toBe(false)
  })
})

describe('entryFeedFields on a one-off entry', () => {
  it('has neither RRULE nor EXDATE and stamps the true instant in UTC', () => {
    const block = buildVevent(entryFeedFields({ ...biweekly, recurrence_rule: null, exception_dates: [] }, url), NOW)
    expect(block.some((l) => l.startsWith('RRULE'))).toBe(false)
    expect(block.some((l) => l.startsWith('EXDATE'))).toBe(false)
    // 7pm in Los Angeles on 5 October 2026 (PDT) is 02:00Z the next day.
    expect(block).toContain('DTSTART:20261006T020000Z')
    expect(block).toContain('DTEND:20261006T040000Z')
    expect(block.some((l) => l.startsWith('DTSTART;TZID'))).toBe(false)
  })

  it('renders a row the read did not project the series columns on as a one-off', () => {
    const { recurrence_rule: _r, exception_dates: _e, ...bare } = biweekly
    const block = buildVevent(entryFeedFields(bare, url), NOW)
    expect(block.some((l) => l.startsWith('RRULE'))).toBe(false)
    expect(block).toContain('DTSTART:20261006T020000Z')
  })
})
