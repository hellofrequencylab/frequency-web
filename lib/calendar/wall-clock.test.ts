import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { instantShapedSeriesTell, instantShapedSpan, storedWallClock, wallClockOfInstant, type StoredSpan } from './wall-clock'
import { parseEntryInput, type EntryInput } from './entries'
import { eventInstant } from '@/lib/time/zone'

// LIVE-514. The wall-clock / instant confusion that put twenty-five Royal Temple pencils on the grid
// at 1:30 AM the day after the evening they meant.
//
// 🔴 EVERY ASSERTION HERE PINS A STRING, NOT A DATE. `expect(new Date(row.starts_at)).toEqual(...)`
// is the test that let this through: a wall clock and the instant it resolves to are both Dates, both
// valid, both the same type, and comparing Dates cannot tell them apart. The stored STRING can.

const LA = 'America/Los_Angeles'

const evening: EntryInput = {
  kind: 'pencil',
  title: 'Temple Moon: Full Moon Fire Circle',
  allDay: false,
  startDate: '2026-10-23',
  endDate: '2026-10-23',
  startTime: '18:30',
  endTime: '21:30',
  timeZone: LA,
  blocksTime: false,
  showPublicly: false,
}

function write(input: EntryInput) {
  const parsed = parseEntryInput(input)
  if ('error' in parsed) throw new Error(parsed.error)
  return parsed.data
}

/** The same date written the WRONG way: the true instant, stamped into the wall-clock column. */
function asInstant(input: EntryInput): StoredSpan {
  const good = write(input)
  return {
    all_day: good.all_day,
    time_zone: good.time_zone,
    starts_at: eventInstant(good.starts_at, good.time_zone)!.toISOString(),
    ends_at: eventInstant(good.ends_at, good.time_zone)!.toISOString(),
  }
}

describe('the one writer stores a wall clock', () => {
  it('keeps 6:30 PM as 18:30 UTC PARTS, and that is a different string from the instant', () => {
    const good = write(evening)
    expect(good.starts_at).toBe('2026-10-23T18:30:00.000Z')
    expect(good.ends_at).toBe('2026-10-23T21:30:00.000Z')
    // The instant the same evening resolves to. Storing THIS is the bug, and the strings differ.
    expect(eventInstant(good.starts_at, LA)!.toISOString()).toBe('2026-10-24T01:30:00.000Z')
    expect(good.starts_at).not.toBe(eventInstant(good.starts_at, LA)!.toISOString())
  })

  it('is not flagged by the audit, and a row it produced needs no repair', () => {
    expect(instantShapedSpan(write(evening))).toBeNull()
  })
})

