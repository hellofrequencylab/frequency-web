// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE REPEAT RULE — one pure engine for "how often does this gathering land?" (ADR-1299).
//
// ── WHAT THIS REPLACES, AND WHY ─────────────────────────────────────────────────────────────────
// Events shipped in 2024 with a four-value enum: none / daily / weekly / monthly (ADR-007). Its own
// migration (20240208000000_event_recurrence.sql) wrote down the exit in advance:
//
//     "Enum, not RRULE. […] Can be promoted to RRULE later without losing data — just add a
//      recurrence_rule text column and keep recurrence_type as the simple path."
//
// This is that promotion, taken because the enum could not say the two things hosts actually
// asked for — "every other Wednesday" and "the third Thursday of the month" — and because the
// enum's maths had been copied THREE times (the materialiser, the read side, the calendar strip)
// with a parity gate (lib/events/recurrence-parity.test.ts) standing between the copies to notice
// when they disagreed. That gate's own header names the gap this file closes:
//
//     "The model has no weekday-ordinal rule ('second Tuesday'), so there is nothing of that shape
//      to pin; if one is ever added it belongs in this table on the day it lands."
//
// So the answer is not a fourth copy. Every one of those three modules now delegates HERE, and the
// parity gate keeps doing its job on the delegation.
//
// ── THE SHAPE: A BOUNDED RFC 5545 SUBSET, NOT A BESPOKE OBJECT ───────────────────────────────────
// The stored value is an RFC 5545 RRULE value with no `RRULE:` prefix, e.g.
//
//     FREQ=WEEKLY;INTERVAL=2;BYDAY=WE                  every other Wednesday
//     FREQ=MONTHLY;BYDAY=TH;BYSETPOS=3                 the third Thursday of the month
//     FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1                the last Friday of the month
//     FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR                 every weekday
//     FREQ=DAILY;INTERVAL=3;COUNT=10                   every third day, ten times
//     FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=16              annually on 16 September
//
// RFC 5545 rather than a shape of our own because the rule has to survive the round trip a calendar
// entry makes: the .ics feeds already emit RRULE, and Google, Apple and Outlook all read and write
// the same grammar. A bespoke object would need a translator per direction and would drift.
//
// The subset is deliberately BOUNDED — FREQ, INTERVAL, BYDAY, BYSETPOS, BYMONTHDAY, BYMONTH, COUNT
// and nothing else. Full RRULE is a small programming language (BYYEARDAY, BYWEEKNO, WKST, RDATE,
// EXRULE …) and every construct admitted here has to be expandable by the materialiser, describable
// in plain voice, and representable in the picker. Anything the parser does not understand is
// treated as ABSENT rather than half-honoured, which drops the series to its legacy enum cadence —
// a wrong-but-bounded answer instead of a silent one.
//
// ── WHERE THE RANGE LIVES, WHICH IS NOT ALL IN ONE PLACE ─────────────────────────────────────────
// 🔴 `UNTIL` IS NOT IN THE RULE. It stays in `events.recurrence_until`, the column it has always
// been in, and every function here takes it as a separate argument — exactly as the three mirrors
// already took `(starts_at, recurrence_type, recurrence_until)` as a triple. Two reasons, both
// load-bearing:
//   • ADR-807 rules that `recurrence_until` "resolves through the zone to the same instant the
//     RRULE UNTIL carries", and the published .ics feeds ship that today. Moving the value into a
//     string would re-open a settled timezone question for no gain.
//   • The occurrence cron filters live anchors with `recurrence_until.is.null,recurrence_until.gt.now`.
//     That is an indexed column comparison; it cannot be a substring match on a rule.
// `COUNT` has no column, so it DOES live in the rule. The two are mutually exclusive in the picker
// (an end is "never", "on a date" or "after N times"), which is the same choice RFC 5545 makes.
//
// ── THE ONE PLACE THIS DEPARTS FROM RFC 5545, ON PURPOSE ─────────────────────────────────────────
// `BYMONTHDAY` CLAMPS to the length of a short month; RFC 5545 SKIPS it. A monthly series anchored
// on the 31st lands Jan 31 -> Feb 28 -> Mar 31 here, and Jan 31 -> Mar 31 by the letter of the spec.
// The clamp is what this product has always done (both enum mirrors carry it, and the parity gate
// pins it across leap years), production series depend on it, and skipping February is not what a
// host who picked "monthly on the 31st" meant. The .ics export translates the clamp faithfully with
// the standard `BYMONTHDAY=28,29,30,31;BYSETPOS=-1` idiom (lib/events/ics.ts), so a subscriber's
// calendar agrees with the page. The `BYSETPOS` weekday form has no such departure: "the fifth
// Monday" simply does not occur in a month that has four, and that IS what a host means.
//
// PURE AND IMPORT-FREE, like the modules it replaces the guts of: no React, no Next, no Supabase,
// no clock of its own. Every caller passes `now`. It is imported by the client picker, by server
// actions, by the cron materialiser and by three read paths, and it must stay importable by all of
// them.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The frequencies the subset admits. */
export const REPEAT_FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const
export type RepeatFreq = (typeof REPEAT_FREQS)[number]

