// WHEN A PENCIL HOLD LAPSES, AND WHO HEARS ABOUT IT (calendar suite pass 8 · LIVE-1709), the pure
// half. `space_plans.hold_until` is a calendar DAY the Plan holds its dates through (pass 2). A
// day only means something in the Space's own time zone, so every decision here takes the Space's
// local day and hour as inputs; lib/calendar/hold-lapse.ts reads them off the clock and does the
// IO. Nothing here touches a database.
//
// THE RULES, once:
//   * The hold lasts THROUGH `hold_until`. It lapses the first local morning after that day.
//   * A warning goes out when ONE day is left (tomorrow is the last day to pick).
//   * An overdue to-do is nudged once, the morning after its due day, to the person it is
//     assigned to, and only if they work the Space the Plan lives in (a guest-side assignee has
//     no door into the host's calendar, so a link would only hit a wall).
//   * Everything for a Space happens in ONE local hour (NOTIFY_HOUR), so a push lands in the
//     morning there and each Space is looked at once a day from one hourly UTC schedule.
// Copy is camp counselor: pain point first, no promise it cannot keep, no long dash, no cadence.

import { voiceLine } from '@/lib/ai/voice'

/** The local hour a Space's holds and nudges are looked at. */
const NOTIFY_HOUR = 9

/** True in the one local hour a Space is processed. */
export function isNotifyHour(localHour: number): boolean {
  return localHour === NOTIFY_HOUR
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dayNumber(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null
}

/** Whole days from `from` to `to` (both yyyy-mm-dd). Null when either is not a day. */
function daysBetween(from: string, to: string): number | null {
  const a = dayNumber(from)
  const b = dayNumber(to)
  return a === null || b === null ? null : b - a
}

/** `day` moved by `n` days, as yyyy-mm-dd. Null when `day` is not a day. */
function addDays(day: string, n: number): string | null {
  const d = dayNumber(day)
  return d === null ? null : new Date((d + n) * 86_400_000).toISOString().slice(0, 10)
}

/** What today does to a hold: nothing yet, a warning (one day left), or a release (it lapsed). A
 *  missing or malformed day moves nothing. `today` is the Space's local day. */
export function holdMove(holdUntil: string | null | undefined, today: string): 'hold' | 'warn' | 'release' {
  if (!holdUntil) return 'hold'
  const left = daysBetween(today, holdUntil)
  if (left === null) return 'hold'
  if (left < 0) return 'release'
  return left === 1 ? 'warn' : 'hold'
}

/** Who hears about a hold: the Plan's owner, else whoever started it, else the Space's owner. */
export function holdRecipient(plan: { ownerProfileId: string | null; createdBy: string | null }, spaceOwnerProfileId: string | null): string | null {
  return plan.ownerProfileId ?? plan.createdBy ?? spaceOwnerProfileId ?? null
}

export interface OverdueTask {
  id: string
  title: string
  planTitle: string
  assigneeProfileId: string | null
  /** The day it was due, yyyy-mm-dd (a to-do's `due_at` sliced to its day). */
  dueDay: string | null
  status: string
}

/** Who gets an overdue nudge today: the assignee of every open to-do that was due YESTERDAY, once
 *  each person, with all of theirs in one note. `canWork` says whether the assignee works this
 *  Space. A to-do with no assignee, no real due day, one done, or one still due is left alone. */
export function overdueNudges(tasks: readonly OverdueTask[], today: string, canWork: (profileId: string) => boolean) {
  const yesterday = addDays(today, -1)
  const byPerson = new Map<string, { profileId: string; titles: string[]; planTitles: string[] }>()
  for (const t of tasks) {
    if (!yesterday || t.status !== 'open' || !t.assigneeProfileId || t.dueDay !== yesterday) continue
    if (!canWork(t.assigneeProfileId)) continue
    const entry = byPerson.get(t.assigneeProfileId) ?? { profileId: t.assigneeProfileId, titles: [], planTitles: [] }
    entry.titles.push(t.title)
    if (!entry.planTitles.includes(t.planTitle)) entry.planTitles.push(t.planTitle)
    byPerson.set(t.assigneeProfileId, entry)
  }
  return [...byPerson.values()]
}

interface Copy {
  title: string
  body: string
}

function clip(text: string, max = 60): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

function said(copy: Copy): Copy {
  return { title: voiceLine(copy.title), body: voiceLine(copy.body) }
}

/** One day left on a hold. */
export function holdWarningCopy(planTitle: string): Copy {
  return said({
    title: `Your hold on "${clip(planTitle)}" runs out tomorrow`,
    body: 'Still on the fence? Pick a date, or let it go and the days open back up.',
  })
}

/** A hold that lapsed and let its dates go. */
export function holdReleasedCopy(planTitle: string): Copy {
  return said({
    title: `Your hold on "${clip(planTitle)}" let go`,
    body: 'Nobody picked a date in time, so those days are free again. Pencil it back in whenever you are ready.',
  })
}

/** The morning-after note about to-dos that slipped. */
export function overdueCopy(nudge: { titles: readonly string[]; planTitles: readonly string[] }): Copy {
  if (nudge.titles.length === 1) {
    return said({
      title: `"${clip(nudge.titles[0])}" slipped past its day`,
      body: `It happens. On "${clip(nudge.planTitles[0])}". Check it off if it is done, or move it to a day that works.`,
    })
  }
  return said({
    title: `${nudge.titles.length} to-dos slipped past their day`,
    body: 'It happens. Check off what is done and move the rest to days that work.',
  })
}

/** The outbox keys that make a repeated run harmless: one warning and one release per hold, one
 *  overdue note per person per Space per local day. */
export function holdKey(moment: 'warn' | 'released', planId: string, holdUntil: string): string {
  return `plan-hold-${moment}:${planId}:${holdUntil}`
}

export function overdueKey(profileId: string, spaceId: string, today: string): string {
  return `plan-overdue:${profileId}:${spaceId}:${today}`
}