describe('instantShapedSpan', () => {
  it('flags an instant-shaped write and returns the wall clock it meant', () => {
    const bad = asInstant(evening)
    expect(bad.starts_at).toBe('2026-10-24T01:30:00.000Z')
    expect(instantShapedSpan(bad)).toEqual({
      starts_at: '2026-10-23T18:30:00.000Z',
      ends_at: '2026-10-23T21:30:00.000Z',
    })
  })

  it('repairs a PST row and a PDT row to the SAME wall clock, which is the whole point', () => {
    const pdt = asInstant(evening)
    const pst = asInstant({ ...evening, startDate: '2026-11-27', endDate: '2026-11-27' })
    // Stored an hour apart, because an instant series drifts with the offset...
    expect(storedWallClock(pdt.starts_at)).toEqual({ hour: 1, minute: 30 })
    expect(storedWallClock(pst.starts_at)).toEqual({ hour: 2, minute: 30 })
    // ...and both mean 6:30 PM.
    expect(storedWallClock(instantShapedSpan(pdt)!.starts_at)).toEqual({ hour: 18, minute: 30 })
    expect(storedWallClock(instantShapedSpan(pst)!.starts_at)).toEqual({ hour: 18, minute: 30 })
  })

  it('leaves alone every row the predicate must not touch', () => {
    // An all-day span: 00:00 to 00:00, no time to get wrong.
    expect(instantShapedSpan(write({ ...evening, allDay: true, endDate: '2026-10-25' }))).toBeNull()
    // A daytime entry: the stored hour is nowhere near the dead of night.
    expect(instantShapedSpan(write({ ...evening, startTime: '10:00', endTime: '17:00' }))).toBeNull()
    // Not an intended start time (:07), so not an instant-shaped write of a real programme.
    expect(
      instantShapedSpan({ all_day: false, time_zone: LA, starts_at: '2026-10-24T01:37:00.000Z', ends_at: '2026-10-24T04:37:00.000Z' }),
    ).toBeNull()
    // A backwards span is a broken row, not this bug.
    expect(
      instantShapedSpan({ all_day: false, time_zone: LA, starts_at: '2026-10-24T01:30:00.000Z', ends_at: '2026-10-24T01:30:00.000Z' }),
    ).toBeNull()
    // An unparseable value flags nothing rather than throwing.
    expect(instantShapedSpan({ all_day: false, time_zone: LA, starts_at: 'not a time', ends_at: '2026-10-24T04:30:00.000Z' })).toBeNull()
  })

  it('⚠️ CANNOT tell a genuine 1:30 AM sit from the bug, and says so by flagging it', () => {
    // These are the same bytes as an instant-shaped 6:30 PM write. A Space that genuinely holds an
    // all-night sit at 1:30 AM gets flagged, which is why this predicate refuses nothing on its own
    // and why the repair migration is a one-off scoped to a reviewed set rather than a constraint.
    const sit: StoredSpan = { all_day: false, time_zone: LA, starts_at: '2026-10-24T01:30:00.000Z', ends_at: '2026-10-24T04:30:00.000Z' }
    expect(instantShapedSpan(sit)).not.toBeNull()
  })

  it('round-trips: wallClockOfInstant is the inverse of eventInstant', () => {
    for (const day of ['2026-10-23', '2026-11-27', '2027-03-13', '2027-03-14', '2027-11-06', '2027-11-07']) {
      const good = write({ ...evening, startDate: day, endDate: day })
      const back = wallClockOfInstant(eventInstant(good.starts_at, LA)!.toISOString(), LA)
      expect(back).toBe(good.starts_at)
    }
  })
})

describe('instantShapedSeriesTell', () => {
  it('a wall-clock series holds one time-of-day across a DST boundary', () => {
    const rows = ['2026-10-23', '2026-11-27', '2026-12-25'].map((d) => write({ ...evening, startDate: d, endDate: d }))
    expect(instantShapedSeriesTell(rows)).toBeNull()
  })

  it('an instant series does not, and that is the proof one row cannot give', () => {
    const rows = ['2026-10-23', '2026-11-27', '2026-12-25'].map((d) => asInstant({ ...evening, startDate: d, endDate: d }))
    expect(instantShapedSeriesTell(rows)).toEqual(['01:30', '02:30'])
  })
})

