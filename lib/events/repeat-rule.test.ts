import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAX_REPEAT_OCCURRENCES,
  coarseRecurrence,
  describeRepeat,
  expandRepeat,
  formatRepeat,
  formatRepeatDraft,
  matchRepeatPreset,
  nextRepeatOccurrence,
  parseRepeat,
  repeatChipLabel,
  repeatFor,
  repeatFromLegacy,
  repeatPresets,
  repeatUntilDate,
  type RepeatRule,
} from './repeat-rule'

// THE REPEAT ENGINE (ADR-1299). Three things are worth testing here and the third is the one that
// matters most:
//
//   1. the PARSER is a trust boundary — it runs on a form post and on a text column, and every
//      caller that gets null falls back to the coarse cadence, so a half-understood rule must never
//      come back. Most of this file is rejection cases.
//   2. the EXPANDER answers the two shapes the four-value enum could not say, plus the one place it
//      deliberately departs from RFC 5545 (the short-month clamp).
//   3. the LEGACY BRIDGE is exact. 100% of the rows in production carry only the enum, so
//      `repeatFromLegacy` is not a compatibility shim, it is the main path — and a drift there
//      silently re-dates every established series.
//
// Series-wide agreement between this engine and its three consumers is lib/events/recurrence-parity.test.ts.

const WED = '2026-09-16T10:00:00.000Z' // a Wednesday
const iso = (d: Date) => d.toISOString()
const run = (start: string, rule: RepeatRule | null, through: string, opts = {}) =>
  expandRepeat(start, rule, { through: new Date(through), ...opts }).map(iso)

describe('the parser refuses anything it cannot fully honour', () => {
  it('reads the subset, prefix optional, case-insensitive, whitespace-tolerant', () => {
    expect(parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')).toEqual({
      freq: 'WEEKLY', interval: 2, byDay: ['WE'],
    })
    expect(parseRepeat('RRULE:freq=monthly;byday=th;bysetpos=3')).toEqual({
      freq: 'MONTHLY', interval: 1, byDay: ['TH'], bySetPos: 3,
    })
    expect(parseRepeat('  FREQ=DAILY ; INTERVAL=3 ; COUNT=10  ')).toEqual({
      freq: 'DAILY', interval: 3, count: 10,
    })
  })

  it('🔴 returns null rather than a partial rule, which is what makes the fallback safe', () => {
    for (const bad of [
      '', '   ', null, undefined,
      'FREQ=FORTNIGHTLY',              // not a frequency
      'INTERVAL=2;BYDAY=WE',           // no FREQ at all
      'FREQ=WEEKLY;WKST=MO',           // outside the subset: honouring the rest would drop a rule
      'FREQ=WEEKLY;BYYEARDAY=200',     // ditto
      'FREQ=WEEKLY;INTERVAL=0',        // an interval of zero is not a series
      'FREQ=WEEKLY;INTERVAL=-1',
      'FREQ=WEEKLY;COUNT=0',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=WEEKLY;BYDAY=3TH',         // the ordinal belongs in BYSETPOS; one way to say a thing
      'FREQ=WEEKLY;BYMONTHDAY=3',      // a weekly rule has no day of the month
      'FREQ=DAILY;BYDAY=MO',           // nor does a daily one have a weekday
      'FREQ=MONTHLY;BYSETPOS=3',       // an ordinal with nothing to count
      'FREQ=MONTHLY;BYDAY=TH',         // a weekday with no ordinal is ambiguous, not "every Thursday"
      'FREQ=MONTHLY;BYDAY=TH,FR;BYSETPOS=3',
      'FREQ=MONTHLY;BYMONTHDAY=3;BYDAY=TH;BYSETPOS=1', // two answers to one question
      'FREQ=MONTHLY;BYMONTH=3',        // a month of the year is a YEARLY idea
      'FREQ=MONTHLY;BYMONTHDAY=32',
      'FREQ=YEARLY;BYMONTH=13',
      'FREQ=WEEKLY;FREQ=DAILY',        // a repeated key has no single meaning
      'FREQ',                          // no '='
    ]) {
      expect(parseRepeat(bad as string), `${bad}`).toBeNull()
    }
  })

  it('rejects BYSETPOS=5, because "the fifth Monday" is a date most months do not have', () => {
    // The picker offers "last" instead, which is what a host means and what every month has.
    expect(parseRepeat('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5')).toBeNull()
    expect(parseRepeat('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-1')).not.toBeNull()
    expect(parseRepeat('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=-2')).toBeNull()
  })

  it('accepts and DROPS the transport-only UNTIL, which `repeatUntilDate` reads separately', () => {
    // The end lives in `events.recurrence_until`; UNTIL exists so the picker can hand one string to
    // a form. A stored rule that somehow carries it still parses, and canonicalising drops it.
    const r = parseRepeat('FREQ=WEEKLY;BYDAY=WE;UNTIL=20261230')!
    expect(r).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['WE'] })
    expect(formatRepeat(r)).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(repeatUntilDate('FREQ=WEEKLY;BYDAY=WE;UNTIL=20261230')).toBe('2026-12-30')
    expect(repeatUntilDate('FREQ=WEEKLY;UNTIL=20261230T235959Z')).toBe('2026-12-30')
    expect(repeatUntilDate('FREQ=WEEKLY;BYDAY=WE')).toBeNull()
    expect(repeatUntilDate('FREQ=WEEKLY;UNTIL=20261330')).toBeNull()
  })
})

