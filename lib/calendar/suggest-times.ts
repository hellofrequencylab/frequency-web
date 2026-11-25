// VERA SUGGESTS TIMES (LIVE-2532). `suggestDates` (lib/calendar/vera-plan.ts) offers whole free days
// for the Space and never a time of day, and it never asks who has to be there. This offers three
// dates AND times for the people a Plan needs, each with one line saying why, and Vera only proposes
// (ADR-1386): the options land as Pencil dates the team votes on in Find a time (LIVE-2531). Nothing
// is booked.
//
// What it reads, all handed in by the caller (find-time-actions.ts) from the caller's own Space:
//   · the Space's calendar: events, Pencils, private and unavailable time (no option may overlap);
//   · each person's own busy time (their timed to-dos today; their connected calendar once calendar
//     sync is live, LIVE-1179, which is one more array in `personBusy` and no change here);
//   · each person's load: the days they already have to-dos due, which a meeting should avoid;
//   · quiet hours: no option starts before they end or runs past when they start;
//   · past Find a time answers: the weekdays and times each person said Yes to before.
//
// TIME. Everything is the Space's WALL CLOCK as UTC parts, the calendar's own convention
// (lib/time/zone.ts), so a "7:00 PM" option is 19:00 in the stored value and no zone maths happens.
// Pure: no React, no Supabase. Every sentence goes through the house voice module.

import { voiceLine } from '@/lib/ai/voice'

const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'] as const

/** Start times offered, in minutes after midnight. Weekdays lean on lunch and the evening, the
 *  weekend on late morning and afternoon: the times community teams actually meet. */
const WEEKDAY_STARTS = [10 * 60, 12 * 60 + 30, 16 * 60, 18 * 60 + 30]
const WEEKEND_STARTS = [10 * 60, 14 * 60]

/** A span of wall-clock time, in ms of the UTC-parts value. */
export interface WallSpan {
  startMs: number
  endMs: number
}

export interface SuggestPerson {
  id: string
  name: string
}

export interface PastYes {
  profileId: string
  /** 0 is Sunday. */
  weekday: number
  /** Minutes after midnight the option they said Yes to started. */
  startMin: number
}

interface SuggestTimesInput {
  /** The people who have to be there. Their busy time, load and past answers are what this reads. */
  people: readonly SuggestPerson[]
  /** Options start on the day AFTER this one (the Space's today). */
  fromDayKey: string
  /** How long the thing runs, in minutes. */
  durationMin: number
  /** The Space's own calendar: nothing offered overlaps any of it. */
  spaceBusy: readonly WallSpan[]
  /** Each person's own busy time, keyed by profile id. */
  personBusy?: Readonly<Record<string, readonly WallSpan[]>>
  /** The day keys each person already has a to-do due on, keyed by profile id. */
  personDueDays?: Readonly<Record<string, readonly string[]>>
  pastYes?: readonly PastYes[]
  /** Quiet hours as minutes after midnight: nothing before `endMin`, nothing past `startMin`.
   *  Defaults to 9:00 PM to 8:00 AM. */
  quietHours?: { startMin: number; endMin: number }
  /** How many days ahead to look. */
  days?: number
  count?: number
}

interface SuggestedTime {
  dayKey: string
  startMin: number
  endMin: number
  /** The wall-clock start, ISO, as the calendar stores it. */
  startsAt: string
  /** One line saying why this one. */
  reason: string
  score: number
}

function dayStartMs(dayKey: string): number | null {
  if (!DAY_RE.test(dayKey)) return null
  const [y, m, d] = dayKey.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  return Number.isNaN(ms) ? null : ms
}

const overlaps = (a: WallSpan, b: WallSpan) => a.startMs < b.endMs && b.startMs < a.endMs

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Three dates and times that suit the people named, best first, on different days. Fewer when the
 * window has fewer free slots; none when nobody can make anything, which is an honest answer.
 */
