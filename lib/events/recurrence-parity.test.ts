import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { expandOccurrenceInstants } from '@/lib/event-recurrence'
import { nextOccurrence, type RecurrenceType } from '@/lib/events/recurrence'
import { computeSeriesDayKeys } from '@/lib/events/calendar-repeats'

// THE RECURRENCE PARITY GATE.
//
// The simple enum recurrence model (ADR-007: none/daily/weekly/monthly) is stepped by THREE
// private, deliberately parallel copies of the same maths:
//
//   • lib/event-recurrence.ts     `occurrenceAt` + `daysInUTCMonth` — the WRITE side. It mints the
//                                  materialised occurrence rows the cron and the create action insert.
//   • lib/events/recurrence.ts    `occurrenceAt` + `daysInUTCMonth` — the READ side. It computes the
//                                  "next date" the event card and the event page show for a series
//                                  whose anchor has passed. Its own header says: "Mirrors
//                                  lib/event-recurrence.ts so monthly maths agrees."
//   • lib/events/calendar-repeats.ts `stepKey` + `daysInUTCMonth` — the calendar strip's day keys.
//
// `app/(main)/events/actions.ts` imports two of them. Until this file existed, the mirror was a
// promise in a comment: nothing would notice if the monthly clamp, the leap-day rule, or the
// `until` bound were fixed on one side only, and the consequence of that is the worst kind of
// disagreement, a materialised row on one date and a card announcing another. AGENTS.md: every
// fail-safe needs a gate that notices it fired. This is that gate.
//
// The helpers are private on purpose (nothing outside each module should step a series), so the
// gate drives each module through its PUBLIC seam and asserts byte-equal ISO output:
//
//   write side: expandOccurrenceInstants(anchor, bound)        -> every occurrence after the anchor
//   read side:  nextOccurrence(anchor, now = previous + 1ms)   -> walked one occurrence at a time
//   calendar:   computeSeriesDayKeys(anchor, after..through)   -> the same series as YYYY-MM-DD keys
//
// Fixtures are chosen to hit every seam the maths has: a 31st anchor across short months, Feb 29
// in a leap and a non-leap year, a December anchor crossing the year, weekly runs across the
// spring-forward and fall-back Sundays of America/Los_Angeles and Europe/London, a daily run across
// a DST change, `until` bounds that land exactly ON an occurrence, and millisecond precision.
//
// ── 2026-09-10: THE THREE COPIES ARE ONE ENGINE NOW, AND THE TABLE GREW THE SHAPE IT ASKED FOR ──
// This header used to end: "The model has no weekday-ordinal rule ('second Tuesday'), so there is
// nothing of that shape to pin; if one is ever added it belongs in this table on the day it lands."
// One landed (ADR-1299), and it is in the table below.
//
// The three private copies also went: all three modules delegate to lib/events/repeat-rule.ts. That
// makes agreement structural rather than coincidental, and it does NOT make this gate redundant —
// it changes what it guards. It still proves the three PUBLIC seams answer identically, which is
// the property every caller actually depends on and which a delegation can break on its own
// (a bound applied on one side and not another, an anchor included here and excluded there, a day
// key taken from the wrong end of an instant). LIVE-154 was exactly that class of bug and involved
// no arithmetic at all. And if a fourth copy is ever pasted back in, this is still what notices.
//
// The whole table runs THREE times, under UTC, America/Los_Angeles and Europe/London, because the
// storage convention (lib/time/zone.ts) keeps a series' wall-clock as UTC PARTS and the maths must
// therefore be blind to the process zone. A copy that ever reached for a local-time getter would
// pass under UTC and fail under the other two.
//
// If this file goes red the copies ALREADY DISAGREE in production. Do not "fix" whichever side is
// cheapest to change; the disagreeing fixture, with both outputs, is the finding. When the strip
// diverged on the `until` bound (LIVE-154), the direction was settled by ADR-807 — the mirrors and
// the published .ics feeds carry the ruling, so the strip was the one that moved.

type Fixture = {
  name: string
  startsAt: string
  type: RecurrenceType
  /** The RRULE value on `events.recurrence_rule`, for a fixture that pins a rule the coarse cadence
   *  cannot express. Absent means the row carries only its legacy cadence, which is what every event
   *  written before ADR-1299 has — so the fixtures without one are still testing the OLD model, on
   *  purpose: that is what production holds. */
  rule?: string
  until: string | null
  /** Inclusive upper bound handed to the write side (the materialiser's horizon). */
  bound: string
  /** The exact series both sides must produce (ISO), when the fixture pins one. */
  expect?: string[]
}