describe('formatting is canonical, so one rule has exactly one string', () => {
  it('orders the parts and the weekdays, and drops the default interval', () => {
    expect(formatRepeat(parseRepeat('BYDAY=WE,MO;FREQ=WEEKLY;INTERVAL=2')!)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(formatRepeat({ freq: 'DAILY', interval: 1 })).toBe('FREQ=DAILY')
  })

  it('round-trips: parse(format(r)) is r, for every shape the subset admits', () => {
    for (const text of [
      'FREQ=DAILY', 'FREQ=DAILY;INTERVAL=3;COUNT=10',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE',
      'FREQ=MONTHLY;BYMONTHDAY=31', 'FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3', 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
      'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=16',
    ]) {
      const r = parseRepeat(text)!
      expect(r, text).not.toBeNull()
      expect(formatRepeat(r), text).toBe(text)
      expect(parseRepeat(formatRepeat(r)), text).toEqual(r)
    }
  })

  it('formatRepeatDraft joins the end back on, and only when it is a real date', () => {
    const r = parseRepeat('FREQ=WEEKLY;BYDAY=WE')!
    expect(formatRepeatDraft(r, '2026-12-30')).toBe('FREQ=WEEKLY;BYDAY=WE;UNTIL=20261230')
    expect(formatRepeatDraft(r, null)).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(formatRepeatDraft(r, 'soon')).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(formatRepeatDraft(null, '2026-12-30')).toBe('')
  })
})

describe('the shapes the four-value enum could not say', () => {
  it('🔴 every other Wednesday', () => {
    expect(run(WED, parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'), '2026-11-25T23:00:00Z')).toEqual([
      '2026-09-16T10:00:00.000Z',
      '2026-09-30T10:00:00.000Z',
      '2026-10-14T10:00:00.000Z',
      '2026-10-28T10:00:00.000Z',
      '2026-11-11T10:00:00.000Z',
      '2026-11-25T10:00:00.000Z',
    ])
  })

  it('🔴 the third Thursday of the month — a different DATE every month', () => {
    expect(run('2026-09-17T19:00:00.000Z', parseRepeat('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3'), '2027-01-31T23:00:00Z')).toEqual([
      '2026-09-17T19:00:00.000Z',
      '2026-10-15T19:00:00.000Z',
      '2026-11-19T19:00:00.000Z',
      '2026-12-17T19:00:00.000Z',
      '2027-01-21T19:00:00.000Z',
    ])
  })

  it('🔴 the LAST Friday, which is the fifth in the months that have one', () => {
    const dates = run('2026-10-30T18:00:00.000Z', parseRepeat('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1'), '2027-05-01T00:00:00Z')
    expect(dates).toEqual([
      '2026-10-30T18:00:00.000Z',
      '2026-11-27T18:00:00.000Z',
      '2026-12-25T18:00:00.000Z',
      '2027-01-29T18:00:00.000Z',
      '2027-02-26T18:00:00.000Z',
      '2027-03-26T18:00:00.000Z',
      '2027-04-30T18:00:00.000Z',
    ])
    // Every one of them really is a Friday, and really is in the last week of its month.
    for (const s of dates) {
      const d = new Date(s)
      expect(d.getUTCDay(), s).toBe(5)
      const monthLength = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
      expect(d.getUTCDate() + 7, s).toBeGreaterThan(monthLength)
    }
  })

  it('a month with no fifth of that weekday is SKIPPED, not the end of the series', () => {
    // The parser refuses BYSETPOS=5, so the skip is reached through "last" never being absent and
    // through a rule built in code. This is the branch, exercised directly.
    const fifth: RepeatRule = { freq: 'MONTHLY', interval: 1, byDay: ['MO'], bySetPos: 4 }
    const dates = run('2026-09-28T09:00:00.000Z', fifth, '2027-02-01T00:00:00Z')
    expect(dates.length).toBeGreaterThan(3)
    for (const s of dates) expect(new Date(s).getUTCDay(), s).toBe(1)
  })

  it('every weekday, and never a weekend', () => {
    const dates = run('2026-09-28T08:00:00.000Z', parseRepeat('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), '2026-10-09T23:00:00Z')
    expect(dates).toHaveLength(10)
    for (const s of dates) expect([1, 2, 3, 4, 5]).toContain(new Date(s).getUTCDay())
  })

  it('annually, on the anchor’s own date', () => {
    expect(run(WED, parseRepeat('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=16'), '2029-12-31T00:00:00Z')).toEqual([
      '2026-09-16T10:00:00.000Z',
      '2027-09-16T10:00:00.000Z',
      '2028-09-16T10:00:00.000Z',
      '2029-09-16T10:00:00.000Z',
    ])
  })
})

describe('the one departure from RFC 5545, and it is deliberate', () => {
  it('🔴 BYMONTHDAY CLAMPS a short month where the spec SKIPS it', () => {
    // Jan 31 -> Feb 28 -> Mar 31. By the letter of RFC 5545 February would produce nothing and the
    // series would jump. Both enum mirrors have always clamped, production series depend on it, and
    // skipping February is not what a host who picked "monthly on the 31st" meant.
    expect(run('2027-01-31T09:00:00.000Z', parseRepeat('FREQ=MONTHLY;BYMONTHDAY=31'), '2027-04-30T23:00:00Z')).toEqual([
      '2027-01-31T09:00:00.000Z',
      '2027-02-28T09:00:00.000Z',
      '2027-03-31T09:00:00.000Z',
      '2027-04-30T09:00:00.000Z',
    ])
  })

  it('clamps from the ORIGINAL day, so a short month never permanently shortens the series', () => {
    const dates = run('2028-01-31T09:00:00.000Z', parseRepeat('FREQ=MONTHLY;BYMONTHDAY=31'), '2028-05-31T23:00:00Z')
    expect(dates[1]).toBe('2028-02-29T09:00:00.000Z') // a leap February
    expect(dates[2]).toBe('2028-03-31T09:00:00.000Z') // and back to the 31st, not stuck on the 29th
  })
})

describe('the bounds: until, count, from, max, and the anchor', () => {
  it('🔴 the anchor is occurrence one even under a rule its own date does not match', () => {
    // RFC 5545 §3.8.5.3 says the same of DTSTART, and it is what stops a host's own event moving
    // when they pick weekdays that do not include the one they are standing on.
    const dates = run(WED, parseRepeat('FREQ=WEEKLY;BYDAY=MO,FR'), '2026-09-26T00:00:00Z')
    expect(dates[0]).toBe(WED)
    expect(dates).toEqual([WED, '2026-09-18T10:00:00.000Z', '2026-09-21T10:00:00.000Z', '2026-09-25T10:00:00.000Z'])
  })

  it('`includeAnchor: false` drops it from the RESULT without dropping it from the count', () => {
    const rule = parseRepeat('FREQ=WEEKLY;BYDAY=WE;COUNT=3')!
    expect(run(WED, rule, '2027-01-01T00:00:00Z')).toHaveLength(3)
    expect(run(WED, rule, '2027-01-01T00:00:00Z', { includeAnchor: false })).toEqual([
      '2026-09-23T10:00:00.000Z',
      '2026-09-30T10:00:00.000Z',
    ])
  })

  it('`until` is inclusive at the instant, and one millisecond earlier excludes the landing', () => {
    const rule = parseRepeat('FREQ=WEEKLY;BYDAY=WE')!
    const on = run(WED, rule, '2027-01-01T00:00:00Z', { until: new Date('2026-09-30T10:00:00.000Z') })
    expect(on).toEqual([WED, '2026-09-23T10:00:00.000Z', '2026-09-30T10:00:00.000Z'])
    const before = run(WED, rule, '2027-01-01T00:00:00Z', { until: new Date('2026-09-30T09:59:59.999Z') })
    expect(before).toEqual([WED, '2026-09-23T10:00:00.000Z'])
  })

  it('`from` drops earlier landings from the result but still counts them', () => {
    const rule = parseRepeat('FREQ=WEEKLY;BYDAY=WE;COUNT=3')!
    expect(run(WED, rule, '2027-01-01T00:00:00Z', { from: new Date('2026-09-24T00:00:00Z') })).toEqual([
      '2026-09-30T10:00:00.000Z',
    ])
  })

  it('a series whose whole run is before `from` yields nothing rather than over-running its count', () => {
    const rule = parseRepeat('FREQ=WEEKLY;BYDAY=WE;COUNT=2')!
    expect(run(WED, rule, '2027-01-01T00:00:00Z', { from: new Date('2026-12-01T00:00:00Z') })).toEqual([])
  })

  it('`max` caps the result, and the engine caps `max`', () => {
    expect(run(WED, parseRepeat('FREQ=DAILY'), '2030-01-01T00:00:00Z', { max: 3 })).toHaveLength(3)
    expect(run(WED, parseRepeat('FREQ=DAILY'), '2099-01-01T00:00:00Z')).toHaveLength(MAX_REPEAT_OCCURRENCES)
  })

  it('returns nothing for no rule, an unparseable anchor, or a bound before the start', () => {
    expect(run(WED, null, '2027-01-01T00:00:00Z')).toEqual([])
    expect(run('not a date', parseRepeat('FREQ=DAILY'), '2027-01-01T00:00:00Z')).toEqual([])
    expect(run(WED, parseRepeat('FREQ=DAILY'), '2026-01-01T00:00:00Z')).toEqual([])
  })
})

describe('nextRepeatOccurrence stops at the answer', () => {
  const rule = parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')

  it('returns the anchor while it is still ahead, and the next landing once it is not', () => {
    expect(iso(nextRepeatOccurrence(WED, rule, null, new Date('2026-09-01T00:00:00Z'))!)).toBe(WED)
    expect(iso(nextRepeatOccurrence(WED, rule, null, new Date('2026-10-20T00:00:00Z'))!)).toBe('2026-10-28T10:00:00.000Z')
    // Exactly ON a landing is "at or after", so the landing itself is the answer.
    expect(iso(nextRepeatOccurrence(WED, rule, null, new Date('2026-10-28T10:00:00.000Z'))!)).toBe('2026-10-28T10:00:00.000Z')
  })

  it('returns null past the end of a bounded series, and for no rule at all', () => {
    expect(nextRepeatOccurrence(WED, rule, new Date('2026-10-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))).toBeNull()
    expect(nextRepeatOccurrence(WED, parseRepeat('FREQ=WEEKLY;BYDAY=WE;COUNT=2'), null, new Date('2027-01-01T00:00:00Z'))).toBeNull()
    expect(nextRepeatOccurrence(WED, null, null, new Date())).toBeNull()
  })
})

describe('the legacy bridge is EXACT, because it is the main path', () => {
  it('resolves each cadence against the anchor, weekday and day-of-month included', () => {
    expect(repeatFromLegacy('daily', WED)).toEqual({ freq: 'DAILY', interval: 1 })
    expect(repeatFromLegacy('weekly', WED)).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['WE'] })
    expect(repeatFromLegacy('monthly', WED)).toEqual({ freq: 'MONTHLY', interval: 1, byMonthDay: 16 })
    expect(repeatFromLegacy('yearly', WED)).toEqual({ freq: 'YEARLY', interval: 1, byMonth: 9, byMonthDay: 16 })
    expect(repeatFromLegacy('none', WED)).toBeNull()
    expect(repeatFromLegacy('weekly', 'not a date')).toBeNull()
  })

  it('🔴 the stored rule WINS, and the enum is consulted only when it is missing or unreadable', () => {
    const row = { starts_at: WED, recurrence_type: 'weekly' }
    expect(repeatFor(row)).toEqual({ freq: 'WEEKLY', interval: 1, byDay: ['WE'] })
    expect(repeatFor({ ...row, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=WE' })).toEqual({
      freq: 'WEEKLY', interval: 2, byDay: ['WE'],
    })
    // A rule outside the subset is not half-honoured: the row falls back to what it can trust.
    expect(repeatFor({ ...row, recurrence_rule: 'FREQ=FORTNIGHTLY' })).toEqual({
      freq: 'WEEKLY', interval: 1, byDay: ['WE'],
    })
  })

  it('the coarse mirror is the rule’s FREQ, which is what the cron filter and the DB CHECK read', () => {
    expect(coarseRecurrence(null)).toBe('none')
    expect(coarseRecurrence(parseRepeat('FREQ=DAILY;INTERVAL=9'))).toBe('daily')
    expect(coarseRecurrence(parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'))).toBe('weekly')
    expect(coarseRecurrence(parseRepeat('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3'))).toBe('monthly')
    expect(coarseRecurrence(parseRepeat('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=16'))).toBe('yearly')
  })
})

describe('the sentence a host checks their rule against', () => {
  it('names the answer rather than the parts', () => {
    const say = (t: string) => describeRepeat(parseRepeat(t), WED)
    expect(describeRepeat(null, WED)).toBe('Does not repeat')
    expect(say('FREQ=DAILY')).toBe('Every day')
    expect(say('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days')
    expect(say('FREQ=WEEKLY;BYDAY=WE')).toBe('Weekly on Wednesday')
    expect(say('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')).toBe('Every 2 weeks on Wednesday')
    expect(say('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('Weekly on Monday, Wednesday and Friday')
    expect(say('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Every weekday')
    expect(say('FREQ=MONTHLY;BYMONTHDAY=16')).toBe('Monthly on the 16th')
    expect(say('FREQ=MONTHLY;BYMONTHDAY=1')).toBe('Monthly on the 1st')
    expect(say('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3')).toBe('Monthly on the third Thursday')
    expect(say('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1')).toBe('Monthly on the last Friday')
    expect(say('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=16')).toBe('Annually on September 16')
    expect(say('FREQ=WEEKLY;BYDAY=WE;COUNT=6')).toBe('Weekly on Wednesday, 6 times')
  })

  it('fills in what the rule leaves implicit from the start date', () => {
    expect(describeRepeat({ freq: 'WEEKLY', interval: 1 }, WED)).toBe('Weekly on Wednesday')
    expect(describeRepeat({ freq: 'MONTHLY', interval: 1 }, WED)).toBe('Monthly on the 16th')
  })

  it('carries no em dash, per docs/CONTENT-VOICE.md', () => {
    const everything = [
      describeRepeat(parseRepeat('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'), WED),
      describeRepeat(parseRepeat('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3'), WED),
      ...repeatPresets(WED).map((p) => p.label),
    ].join(' ')
    expect(everything).not.toMatch(/—/)
  })

  it('the chip form is short enough for a card and still says the distinguishing thing', () => {
    const chip = (t: string) => repeatChipLabel(parseRepeat(t), WED)
    expect(chip('FREQ=WEEKLY;BYDAY=WE')).toBe('Wednesdays')
    expect(chip('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE')).toBe('Every 2 weeks')
    expect(chip('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Weekdays')
    expect(chip('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Mon · Wed')
    expect(chip('FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3')).toBe('Third Thursday')
    expect(chip('FREQ=MONTHLY;BYMONTHDAY=16')).toBe('Monthly')
    expect(repeatChipLabel(null, WED)).toBeNull()
    for (const t of ['FREQ=WEEKLY;BYDAY=WE', 'FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3']) {
      expect(chip(t)!.length).toBeLessThanOrEqual(20)
    }
  })
})

describe('the presets are derived from the start date, which is the whole point', () => {
  it('🔴 names the weekday and the day of the month the host already chose', () => {
    const labels = repeatPresets(WED).map((p) => p.label)
    expect(labels).toEqual([
      'Does not repeat',
      'Every day',
      'Weekly on Wednesday',
      'Every 2 weeks on Wednesday',
      'Every weekday, Monday to Friday',
      'Monthly on the 16th',
      'Monthly on the third Wednesday',
      'Annually on September 16',
    ])
    // A different start gives a different menu. A static list is exactly what this replaced.
    expect(repeatPresets('2026-09-04T10:00:00.000Z').map((p) => p.label)).toContain('Weekly on Friday')
  })

  it('offers "last" rather than an ordinal a month may not have', () => {
    // 2026-09-29 is the FIFTH Tuesday of September. "Monthly on the fifth Tuesday" would land in
    // four months of the year; "the last Tuesday" lands in twelve.
    expect(repeatPresets('2026-09-29T10:00:00.000Z').map((p) => p.label)).toContain('Monthly on the last Tuesday')
    // And a date in the last week of a 4-week-and-a-bit month gets "last" too, for the same reason.
    expect(repeatPresets('2026-09-24T10:00:00.000Z').map((p) => p.label)).toContain('Monthly on the last Thursday')
  })

  it('degrades to bare cadences with no start, so a Spark that has not asked yet still renders', () => {
    expect(repeatPresets(null).map((p) => p.id)).toEqual(['none', 'daily', 'weekly', 'monthly'])
  })

  it('matches a stored rule back to its preset on the CANONICAL string, and admits when there is none', () => {
    expect(matchRepeatPreset(parseRepeat('BYDAY=WE;FREQ=WEEKLY;INTERVAL=2'), WED)?.id).toBe('biweekly')
    expect(matchRepeatPreset(null, WED)?.id).toBe('none')
    // Anything the presets cannot say is the custom panel's job, and a count is a range no preset has.
    expect(matchRepeatPreset(parseRepeat('FREQ=WEEKLY;INTERVAL=3;BYDAY=WE'), WED)).toBeNull()
    expect(matchRepeatPreset(parseRepeat('FREQ=WEEKLY;BYDAY=WE;COUNT=6'), WED)).toBeNull()
  })
})

describe('the engine stays importable by everything that needs it', () => {
  it('🔴 has ZERO imports — it runs in the client picker, a server action, and the cron alike', () => {
    const src = readFileSync('lib/events/repeat-rule.ts', 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toMatch(/\brequire\(/)
    // And no clock of its own: every caller passes `now`, which is what makes the parity gate and
    // every fixture above deterministic.
    expect(code).not.toMatch(/Date\.now\(\)/)
    expect(code).not.toMatch(/new Date\(\)/)
  })
})

// ── THE PICKER'S ONE PIECE OF DERIVED STATE, PINNED HERE BECAUSE IT IS ARITHMETIC ────────────────
//
// "Custom" is not a stored flag in the picker; it is "this rule matches no preset". That keeps the
// panel showing a preset's own settings when a host opens it, so "every 2 weeks" -> "every 3 weeks"
// is a one-field edit rather than a rebuild. It also means the SEED the panel opens with has to be
// something `matchRepeatPreset` returns null for, or the panel closes the instant it opens.
describe('opening Custom from a preset lands on a rule no preset can claim', () => {
  const WEDNESDAY = '2026-09-16T10:00:00.000Z'

  it('🔴 bumping the interval ONCE is not enough: weekly + 1 IS the fortnightly preset', () => {
    const weekly = repeatPresets(WEDNESDAY).find((p) => p.id === 'weekly')!.rule!
    const bumpedOnce = { ...weekly, interval: weekly.interval + 1 }
    // This is the defect a single bump would have shipped, on the most common starting point.
    expect(matchRepeatPreset(bumpedOnce, WEDNESDAY)?.id).toBe('biweekly')
    // Twice clears it, which is why the picker loops rather than adds one.
    expect(matchRepeatPreset({ ...weekly, interval: weekly.interval + 2 }, WEDNESDAY)).toBeNull()
  })

  it('every preset escapes within the picker’s bounded loop', () => {
    for (const preset of repeatPresets(WEDNESDAY)) {
      if (!preset.rule) continue
      let seeded = preset.rule
      let steps = 0
      while (steps < 8 && matchRepeatPreset(seeded, WEDNESDAY)) {
        seeded = { ...seeded, interval: (seeded.interval || 1) + 1 }
        steps++
      }
      expect(matchRepeatPreset(seeded, WEDNESDAY), `${preset.id} never escaped`).toBeNull()
      expect(steps, `${preset.id} took ${steps} bumps`).toBeLessThanOrEqual(2)
    }
  })
})