export function suggestTimes(input: SuggestTimesInput): SuggestedTime[] {
  const people = input.people
  const from = dayStartMs(input.fromDayKey)
  if (from === null) return []
  const duration = Math.min(Math.max(Math.round(input.durationMin || 60), 15), 8 * 60)
  const quiet = input.quietHours ?? { startMin: 21 * 60, endMin: 8 * 60 }
  const days = Math.min(Math.max(input.days ?? 21, 1), 60)
  const count = Math.min(Math.max(input.count ?? 3, 1), 3)
  const names = new Map(people.map((p) => [p.id, p.name]))
  const ids = new Set(names.keys())

  const busyOf = (id: string) => input.personBusy?.[id] ?? []
  const dueOn = new Map<string, Set<string>>()
  for (const [id, keys] of Object.entries(input.personDueDays ?? {})) if (ids.has(id)) dueOn.set(id, new Set(keys))
  const yes = (input.pastYes ?? []).filter((v) => ids.has(v.profileId))

  const candidates: SuggestedTime[] = []
  for (let i = 1; i <= days; i++) {
    const dayMs = from + i * DAY_MS
    const dayKey = new Date(dayMs).toISOString().slice(0, 10)
    const weekday = new Date(dayMs).getUTCDay()
    const starts = weekday === 0 || weekday === 6 ? WEEKEND_STARTS : WEEKDAY_STARTS
    for (const startMin of starts) {
      const endMin = startMin + duration
      if (startMin < quiet.endMin || endMin > quiet.startMin || endMin > 24 * 60) continue
      const span = { startMs: dayMs + startMin * 60_000, endMs: dayMs + endMin * 60_000 }
      if (input.spaceBusy.some((b) => overlaps(span, b))) continue
      if (people.some((p) => busyOf(p.id).some((b) => overlaps(span, b)))) continue

      // Who said Yes to this weekday before, and who to roughly this time of day.
      const likedDay = [...new Set(yes.filter((v) => v.weekday === weekday).map((v) => v.profileId))]
      const likedHour = [...new Set(yes.filter((v) => v.weekday === weekday && Math.abs(v.startMin - startMin) <= 90).map((v) => v.profileId))]
      const loaded = people.filter((p) => dueOn.get(p.id)?.has(dayKey)).map((p) => p.name)
      const score = 3 * likedDay.length + 2 * likedHour.length - 2 * loaded.length - i * 0.05

      const why: string[] = ['Nothing else is on the calendar then']
      if (likedDay.length) why.push(`${listNames(likedDay.map((id) => names.get(id) ?? 'someone'))} said yes to ${WEEKDAY_NAMES[weekday]} before`)
      if (people.length && !loaded.length) why.push(people.length === 1 ? 'no to-dos are due that day' : 'nobody has to-dos due that day')
      else if (loaded.length) why.push(`${listNames(loaded)} already has to-dos due that day`)
      candidates.push({
        dayKey,
        startMin,
        endMin,
        startsAt: new Date(span.startMs).toISOString(),
        reason: voiceLine(`${why.join(', and ')}.`),
        score,
      })
    }
  }

  // Best first, one per day, so the team chooses between days and not between two slots of one.
  candidates.sort((a, b) => b.score - a.score || a.startsAt.localeCompare(b.startsAt))
  const out: SuggestedTime[] = []
  const usedDays = new Set<string>()
  for (const c of candidates) {
    if (usedDays.has(c.dayKey)) continue
    usedDays.add(c.dayKey)
    out.push(c)
    if (out.length === count) break
  }
  return out
}

/** The wall-clock span of a stored calendar value (UTC parts, with or without the Z). */
export function wallSpanOf(startsAt: string | null | undefined, endsAt: string | null | undefined): WallSpan | null {
  if (!startsAt) return null
  const parse = (s: string) => Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`)
  const startMs = parse(startsAt)
  const endMs = endsAt ? parse(endsAt) : startMs + 60 * 60_000
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null
  return { startMs, endMs }
}