/** RFC 5545 weekday codes, in the order `Date.getUTCDay()` returns (Sunday = 0). */
export const REPEAT_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export type RepeatWeekday = (typeof REPEAT_WEEKDAYS)[number]

/**
 * A parsed rule. Every field is already validated: an instance of this type can always be expanded,
 * described and formatted. Build one with `parseRepeat` or `repeatFromLegacy`, never by hand from
 * untrusted input.
 */
export interface RepeatRule {
  freq: RepeatFreq
  /** How many periods between landings. >= 1; 1 is the default and is dropped when formatting. */
  interval: number
  /** WEEKLY: every weekday the series lands on. MONTHLY / YEARLY: the single weekday `bySetPos`
   *  counts, e.g. `['TH']` with `bySetPos: 3` for "the third Thursday". */
  byDay?: RepeatWeekday[]
  /** Which one of `byDay` in the month: 1..4, or -1 for the last. MONTHLY / YEARLY only. */
  bySetPos?: number
  /** Day of the month, 1..31, CLAMPED to a short month's length (see the header). Mutually
   *  exclusive with the `byDay` + `bySetPos` pair. */
  byMonthDay?: number
  /** Month of the year, 1..12. YEARLY only. */
  byMonth?: number
  /** Total landings INCLUDING the anchor. Mutually exclusive with `recurrence_until`. */
  count?: number
}

/** How many occurrences any single expansion will ever produce. A bound rather than a budget: the
 *  honest series that reach it do not exist (a daily series hits 4000 after eleven years), and it
 *  is what stops a malformed rule from spinning. Mirrors the MAX_STEPS the three enum mirrors used. */
export const MAX_REPEAT_OCCURRENCES = 4000

// ── Parsing ──────────────────────────────────────────────────────────────────────────────────────