// ── THE TWENTY-FIVE PRODUCTION ROWS ─────────────────────────────────────────────────────────────
// Read out of production on 2026-09-27 (Space `royaltemple`, entries written 2026-09-25 01:34:55 and
// 01:35:13 UTC) and emitted as this table by the same SQL the repair migration runs, so the strings
// are not transcribed by hand. The migration and `instantShapedSpan` have to agree on every row:
// these are the values BOTH must produce. Every one of them meant 6:30 PM to 9:30 PM.
const PRODUCTION_ROWS: readonly [string, string, string, string, string][] = [
  ['Temple Moon: Full Moon Fire Circle', '2026-10-24T01:30:00.000Z', '2026-10-24T04:30:00.000Z', '2026-10-23T18:30:00.000Z', '2026-10-23T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2026-11-28T02:30:00.000Z', '2026-11-28T05:30:00.000Z', '2026-11-27T18:30:00.000Z', '2026-11-27T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2026-12-26T02:30:00.000Z', '2026-12-26T05:30:00.000Z', '2026-12-25T18:30:00.000Z', '2026-12-25T21:30:00.000Z'],
  ['The Celestial Table: New Moon in Capricorn', '2027-01-08T02:30:00.000Z', '2027-01-08T05:30:00.000Z', '2027-01-07T18:30:00.000Z', '2027-01-07T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-01-23T02:30:00.000Z', '2027-01-23T05:30:00.000Z', '2027-01-22T18:30:00.000Z', '2027-01-22T21:30:00.000Z'],
  ['The Celestial Table: Imbolc', '2027-02-02T02:30:00.000Z', '2027-02-02T05:30:00.000Z', '2027-02-01T18:30:00.000Z', '2027-02-01T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-02-20T02:30:00.000Z', '2027-02-20T05:30:00.000Z', '2027-02-19T18:30:00.000Z', '2027-02-19T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-03-20T01:30:00.000Z', '2027-03-20T04:30:00.000Z', '2027-03-19T18:30:00.000Z', '2027-03-19T21:30:00.000Z'],
  ['The Celestial Table: Spring Equinox (Ostara)', '2027-03-21T01:30:00.000Z', '2027-03-21T04:30:00.000Z', '2027-03-20T18:30:00.000Z', '2027-03-20T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-04-24T01:30:00.000Z', '2027-04-24T04:30:00.000Z', '2027-04-23T18:30:00.000Z', '2027-04-23T21:30:00.000Z'],
  ['The Celestial Table: Beltane', '2027-05-02T01:30:00.000Z', '2027-05-02T04:30:00.000Z', '2027-05-01T18:30:00.000Z', '2027-05-01T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-05-22T01:30:00.000Z', '2027-05-22T04:30:00.000Z', '2027-05-21T18:30:00.000Z', '2027-05-21T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-06-19T01:30:00.000Z', '2027-06-19T04:30:00.000Z', '2027-06-18T18:30:00.000Z', '2027-06-18T21:30:00.000Z'],
  ['The Celestial Table: Summer Solstice (Litha)', '2027-06-22T01:30:00.000Z', '2027-06-22T04:30:00.000Z', '2027-06-21T18:30:00.000Z', '2027-06-21T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-07-17T01:30:00.000Z', '2027-07-17T04:30:00.000Z', '2027-07-16T18:30:00.000Z', '2027-07-16T21:30:00.000Z'],
  ['The Celestial Table: Lammas', '2027-08-02T01:30:00.000Z', '2027-08-02T04:30:00.000Z', '2027-08-01T18:30:00.000Z', '2027-08-01T21:30:00.000Z'],
  ['The Celestial Table: Full Moon in Aquarius', '2027-08-18T01:30:00.000Z', '2027-08-18T04:30:00.000Z', '2027-08-17T18:30:00.000Z', '2027-08-17T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-08-21T01:30:00.000Z', '2027-08-21T04:30:00.000Z', '2027-08-20T18:30:00.000Z', '2027-08-20T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-09-18T01:30:00.000Z', '2027-09-18T04:30:00.000Z', '2027-09-17T18:30:00.000Z', '2027-09-17T21:30:00.000Z'],
  ['The Celestial Table: Autumn Equinox (Mabon)', '2027-09-23T01:30:00.000Z', '2027-09-23T04:30:00.000Z', '2027-09-22T18:30:00.000Z', '2027-09-22T21:30:00.000Z'],
  ['Temple Moon: Full Moon Fire Circle', '2027-10-16T01:30:00.000Z', '2027-10-16T04:30:00.000Z', '2027-10-15T18:30:00.000Z', '2027-10-15T21:30:00.000Z'],
  ['The Celestial Table: Samhain', '2027-11-02T01:30:00.000Z', '2027-11-02T04:30:00.000Z', '2027-11-01T18:30:00.000Z', '2027-11-01T21:30:00.000Z'],
  ['The Celestial Table: Scorpio Season Full Moon', '2027-11-14T02:30:00.000Z', '2027-11-14T05:30:00.000Z', '2027-11-13T18:30:00.000Z', '2027-11-13T21:30:00.000Z'],
  ['The Celestial Table: Winter Solstice (Yule)', '2027-12-22T02:30:00.000Z', '2027-12-22T05:30:00.000Z', '2027-12-21T18:30:00.000Z', '2027-12-21T21:30:00.000Z'],
  ['The Celestial Table: Full Moon in Cancer', '2028-01-12T02:30:00.000Z', '2028-01-12T05:30:00.000Z', '2028-01-11T18:30:00.000Z', '2028-01-11T21:30:00.000Z'],
]