const FIXTURES: Fixture[] = [
  {
    name: 'monthly on the 31st clamps to Feb 28 (non-leap), then returns to the 31st',
    startsAt: '2027-01-31T09:00:00.000Z',
    type: 'monthly',
    until: null,
    bound: '2028-03-31T09:00:00.000Z',
    expect: [
      '2027-02-28T09:00:00.000Z',
      '2027-03-31T09:00:00.000Z',
      '2027-04-30T09:00:00.000Z',
      '2027-05-31T09:00:00.000Z',
      '2027-06-30T09:00:00.000Z',
      '2027-07-31T09:00:00.000Z',
      '2027-08-31T09:00:00.000Z',
      '2027-09-30T09:00:00.000Z',
      '2027-10-31T09:00:00.000Z',
      '2027-11-30T09:00:00.000Z',
      '2027-12-31T09:00:00.000Z',
      '2028-01-31T09:00:00.000Z',
      '2028-02-29T09:00:00.000Z',
      '2028-03-31T09:00:00.000Z',
    ],
  },
  {
    name: 'monthly anchored on Feb 29 (leap year) lands Feb 28 in the non-leap year and Feb 29 again in the next leap year',
    startsAt: '2028-02-29T18:30:00.000Z',
    type: 'monthly',
    until: null,
    bound: '2032-02-29T18:30:00.000Z',
  },
  {
    name: 'monthly on the 30th clamps only February',
    startsAt: '2027-03-30T07:15:00.000Z',
    type: 'monthly',
    until: null,
    bound: '2028-03-30T07:15:00.000Z',
    expect: [
      '2027-04-30T07:15:00.000Z',
      '2027-05-30T07:15:00.000Z',
      '2027-06-30T07:15:00.000Z',
      '2027-07-30T07:15:00.000Z',
      '2027-08-30T07:15:00.000Z',
      '2027-09-30T07:15:00.000Z',
      '2027-10-30T07:15:00.000Z',
      '2027-11-30T07:15:00.000Z',
      '2027-12-30T07:15:00.000Z',
      '2028-01-30T07:15:00.000Z',
      '2028-02-29T07:15:00.000Z',
      '2028-03-30T07:15:00.000Z',
    ],
  },
  {
    name: 'monthly December anchor crosses the year boundary',
    startsAt: '2026-12-31T23:45:00.000Z',
    type: 'monthly',
    until: null,
    bound: '2027-04-30T23:45:00.000Z',
    expect: [
      '2027-01-31T23:45:00.000Z',
      '2027-02-28T23:45:00.000Z',
      '2027-03-31T23:45:00.000Z',
      '2027-04-30T23:45:00.000Z',
    ],
  },
  {
    name: 'monthly on the 1st with an until that lands exactly on an occurrence (inclusive)',
    startsAt: '2027-05-01T12:00:00.000Z',
    type: 'monthly',
    until: '2027-09-01T12:00:00.000Z',
    bound: '2028-05-01T12:00:00.000Z',
    expect: [
      '2027-06-01T12:00:00.000Z',
      '2027-07-01T12:00:00.000Z',
      '2027-08-01T12:00:00.000Z',
      '2027-09-01T12:00:00.000Z',
    ],
  },
  {
    name: 'monthly with an until one millisecond before an occurrence excludes it',
    startsAt: '2027-05-15T12:00:00.000Z',
    type: 'monthly',
    until: '2027-08-15T11:59:59.999Z',
    bound: '2028-05-15T12:00:00.000Z',
    expect: ['2027-06-15T12:00:00.000Z', '2027-07-15T12:00:00.000Z'],
  },
  {
    // 🔴 THE PRODUCTION SHAPE, and the fixture that closed LIVE-154. The event form's "repeat end
    // date" is a date-only input, and app/(main)/events/actions.ts stores it through
    // dateToWallClockIso as `YYYY-MM-DDT00:00:00Z`. So for any series whose wall-clock is later
    // than midnight (all of them), the end date's own occurrence falls AFTER `until` as an instant
    // and is not part of the series. Found by this gate on 2026-09-04, when the calendar strip
    // compared `until` at day granularity and kept 2027-06-24 — a chip for a date nothing
    // materialises. ADR-807 already ruled the instant reading canon ("`recurrence_until` resolves
    // through the zone to the same instant the RRULE `UNTIL` carries") and the published .ics feeds
    // ship it, so the strip was brought into line; all three copies now produce the same series.
    name: 'weekly with a date-only until (the form\'s shape): the end date itself is excluded by all three copies',
    startsAt: '2027-06-03T19:00:00.000Z',
    type: 'weekly',
    until: '2027-06-24T00:00:00.000Z',
    bound: '2027-12-31T00:00:00.000Z',
    expect: ['2027-06-10T19:00:00.000Z', '2027-06-17T19:00:00.000Z'],
  },
  {
    name: 'weekly with an end date',
    startsAt: '2027-03-04T19:00:00.000Z',
    type: 'weekly',
    until: '2027-05-27T19:00:00.000Z',
    bound: '2027-12-31T00:00:00.000Z',
    expect: [
      '2027-03-11T19:00:00.000Z',
      '2027-03-18T19:00:00.000Z',
      '2027-03-25T19:00:00.000Z',
      '2027-04-01T19:00:00.000Z',
      '2027-04-08T19:00:00.000Z',
      '2027-04-15T19:00:00.000Z',
      '2027-04-22T19:00:00.000Z',
      '2027-04-29T19:00:00.000Z',
      '2027-05-06T19:00:00.000Z',
      '2027-05-13T19:00:00.000Z',
      '2027-05-20T19:00:00.000Z',
      '2027-05-27T19:00:00.000Z',
    ],
  },
  {
    // America/Los_Angeles springs forward 2027-03-14 and falls back 2027-11-07.
    name: 'weekly across the America/Los_Angeles spring-forward Sunday (wall-clock 7pm, kept as UTC parts)',
    startsAt: '2027-03-07T19:00:00.000Z',
    type: 'weekly',
    until: null,
    bound: '2027-04-18T19:00:00.000Z',
  },
  {
    name: 'weekly across the America/Los_Angeles fall-back Sunday',
    startsAt: '2027-10-31T02:30:00.000Z',
    type: 'weekly',
    until: null,
    bound: '2027-12-05T02:30:00.000Z',
  },
  {
    // Europe/London: BST starts 2027-03-28 and ends 2027-10-31.
    name: 'weekly across the Europe/London BST start',
    startsAt: '2027-03-21T01:30:00.000Z',
    type: 'weekly',
    until: null,
    bound: '2027-05-02T01:30:00.000Z',
  },
  {
    name: 'weekly across the Europe/London BST end',
    startsAt: '2027-10-24T01:30:00.000Z',
    type: 'weekly',
    until: null,
    bound: '2027-11-28T01:30:00.000Z',
  },
  {
    name: 'daily across the America/Los_Angeles fall-back night, with an until',
    startsAt: '2027-11-04T06:00:00.000Z',
    type: 'daily',
    until: '2027-11-12T06:00:00.000Z',
    bound: '2027-12-31T00:00:00.000Z',
    expect: [
      '2027-11-05T06:00:00.000Z',
      '2027-11-06T06:00:00.000Z',
      '2027-11-07T06:00:00.000Z',
      '2027-11-08T06:00:00.000Z',
      '2027-11-09T06:00:00.000Z',
      '2027-11-10T06:00:00.000Z',
      '2027-11-11T06:00:00.000Z',
      '2027-11-12T06:00:00.000Z',
    ],
  },
  {
    name: 'daily across a month end and a leap day',
    startsAt: '2028-02-26T20:00:00.000Z',
    type: 'daily',
    until: null,
    bound: '2028-03-03T20:00:00.000Z',
    expect: [
      '2028-02-27T20:00:00.000Z',
      '2028-02-28T20:00:00.000Z',
      '2028-02-29T20:00:00.000Z',
      '2028-03-01T20:00:00.000Z',
      '2028-03-02T20:00:00.000Z',
      '2028-03-03T20:00:00.000Z',
    ],
  },
  {
    name: 'millisecond precision survives every cadence (monthly)',
    startsAt: '2027-07-31T09:00:00.123Z',
    type: 'monthly',
    until: null,
    bound: '2027-10-31T09:00:00.123Z',
    expect: ['2027-08-31T09:00:00.123Z', '2027-09-30T09:00:00.123Z', '2027-10-31T09:00:00.123Z'],
  },
  {
    name: 'an anchor written with a zone offset is parsed to the same instant on both sides',
    startsAt: '2027-01-31T09:00:00+05:00',
    type: 'monthly',
    until: null,
    bound: '2027-04-30T04:00:00.000Z',
    expect: ['2027-02-28T04:00:00.000Z', '2027-03-31T04:00:00.000Z', '2027-04-30T04:00:00.000Z'],
  },

  // ── THE RULE FIXTURES (ADR-1299) — the shapes the four-value enum could not say ────────────────
  // Each carries the coarse mirror its writers would have stamped beside the rule, exactly as a row
  // in the database does, so these also prove the mirror is consulted only when the rule is absent.
  {
    name: 'every other Wednesday (INTERVAL=2) skips the alternate weeks the enum would have minted',
    startsAt: '2026-09-16T10:00:00.000Z', // a Wednesday
    type: 'weekly',
    rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE',
    until: null,
    bound: '2026-11-25T10:00:00.000Z',
    expect: [
      '2026-09-30T10:00:00.000Z',
      '2026-10-14T10:00:00.000Z',
      '2026-10-28T10:00:00.000Z',
      '2026-11-11T10:00:00.000Z',
      '2026-11-25T10:00:00.000Z',
    ],
  },
  {
    name: 'the third Thursday of the month walks the ordinal, not a fixed date',
    startsAt: '2026-09-17T19:00:00.000Z', // the third Thursday of September 2026
    type: 'monthly',
    rule: 'FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3',
    until: null,
    bound: '2027-02-28T19:00:00.000Z',
    expect: [
      '2026-10-15T19:00:00.000Z',
      '2026-11-19T19:00:00.000Z',
      '2026-12-17T19:00:00.000Z',
      '2027-01-21T19:00:00.000Z',
      '2027-02-18T19:00:00.000Z',
    ],
  },
  {
    name: 'the LAST Friday of the month, which is a different date from the fourth in five of these months',
    startsAt: '2026-09-25T18:00:00.000Z',
    type: 'monthly',
    rule: 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
    until: null,
    bound: '2027-01-29T18:00:00.000Z',
    expect: [
      '2026-10-30T18:00:00.000Z',
      '2026-11-27T18:00:00.000Z',
      '2026-12-25T18:00:00.000Z',
      '2027-01-29T18:00:00.000Z',
    ],
  },
  {
    name: 'every weekday lands five times a week and never on a weekend, across a month boundary',
    startsAt: '2026-09-28T08:00:00.000Z', // a Monday
    type: 'weekly',
    rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    until: null,
    bound: '2026-10-06T08:00:00.000Z',
    expect: [
      '2026-09-29T08:00:00.000Z',
      '2026-09-30T08:00:00.000Z',
      '2026-10-01T08:00:00.000Z',
      '2026-10-02T08:00:00.000Z',
      '2026-10-05T08:00:00.000Z',
      '2026-10-06T08:00:00.000Z',
    ],
  },
  {
    name: 'COUNT bounds the series including the anchor, so a six-week course mints five more dates',
    startsAt: '2026-10-07T17:30:00.000Z',
    type: 'weekly',
    rule: 'FREQ=WEEKLY;BYDAY=WE;COUNT=6',
    until: null,
    bound: '2027-06-01T17:30:00.000Z',
    expect: [
      '2026-10-14T17:30:00.000Z',
      '2026-10-21T17:30:00.000Z',
      '2026-10-28T17:30:00.000Z',
      '2026-11-04T17:30:00.000Z',
      '2026-11-11T17:30:00.000Z',
    ],
  },
  {
    name: 'a weekly rule across the US spring-forward Sunday keeps its wall clock, like the enum fixtures',
    startsAt: '2027-03-07T02:30:00.000Z',
    type: 'weekly',
    rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU',
    until: null,
    bound: '2027-05-02T02:30:00.000Z',
    expect: [
      '2027-03-21T02:30:00.000Z',
      '2027-04-04T02:30:00.000Z',
      '2027-04-18T02:30:00.000Z',
      '2027-05-02T02:30:00.000Z',
    ],
  },
  {
    name: 'an UNREADABLE rule falls back to the coarse cadence rather than half-honouring itself',
    startsAt: '2026-09-16T10:00:00.000Z',
    type: 'weekly',
    rule: 'FREQ=FORTNIGHTLY;EVERY=2',
    until: null,
    bound: '2026-10-14T10:00:00.000Z',
    // Plain weekly on the anchor's own weekday: what `recurrence_type` says, which is the safe
    // answer when the rule cannot be trusted. All three seams must agree on THAT, not each guess.
    expect: [
      '2026-09-23T10:00:00.000Z',
      '2026-09-30T10:00:00.000Z',
      '2026-10-07T10:00:00.000Z',
      '2026-10-14T10:00:00.000Z',
    ],
  },
]