function asPositiveInt(v: string | undefined, max: number): number | null {
  if (!v || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= max ? n : null
}

function asWeekdays(v: string | undefined): RepeatWeekday[] | null {
  if (!v) return null
  const parts = v.split(',').map((p) => p.trim().toUpperCase())
  const out: RepeatWeekday[] = []
  for (const p of parts) {
    // A BYDAY entry may carry its own ordinal in RFC 5545 (`3TH`). The subset does not admit that
    // spelling — the ordinal belongs in BYSETPOS, so there is exactly one way to say a thing — and
    // a rule using it is rejected whole rather than silently read as "every Thursday".
    if (!(REPEAT_WEEKDAYS as readonly string[]).includes(p)) return null
    if (!out.includes(p as RepeatWeekday)) out.push(p as RepeatWeekday)
  }
  return out.length ? out : null
}

/**
 * Parse an RRULE value (with or without the `RRULE:` prefix) into a rule this engine can expand.
 * Returns null for anything empty, malformed, or outside the subset — including a rule that is
 * syntactically fine but self-contradictory (a BYSETPOS with no BYDAY, a BYMONTHDAY beside a
 * BYSETPOS, a WEEKLY carrying BYMONTHDAY).
 *
 * 🔴 TOTAL, AND NULL IS A REAL ANSWER. This runs on values that arrive from a form post and from a
 * text column, so it is the trust boundary. A caller that gets null falls back to the legacy enum
 * cadence (`repeatFor`), which is why a half-understood rule must never be returned: expanding
 * `FREQ=WEEKLY` when the host wrote `FREQ=WEEKLY;INTERVAL=2` would put an event on the calendar on
 * a day nothing happens.
 */
export function parseRepeat(input: string | null | undefined): RepeatRule | null {
  if (typeof input !== 'string') return null
  const body = input.trim().replace(/^RRULE:/i, '').trim()
  if (!body) return null

  const parts = new Map<string, string>()
  for (const chunk of body.split(';')) {
    if (!chunk.trim()) continue
    const eq = chunk.indexOf('=')
    if (eq < 1) return null
    const key = chunk.slice(0, eq).trim().toUpperCase()
    if (parts.has(key)) return null
    parts.set(key, chunk.slice(eq + 1).trim())
  }

  // UNTIL is ACCEPTED AND DROPPED rather than rejected. It is not part of a stored rule — the
  // series end lives in `events.recurrence_until` (see the header) — but it IS how the picker
  // carries the host's "ends on" choice across one form post in the same string as the pattern, so
  // one control can own the whole Repeats section. `repeatUntilDate` reads it back out.
  const KNOWN = ['FREQ', 'INTERVAL', 'BYDAY', 'BYSETPOS', 'BYMONTHDAY', 'BYMONTH', 'COUNT', 'UNTIL']
  for (const key of parts.keys()) if (!KNOWN.includes(key)) return null

  const freqRaw = (parts.get('FREQ') ?? '').toUpperCase()
  if (!(REPEAT_FREQS as readonly string[]).includes(freqRaw)) return null
  const freq = freqRaw as RepeatFreq

  const rule: RepeatRule = { freq, interval: 1 }

  if (parts.has('INTERVAL')) {
    const interval = asPositiveInt(parts.get('INTERVAL'), 366)
    if (interval === null) return null
    rule.interval = interval
  }
  if (parts.has('COUNT')) {
    const count = asPositiveInt(parts.get('COUNT'), MAX_REPEAT_OCCURRENCES)
    if (count === null) return null
    rule.count = count
  }

  const byDay = parts.has('BYDAY') ? asWeekdays(parts.get('BYDAY')) : null
  if (parts.has('BYDAY') && !byDay) return null

  const bySetPosRaw = parts.get('BYSETPOS')
  let bySetPos: number | undefined
  if (bySetPosRaw !== undefined) {
    if (!/^-?\d+$/.test(bySetPosRaw)) return null
    const n = Number(bySetPosRaw)
    // 1..4 name a week that every month has; -1 is "the last", which is what a host means by "the
    // last Friday". 5 is deliberately NOT admitted: it would silently skip the months that have
    // only four, and "the last" is the option a picker should have offered instead.
    if (!(n === -1 || (n >= 1 && n <= 4))) return null
    bySetPos = n
  }

  const byMonthDayRaw = parts.get('BYMONTHDAY')
  let byMonthDay: number | undefined
  if (byMonthDayRaw !== undefined) {
    const n = asPositiveInt(byMonthDayRaw, 31)
    if (n === null) return null
    byMonthDay = n
  }

  const byMonthRaw = parts.get('BYMONTH')
  let byMonth: number | undefined
  if (byMonthRaw !== undefined) {
    const n = asPositiveInt(byMonthRaw, 12)
    if (n === null) return null
    byMonth = n
  }

  // ── Shape rules per frequency. Anything that does not fit is rejected whole. ──
  if (freq === 'DAILY') {
    if (byDay || bySetPos !== undefined || byMonthDay !== undefined || byMonth !== undefined) return null
  } else if (freq === 'WEEKLY') {
    if (bySetPos !== undefined || byMonthDay !== undefined || byMonth !== undefined) return null
    if (byDay) rule.byDay = byDay
  } else {
    // MONTHLY / YEARLY: EITHER a day of the month OR an nth weekday, never both and never neither
    // said twice. Both absent is legal and means "the anchor's own day", resolved at expansion.
    if (byMonthDay !== undefined && (byDay || bySetPos !== undefined)) return null
    if (bySetPos !== undefined && (!byDay || byDay.length !== 1)) return null
    if (byDay && byDay.length !== 1) return null
    if (byDay && bySetPos === undefined) return null
    if (byMonthDay !== undefined) rule.byMonthDay = byMonthDay
    if (byDay) {
      rule.byDay = byDay
      rule.bySetPos = bySetPos
    }
    if (freq === 'YEARLY' && byMonth !== undefined) rule.byMonth = byMonth
    if (freq === 'MONTHLY' && byMonth !== undefined) return null
  }

  return rule
}

/**
 * The `UNTIL` a transport string carries, as the `YYYY-MM-DD` a date input speaks, or null.
 *
 * 🔴 TRANSPORT ONLY. A STORED rule never carries UNTIL: the series end is `events.recurrence_until`,
 * an indexed timestamptz that the occurrence cron's anchor filter and ADR-807's zone resolution both
 * depend on. This exists so the picker can hand ONE string to a form and the server can split it,
 * which is what lets a single control own "how often" and "until when" without the two drifting into
 * separate fields that can contradict each other.
 *
 * Accepts both RFC 5545 spellings — a bare `YYYYMMDD` date and a `YYYYMMDDTHHMMSSZ` date-time —
 * and returns the DATE part of either. Total: anything unreadable is null, which means "no end".
 */
export function repeatUntilDate(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const m = /(?:^|;)UNTIL=(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?(?:;|$)/i.exec(input.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const month = Number(mo)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${mo}-${d}`
}

/** The transport string for a picker: the canonical rule, plus the host's "ends on" date when they
 *  chose one. `untilDate` is the `YYYY-MM-DD` a date input produces. */
export function formatRepeatDraft(rule: RepeatRule | null, untilDate?: string | null): string {
  if (!rule) return ''
  const body = formatRepeat(rule)
  if (!untilDate || !/^\d{4}-\d{2}-\d{2}$/.test(untilDate)) return body
  return `${body};UNTIL=${untilDate.replace(/-/g, '')}`
}

/** Format a rule back to its canonical RRULE value (no `RRULE:` prefix, no UNTIL — see the header).
 *  Canonical means: one spelling per rule, so a round trip through parse is byte-stable and two
 *  equal rules compare equal as strings. */
export function formatRepeat(rule: RepeatRule): string {
  const out = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`)
  if (rule.byMonth !== undefined) out.push(`BYMONTH=${rule.byMonth}`)
  if (rule.byMonthDay !== undefined) out.push(`BYMONTHDAY=${rule.byMonthDay}`)
  if (rule.byDay && rule.byDay.length) {
    // Emitted in calendar order (Sunday first, matching REPEAT_WEEKDAYS) rather than in the order a
    // host happened to tap them, so "Wed then Mon" and "Mon then Wed" are the same stored string.
    const ordered = REPEAT_WEEKDAYS.filter((d) => rule.byDay!.includes(d))
    out.push(`BYDAY=${ordered.join(',')}`)
  }
  if (rule.bySetPos !== undefined) out.push(`BYSETPOS=${rule.bySetPos}`)
  if (rule.count !== undefined) out.push(`COUNT=${rule.count}`)
  return out.join(';')
}

// ── The legacy enum, as a rule ───────────────────────────────────────────────────────────────────

/** The cadence values `events.recurrence_type` may hold. 'yearly' joined the CHECK with the rule
 *  column; every row written before that carries one of the original four. */
export type RecurrenceEnum = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Narrow any value to a cadence enum. Total. */
export function asRecurrenceEnum(v: unknown): RecurrenceEnum {
  return v === 'daily' || v === 'weekly' || v === 'monthly' || v === 'yearly' ? v : 'none'
}

/**
 * The rule a legacy enum row means, resolved against its anchor — the bridge that lets every reader
 * speak rules while 100% of existing rows carry only the enum.
 *
 * 🔴 THESE THREE ARE EXACT, NOT APPROXIMATE, and the parity gate is what proves it: 'weekly' means
 * the anchor's own weekday, 'monthly' means the anchor's own day-of-month WITH the clamp, and
 * 'daily' means every day. Any drift here silently re-dates every established series in production.
 */
export function repeatFromLegacy(
  type: unknown,
  startsAtIso: string | null | undefined,
): RepeatRule | null {
  const cadence = asRecurrenceEnum(type)
  if (cadence === 'none') return null
  if (cadence === 'daily') return { freq: 'DAILY', interval: 1 }

  const start = parseWallClock(startsAtIso)
  if (!start) return null
  if (cadence === 'weekly') {
    return { freq: 'WEEKLY', interval: 1, byDay: [REPEAT_WEEKDAYS[start.getUTCDay()]] }
  }
  if (cadence === 'monthly') {
    return { freq: 'MONTHLY', interval: 1, byMonthDay: start.getUTCDate() }
  }
  return { freq: 'YEARLY', interval: 1, byMonth: start.getUTCMonth() + 1, byMonthDay: start.getUTCDate() }
}

/** The coarse cadence a rule means, for the `events.recurrence_type` mirror every existing query,
 *  index and DB CHECK still reads. The column stays the cheap filter ("is this a series at all, and
 *  roughly how often"); the rule is the truth. */
export function coarseRecurrence(rule: RepeatRule | null | undefined): RecurrenceEnum {
  if (!rule) return 'none'
  return rule.freq === 'DAILY'
    ? 'daily'
    : rule.freq === 'WEEKLY'
      ? 'weekly'
      : rule.freq === 'MONTHLY'
        ? 'monthly'
        : 'yearly'
}

/** The columns any reader has in hand. `recurrence_rule` is nullable and is absent on every row
 *  written before ADR-1299. */
export interface RepeatSource {
  starts_at: string | null | undefined
  recurrence_type?: string | null
  recurrence_rule?: string | null
}

/**
 * THE ONE RESOLVER every reader calls. The stored rule wins when it parses; otherwise the legacy
 * enum, resolved against the anchor. Null means "this does not repeat".
 *
 * A row carrying BOTH is normal, not a conflict: writers keep `recurrence_type` in step as the
 * coarse mirror (`coarseRecurrence`), so the enum agrees with the rule's FREQ. It is consulted
 * only when the rule is missing or unreadable.
 */
export function repeatFor(row: RepeatSource): RepeatRule | null {
  const parsed = parseRepeat(row.recurrence_rule)
  if (parsed) return parsed
  return repeatFromLegacy(row.recurrence_type, row.starts_at)
}

// ── Expansion ────────────────────────────────────────────────────────────────────────────────────
//
// EVERYTHING BELOW WORKS IN WALL CLOCK KEPT AS UTC PARTS, which is how `events.starts_at` stores a
// host's local time (lib/time/zone.ts). So a 7pm series is 19:00 UTC-parts on every date it lands,
// and no occurrence drifts an hour across a DST boundary. `recurrence_until` is the one value that
// is a TRUE instant and is compared as one (ADR-807) — the caller resolves it through the zone and
// hands it in.

function parseWallClock(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || !iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Days in a UTC month (0-indexed). Day 0 of the next month is the last day of this one. */
function daysInUTCMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** A date at `y-m-d` carrying the anchor's time of day. `m` may be out of range; Date carries it. */
function atDay(anchor: Date, year: number, month: number, day: number): Date {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  )
}

/** The date of the nth `weekday` in a month, or null when the month has no nth one. `pos` is 1..4
 *  or -1 for the last. Pure UTC arithmetic. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, pos: number): number | null {
  const length = daysInUTCMonth(year, month)
  if (pos === -1) {
    const lastDow = new Date(Date.UTC(year, month, length)).getUTCDay()
    return length - ((lastDow - weekday + 7) % 7)
  }
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const day = 1 + ((weekday - firstDow + 7) % 7) + (pos - 1) * 7
  return day <= length ? day : null
}

/** The Monday on or before `d`, at midnight-of-the-anchor's-time. RFC 5545's default WKST is MO,
 *  and the week boundary is what decides which landings belong to an INTERVAL step. */
function weekStart(d: Date): Date {
  const back = (d.getUTCDay() + 6) % 7
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() - back)
  return out
}

export interface ExpandOptions {
  /** Stop at this instant, inclusive. Required: an unbounded expansion is never what a caller
   *  wants, and making it mandatory is what stops one being written by accident. */
  through: Date
  /** The series end (`events.recurrence_until`), as a TRUE instant. An occurrence strictly after it
   *  is not part of the series (ADR-807). Null or absent for an indefinite series. */
  until?: Date | null
  /** Drop occurrences BEFORE this instant from the result. They are still counted against `count`,
   *  because they happened. This is what lets "the next date" ask for one occurrence instead of
   *  building a decade of them and reading the first that qualifies. */
  from?: Date | null
  /** Include the anchor itself as the first occurrence. Default true. The materialiser passes false
   *  because the anchor is already a row in the database. */
  includeAnchor?: boolean
  /** Hard ceiling on how many occurrences to RETURN (after `from`). Defaults to
   *  MAX_REPEAT_OCCURRENCES. */
  max?: number
}

/**
 * Every occurrence of `rule` from `startsAtIso`, ascending, bounded by `through`, `until`, `from`,
 * `max` and the rule's own `count`. Returns [] for a rule of null, an unparseable anchor, or a
 * series that has already ended.
 *
 * 🔴 THE ANCHOR IS ALWAYS OCCURRENCE ONE, even under a rule its own date does not match — RFC 5545
 * §3.8.5.3 says the same of DTSTART. It matters for the honest case: a host whose event starts on a
 * Wednesday and who picks "Mon, Wed, Fri" gets the Wednesday they already chose, and one who picks
 * only "Fri" still keeps the Wednesday they are standing on rather than watching their own event
 * move. The picker keeps the anchor's weekday selected for the same reason.
 *
 * `count` counts the anchor, so `COUNT=6` on a six-week course is six gatherings, which is what the
 * picker's "after 6 times" says.
 */
export function expandRepeat(
  startsAtIso: string | null | undefined,
  rule: RepeatRule | null | undefined,
  opts: ExpandOptions,
): Date[] {
  if (!rule) return []
  const anchor = parseWallClock(startsAtIso)
  if (!anchor) return []

  const limit = opts.through.getTime()
  const untilMs = opts.until && !Number.isNaN(opts.until.getTime()) ? opts.until.getTime() : null
  const fromMs = opts.from && !Number.isNaN(opts.from.getTime()) ? opts.from.getTime() : null
  const max = Math.max(1, Math.min(opts.max ?? MAX_REPEAT_OCCURRENCES, MAX_REPEAT_OCCURRENCES))
  const includeAnchor = opts.includeAnchor !== false
  const anchorMs = anchor.getTime()

  const out: Date[] = []
  /** Landings SEEN, anchor included — this is what `count` bounds, whether or not the caller asked
   *  for the anchor back and whether or not `from` dropped it from the result. */
  let seen = 0

  /** Offer one landing. Returns false when the walk is over. Dates handed here are already known
   *  to be at or after the anchor. */
  const take = (d: Date): boolean => {
    const ms = d.getTime()
    if (untilMs !== null && ms > untilMs) return false
    if (rule.count !== undefined && seen >= rule.count) return false
    seen++
    if (ms > limit) return false
    if (ms === anchorMs && !includeAnchor) return true
    if (fromMs !== null && ms < fromMs) return true
    out.push(d)
    return out.length < max
  }

  // The anchor first, unconditionally — it is occurrence one whether or not it matches the rule.
  if (!take(anchor)) return out

  const after = (d: Date): boolean => d.getTime() > anchorMs

  if (rule.freq === 'DAILY') {
    for (let step = 1; step < MAX_REPEAT_OCCURRENCES; step++) {
      const d = new Date(anchor)
      d.setUTCDate(d.getUTCDate() + step * rule.interval)
      if (!take(d)) break
    }
    return out
  }

  if (rule.freq === 'WEEKLY') {
    // The days of the week the series lands on, in Monday-first order so a week's landings come
    // out chronologically. With no BYDAY it is the anchor's own weekday.
    const days = (rule.byDay?.length ? rule.byDay : [REPEAT_WEEKDAYS[anchor.getUTCDay()]]).map((d) =>
      REPEAT_WEEKDAYS.indexOf(d),
    )
    const offsets = [...new Set(days.map((dow) => (dow + 6) % 7))].sort((a, b) => a - b)
    const base = weekStart(anchor)
    outer: for (let week = 0; week < MAX_REPEAT_OCCURRENCES; week++) {
      for (const offset of offsets) {
        const d = new Date(base)
        d.setUTCDate(d.getUTCDate() + week * 7 * rule.interval + offset)
        if (!after(d)) continue
        if (!take(d)) break outer
      }
    }
    return out
  }

  // MONTHLY and YEARLY share their day-selection; only the step between candidate months differs.
  const monthStep = rule.freq === 'YEARLY' ? 12 * rule.interval : rule.interval
  const startMonth = rule.freq === 'YEARLY' && rule.byMonth !== undefined ? rule.byMonth - 1 : anchor.getUTCMonth()
  const weekdayIndex = rule.byDay?.length ? REPEAT_WEEKDAYS.indexOf(rule.byDay[0]) : null
  const monthDay = rule.byMonthDay ?? (weekdayIndex === null ? anchor.getUTCDate() : null)

  for (let step = 0; step < MAX_REPEAT_OCCURRENCES; step++) {
    const total = startMonth + step * monthStep
    const year = anchor.getUTCFullYear() + Math.floor(total / 12)
    const month = ((total % 12) + 12) % 12

    // A whole month past the bound ends the walk even when this month lands on nothing — without
    // it, a rule whose day never occurs (a fifth Monday) would walk its full step ceiling.
    if (Date.UTC(year, month, 1) > limit) break

    const day =
      monthDay !== null
        ? // THE CLAMP, not the RFC's skip. See the header.
          Math.min(monthDay, daysInUTCMonth(year, month))
        : nthWeekdayOfMonth(year, month, weekdayIndex as number, rule.bySetPos ?? 1)
    // A month with no fifth of that weekday is skipped, not the end of the series.
    if (day === null) continue

    const d = atDay(anchor, year, month, day)
    if (!after(d)) continue
    if (!take(d)) break
  }
  return out
}

/** How far ahead `nextRepeatOccurrence` is willing to look for a landing. A century: further than
 *  any honest series, and finite so a malformed rule cannot walk forever. */
const NEXT_HORIZON_MS = 100 * 366 * 24 * 60 * 60 * 1000

/**
 * The next occurrence at or after `now`, or null when the series has ended, does not repeat, or has
 * an unreadable anchor. This is what keeps a recurring event whose own date has passed from
 * dropping out of "upcoming".
 *
 * It asks the expander for ONE occurrence from `now`, so it stops at the answer rather than
 * building the series to find it.
 */
export function nextRepeatOccurrence(
  startsAtIso: string | null | undefined,
  rule: RepeatRule | null | undefined,
  until: Date | null | undefined,
  now: Date,
): Date | null {
  if (until && Number.isNaN(until.getTime())) return null
  const horizon = new Date(now.getTime() + NEXT_HORIZON_MS)
  const [next] = expandRepeat(startsAtIso, rule, { through: horizon, until, from: now, max: 1 })
  return next ?? null
}

// ── Plain voice ──────────────────────────────────────────────────────────────────────────────────
//
// 🔴 THE SUMMARY LINE IS NOT DECORATION. It is the only way a host can verify what they built: a
// picker can show "every 2", "Thursday" and "third" as three separate controls and still leave
// someone unsure whether they just made a monthly or a fortnightly series. Google, Apple, Outlook
// and every design-system recurrence component print the sentence back for the same reason, and it
// doubles as the control group's accessible description.
//
// Voice: docs/CONTENT-VOICE.md. Plain sentences, no em dashes, no narrating how the host feels.
// Names, not numbers ("the third Thursday", not "BYSETPOS=3"), because the words are the proof.

const WEEKDAY_NAMES: Record<RepeatWeekday, string> = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
}