describe('the production rows LIVE-514 repairs', () => {
  it('is twenty-five rows, all meaning 6:30 PM to 9:30 PM', () => {
    expect(PRODUCTION_ROWS).toHaveLength(25)
    for (const [title, , , fixedStart, fixedEnd] of PRODUCTION_ROWS) {
      expect(storedWallClock(fixedStart), title).toEqual({ hour: 18, minute: 30 })
      expect(storedWallClock(fixedEnd), title).toEqual({ hour: 21, minute: 30 })
    }
  })

  it('every one is flagged and repaired to the pinned wall clock', () => {
    for (const [title, storedStart, storedEnd, fixedStart, fixedEnd] of PRODUCTION_ROWS) {
      const row: StoredSpan = { all_day: false, time_zone: LA, starts_at: storedStart, ends_at: storedEnd }
      expect(instantShapedSpan(row), title).toEqual({ starts_at: fixedStart, ends_at: fixedEnd })
    }
  })

  it('the repair is a fixed point: running it twice changes nothing', () => {
    for (const [title, storedStart, storedEnd] of PRODUCTION_ROWS) {
      const once = instantShapedSpan({ all_day: false, time_zone: LA, starts_at: storedStart, ends_at: storedEnd })!
      expect(instantShapedSpan({ all_day: false, time_zone: LA, ...once }), title).toBeNull()
    }
  })

  it('the series tell fires on the thirteen Temple Moon rows as stored, and not once repaired', () => {
    const moon = PRODUCTION_ROWS.filter(([t]) => t.startsWith('Temple Moon'))
    expect(moon).toHaveLength(13)
    const stored = moon.map(([, s, e]) => ({ all_day: false, time_zone: LA, starts_at: s, ends_at: e }))
    expect(instantShapedSeriesTell(stored)).toEqual(['01:30', '02:30'])
    const repaired = moon.map(([, , , s, e]) => ({ all_day: false, time_zone: LA, starts_at: s, ends_at: e }))
    expect(instantShapedSeriesTell(repaired)).toBeNull()
  })
})

// ── THE WRITERS ─────────────────────────────────────────────────────────────────────────────────
// Nothing in the repo wrote these rows (`git log --all -S member_cents` is empty; every insert goes
// through `parseEntryInput`). These two keep it that way, because the confusion is invisible to types.

describe('only one module composes a stored calendar time', () => {
  const WRITERS = [
    'lib/calendar/entries.ts',
    'lib/calendar/entries-store.ts',
    'lib/calendar/plans-store.ts',
    'lib/calendar/pencil-series.ts',
    'app/(main)/spaces/[slug]/settings/calendar/entry-actions.ts',
    'app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts',
    'app/(main)/spaces/[slug]/settings/calendar/vera-calendar-actions.ts',
  ]

  it('never assigns starts_at or ends_at a value resolved through a time zone', () => {
    for (const path of WRITERS) {
      const src = readFileSync(path, 'utf8')
      const offenders = src
        .split('\n')
        .filter((line) => /\b(?:starts_at|ends_at)\s*:/.test(line) && /eventInstant|zonedWallClockToInstant|at time zone/.test(line))
      expect(offenders, `${path} resolves a stored calendar time through a zone`).toEqual([])
    }
  })

  it('every migration that INSERTS an entry spells its timestamps as UTC parts', () => {
    const dir = 'supabase/migrations'
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    expect(files.length).toBeGreaterThan(400) // a walk that lost its root must not print green
    let checked = 0
    for (const file of files) {
      const src = readFileSync(`${dir}/${file}`, 'utf8')
      if (!/insert\s+into\s+public\.space_calendar_entries/i.test(src)) continue
      checked += 1
      const stamps = src.match(/'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?[^']*'/g) ?? []
      const naive = stamps.filter((s) => !/Z'$/.test(s))
      expect(naive, `${file} writes a calendar time that is not spelled as UTC parts`).toEqual([])
      expect(/at\s+time\s+zone/i.test(src), `${file} resolves a calendar time through a zone`).toBe(false)
    }
    expect(checked, 'no migration inserts a calendar entry any more — is this test still aimed at anything?').toBeGreaterThan(0)
  })
})