const iso = (d: Date) => d.toISOString()
const dayKey = (s: string) => s.slice(0, 10)

/** The write side: every occurrence after the anchor, up to and including `bound`. */
function writeSide(f: Fixture): string[] {
  return expandOccurrenceInstants(
    { starts_at: f.startsAt, recurrence_type: f.type, recurrence_until: f.until, recurrence_rule: f.rule ?? null },
    new Date(f.bound),
  ).map(iso)
}

/** The read side, walked: ask for the next occurrence strictly after the one just found, so the
 *  series is reconstructed one `nextOccurrence` call at a time and the anchor (step 0) is excluded
 *  exactly as the write side excludes it. */
function readSide(f: Fixture): string[] {
  const anchor = {
    startsAt: f.startsAt,
    recurrenceType: f.type,
    recurrenceUntil: f.until,
    recurrenceRule: f.rule ?? null,
  }
  const limit = new Date(f.bound).getTime()
  const out: string[] = []
  let now = new Date(new Date(f.startsAt).getTime() + 1)
  // The read side's own MAX_STEPS bounds each call; this guard only bounds the walk itself.
  for (let guard = 0; guard < 1000; guard++) {
    const next = nextOccurrence(anchor, now)
    if (!next || next.getTime() > limit) break
    out.push(iso(next))
    now = new Date(next.getTime() + 1)
  }
  return out
}