const WEEKDAY_SHORT: Record<RepeatWeekday, string> = {
  SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat',
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const ORDINAL_WORDS: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' }

/** "1st", "22nd", "31st" — for a day of the month inside a sentence. */
function ordinalNumber(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

/** "Monday and Wednesday", "Monday, Wednesday and Friday" — an English list, serial comma omitted
 *  to match the rest of the product's copy. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const WEEKDAY_SET: RepeatWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR']

function sameDays(a: readonly RepeatWeekday[], b: readonly RepeatWeekday[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d))
}

/**
 * The rule as a sentence a host can check: "Every 2 weeks on Wednesday", "Monthly on the third
 * Thursday", "Every weekday". `startsAtIso` supplies whatever the rule leaves implicit (a WEEKLY
 * rule with no BYDAY lands on the anchor's weekday), so the sentence is complete either way.
 *
 * The RANGE is deliberately NOT included: `recurrence_until` lives in its own column and its own
 * control, and surfaces render it beside this ("Weekly on Wednesday, until 30 December"). `count`
 * IS included, because it lives in the rule and nothing else would say it.
 */
export function describeRepeat(
  rule: RepeatRule | null | undefined,
  startsAtIso?: string | null,
): string {
  if (!rule) return 'Does not repeat'
  const anchor = parseWallClock(startsAtIso)
  const every = rule.interval > 1

  let body: string
  if (rule.freq === 'DAILY') {
    body = every ? `Every ${rule.interval} days` : 'Every day'
  } else if (rule.freq === 'WEEKLY') {
    const days = rule.byDay?.length
      ? rule.byDay
      : anchor
        ? [REPEAT_WEEKDAYS[anchor.getUTCDay()]]
        : []
    const ordered = REPEAT_WEEKDAYS.filter((d) => days.includes(d))
    if (!every && sameDays(ordered, WEEKDAY_SET)) {
      body = 'Every weekday'
    } else {
      const on = ordered.length ? ` on ${joinNames(ordered.map((d) => WEEKDAY_NAMES[d]))}` : ''
      body = every ? `Every ${rule.interval} weeks${on}` : `Weekly${on}`
    }
  } else {
    const unit = rule.freq === 'YEARLY' ? 'years' : 'months'
    const lead = every
      ? `Every ${rule.interval} ${unit}`
      : rule.freq === 'YEARLY'
        ? 'Annually'
        : 'Monthly'
    let on = ''
    if (rule.byDay?.length) {
      const which = ORDINAL_WORDS[rule.bySetPos ?? 1] ?? 'first'
      on = ` on the ${which} ${WEEKDAY_NAMES[rule.byDay[0]]}`
    } else {
      const day = rule.byMonthDay ?? anchor?.getUTCDate()
      if (day) {
        on =
          rule.freq === 'YEARLY' && rule.byMonth !== undefined
            ? ` on ${MONTH_NAMES[rule.byMonth - 1]} ${day}`
            : ` on the ${ordinalNumber(day)}`
      }
    }
    body = `${lead}${on}`
  }

  if (rule.count !== undefined) {
    body += `, ${rule.count} ${rule.count === 1 ? 'time' : 'times'}`
  }
  return body
}

/**
 * The SHORT form for a card, a chip, or a strip label, where the sentence above would not fit:
 * "Every 2 weeks", "Thursdays", "Third Thursday". Member words only, so the internal vocabulary
 * ("occurrence", "anchor", "RRULE") never reaches a reader (docs/NAMING.md §Events).
 */
export function repeatChipLabel(
  rule: RepeatRule | null | undefined,
  startsAtIso?: string | null,
): string | null {
  if (!rule) return null
  const anchor = parseWallClock(startsAtIso)
  const every = rule.interval > 1

  if (rule.freq === 'DAILY') return every ? `Every ${rule.interval} days` : 'Every day'
  if (rule.freq === 'WEEKLY') {
    const days = rule.byDay?.length ? rule.byDay : anchor ? [REPEAT_WEEKDAYS[anchor.getUTCDay()]] : []
    const ordered = REPEAT_WEEKDAYS.filter((d) => days.includes(d))
    if (!every && sameDays(ordered, WEEKDAY_SET)) return 'Weekdays'
    if (every) return `Every ${rule.interval} weeks`
    if (ordered.length === 1) return `${WEEKDAY_NAMES[ordered[0]]}s`
    if (ordered.length) return ordered.map((d) => WEEKDAY_SHORT[d]).join(' · ')
    return 'Weekly'
  }
  if (rule.byDay?.length) {
    const which = ORDINAL_WORDS[rule.bySetPos ?? 1] ?? 'first'
    const label = `${which[0].toUpperCase()}${which.slice(1)} ${WEEKDAY_NAMES[rule.byDay[0]]}`
    return rule.freq === 'YEARLY' ? `Annually, ${label.toLowerCase()}` : label
  }
  if (rule.freq === 'YEARLY') return every ? `Every ${rule.interval} years` : 'Annually'
  return every ? `Every ${rule.interval} months` : 'Monthly'
}

// ── The presets, and why there are none ─────────────────────────────────────────────────────────
//
// `repeatPresets()` and `matchRepeatPreset()` lived here. They built a START-DERIVED menu — for an
// event starting Wednesday 16 September: "Weekly on Wednesday", "Every 2 weeks on Wednesday",
// "Monthly on the third Wednesday", "Annually on September 16" — which is what Google Calendar,
// Apple Calendar and Outlook all do, and the reasoning behind it is still worth knowing: a static
// Daily/Weekly/Monthly list makes the host do that arithmetic in their head, and the arithmetic is
// exactly where "monthly" quietly means "the 16th" to the software and "the third Wednesday" to
// the host.
//
// They came out the day they shipped (owner: "I don't like the preset dropdowns. Those are
// confusing"). Seven sentences in a dropdown is a paragraph, and it hid the editor behind a
// "Custom…" option. components/events/repeat-picker.tsx now asks the frequency in five words and
// shows the editor for everything else, so nothing derives a preset any more and the two functions
// are deleted rather than kept warm — a start-derived label is two lines of `describeRepeat` away
// if a menu ever wants one again.