/** The calendar strip: the same series as day keys, strictly after the anchor's day and through
 *  the bound's day. */
function calendarSide(f: Fixture): string[] {
  return computeSeriesDayKeys(
    { starts_at: f.startsAt, recurrence_type: f.type, recurrence_until: f.until, recurrence_rule: f.rule ?? null },
    { afterDayKey: dayKey(new Date(f.startsAt).toISOString()), throughDayKey: dayKey(new Date(f.bound).toISOString()) },
  )
}

for (const zone of ['UTC', 'America/Los_Angeles', 'Europe/London']) {
  describe(`recurrence parity under TZ=${zone}`, () => {
    let savedTz: string | undefined
    beforeAll(() => {
      savedTz = process.env.TZ
      process.env.TZ = zone
    })
    afterAll(() => {
      if (savedTz === undefined) delete process.env.TZ
      else process.env.TZ = savedTz
    })

    // Positive control for the zone switch itself: a fixed instant reads a different local hour
    // under the three zones, so a getter that leaked local time into the maths WOULD be caught.
    it('the process zone really changed (control)', () => {
      const localHour = new Date('2027-03-14T12:00:00.000Z').getHours()
      expect(localHour).toBe(zone === 'UTC' ? 12 : zone === 'Europe/London' ? 12 : 5)
    })

    for (const f of FIXTURES) {
      it(`write side and read side agree: ${f.name}`, () => {
        const write = writeSide(f)
        const read = readSide(f)

        // The gate: byte-equal ISO output from both private copies of the maths.
        expect(read).toEqual(write)

        // Every fixture must actually step the series; an empty pair would agree by saying nothing.
        expect(write.length).toBeGreaterThan(0)

        // UTC-parts convention: the wall-clock never moves across a DST change on either side.
        const anchorClock = new Date(f.startsAt).toISOString().slice(11)
        for (const s of write) expect(s.slice(11)).toBe(anchorClock)

        // Where the fixture pins the exact series, both sides must produce THAT, not merely agree.
        if (f.expect) expect(write).toEqual(f.expect)
      })

      // The calendar strip's day keys are the same series, so a third copy cannot drift alone.
      // Every fixture is held to this, with no exemptions: the last two exemptions (an `until` a
      // millisecond before an occurrence, and the form's date-only `until`) came off on 2026-09-07
      // when the strip was taught to compare `recurrence_until` at the INSTANT, the rule ADR-807
      // already gave the mirrors and the .ics feeds (LIVE-154). If a future divergence needs
      // pinning, pin it with a failing fixture, not a marker that turns the gate off.
      it(`calendar strip agrees: ${f.name}`, () =>
        expect(calendarSide(f)).toEqual(writeSide(f).map(dayKey)))
    }

    it('a one-time event yields nothing on either side', () => {
      const anchor = { starts_at: '2027-01-31T09:00:00.000Z', recurrence_type: 'none' as const, recurrence_until: null }
      expect(expandOccurrenceInstants(anchor, new Date('2030-01-01T00:00:00.000Z'))).toEqual([])
      expect(
        nextOccurrence(
          { startsAt: anchor.starts_at, recurrenceType: 'none', recurrenceUntil: null },
          new Date('2026-01-01T00:00:00.000Z'),
        ),
      ).toBeNull()
    })
  })
}
