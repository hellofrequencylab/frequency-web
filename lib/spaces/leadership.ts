import { mensworkSeason, mensworkSignStarting, type MensworkSeason, type MensworkSign } from '@/lib/theme/menswork'

// THE LEADERSHIP ROOM (LIVE-862, owner ask 2026-10-07: "I also want the Executive Overview and Yearly
// Calendar in an admin gated area of the website. Create an obvious Admin link in the menu for the role.").
// PURE. The data rules behind the Space console page /spaces/<slug>/manage/leadership: the executive
// overview (owner-written Markdown on the Space) and the yearly calendar (the Space's own events laid over
// the program's seasons and signs).
//
// 🔴 THE OVERVIEW IS PRIVATE TO THE SPACE'S MANAGERS. It lives on `spaces.preferences.programOverview`,
// and preferences ride the Space row every public surface reads (the website's cached row, the Space page).
// Nothing public reads the key, `withoutLeadershipPreferences` strips it from the public profile
// projection (lib/spaces/profile-modules.ts toProfileContext), and lib/spaces/leadership.test.ts freezes
// the set of files allowed to name it.

/** The preferences key holding the executive overview Markdown. */
export const PROGRAM_OVERVIEW_KEY = 'programOverview'

/** A ceiling on the stored overview, so one save cannot bloat the Space row every page reads. */
export const PROGRAM_OVERVIEW_MAX = 60_000

function asRecord(preferences: unknown): Record<string, unknown> | null {
  return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? (preferences as Record<string, unknown>)
    : null
}

/** The overview Markdown on a Space's preferences, or '' when it has none. */
export function readProgramOverview(preferences: unknown): string {
  const v = asRecord(preferences)?.[PROGRAM_OVERVIEW_KEY]
  return typeof v === 'string' ? v : ''
}

/** The next preferences blob for an overview save. Only the one key changes; an empty overview removes
 *  it. Over the ceiling is refused rather than cut, so a save never silently loses the end of a doc. */
export function nextProgramOverviewPreferences(
  current: unknown,
  markdown: string,
): { preferences: Record<string, unknown> } | { error: string } {
  const text = typeof markdown === 'string' ? markdown.replace(/\r\n/g, '\n').trim() : ''
  if (text.length > PROGRAM_OVERVIEW_MAX) return { error: 'That overview is too long to save. Trim it and try again.' }
  const next = { ...(asRecord(current) ?? {}) }
  if (text) next[PROGRAM_OVERVIEW_KEY] = text
  else delete next[PROGRAM_OVERVIEW_KEY]
  return { preferences: next }
}

/** Preferences with every leadership-only key removed: what a public projection of a Space may carry.
 *  Returns the input untouched when it holds none, so the common case allocates nothing. */
export function withoutLeadershipPreferences<T>(preferences: T): T {
  const rec = asRecord(preferences)
  if (!rec || !(PROGRAM_OVERVIEW_KEY in rec)) return preferences
  const rest = { ...rec }
  delete rest[PROGRAM_OVERVIEW_KEY]
  return rest as T
}

// ── THE YEARLY CALENDAR ──────────────────────────────────────────────────────────────────────────────

/** The season names and their fixed date lines, as the program states them. */
export const SEASON_INFO: Record<MensworkSeason, { name: string; range: string }> = {
  winter: { name: 'Winter', range: 'Dec 21 to Mar 19' },
  spring: { name: 'Spring', range: 'Mar 20 to Jun 20' },
  summer: { name: 'Summer', range: 'Jun 21 to Sep 21' },
  fall: { name: 'Fall', range: 'Sep 22 to Dec 20' },
}

/** One of the Space's events, as the calendar draws it. */
export interface ProgramEvent {
  slug: string
  title: string
  /** YYYY-MM-DD the event starts, in its own wall clock. */
  dayKey: string
  /** YYYY-MM-DD it ends, when that is a later day. */
  endDayKey: string | null
  timeLabel: string | null
  draft: boolean
  cancelled: boolean
}

/** A LIGHT styling hint from the title. It never invents or hides an event; an unmatched title is `event`. */
export type ProgramEventKind = 'course' | 'circle' | 'gathering' | 'retreat' | 'enroll' | 'event'

export function programEventKind(ev: Pick<ProgramEvent, 'title' | 'dayKey' | 'endDayKey'>): ProgramEventKind {
  const t = ev.title.toLowerCase()
  if (/\bretreat\b/.test(t) || (ev.endDayKey && ev.endDayKey > ev.dayKey)) return 'retreat'
  if (/\bcircle night\b/.test(t)) return 'circle'
  if (/\bopening course\b|\bweek \d+\b|\bhearts? on fire\b/.test(t)) return 'course'
  if (/\bgathering\b/.test(t)) return 'gathering'
  if (/\benrol+ment\b/.test(t)) return 'enroll'
  return 'event'
}

/** A day on the calendar. */
export interface ProgramDay {
  key: string
  day: number
  /** 0 = Sunday. */
  weekday: number
  season: MensworkSeason
  /** Set on the first day of a season: the season it leaves. */
  boundaryFrom: MensworkSeason | null
  signStart: MensworkSign | null
  /** The events on this day, multi-day ones on every day they span. */
  events: { event: ProgramEvent; kind: ProgramEventKind; dayOf: number; days: number }[]
  isToday: boolean
  isPast: boolean
}

export interface ProgramMonth {
  /** Anchor id, `m-YYYY-MM`. */
  id: string
  year: number
  /** 0 to 11. */
  month0: number
  leadIn: boolean
  /** Weeks, Sunday first; null pads the first and last weeks. */
  weeks: (ProgramDay | null)[][]
  /** The seasons the month touches, in order. */
  seasons: MensworkSeason[]
  /** Days in the month that carry at least one event. */
  eventDays: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayKeyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const utc = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d))

/** The window a program year covers: the December lead-in of the year before, through December. */
export function programYearWindow(year: number): { fromDay: string; toDay: string } {
  return { fromDay: `${year - 1}-12-01`, toDay: `${year + 1}-01-01` }
}

/** WHICH PROGRAM YEAR TO SHOW. A year runs Dec (Y-1) to Dec Y. Today's calendar year, unless nothing of it
 *  is left ahead and the next one already has events, which is the planning season before an enrollment
 *  opens (Oct 2026 with a 2027 program reads 2027). Derived, never hardcoded. */
export function pickProgramYear(today: Date, eventDayKeys: readonly string[]): number {
  const y = today.getUTCFullYear()
  const todayKey = dayKeyOf(today)
  const inWindow = (key: string, year: number) => {
    const w = programYearWindow(year)
    return key >= w.fromDay && key < w.toDay
  }
  // December is both the end of one year and the lead-in of the next; "left this year" stops before it.
  const aheadThisYear = eventDayKeys.some((k) => k >= todayKey && inWindow(k, y) && k < `${y}-12-01`)
  const nextYear = eventDayKeys.some((k) => inWindow(k, y + 1))
  return !aheadThisYear && nextYear ? y + 1 : y
}

/** Every day an event covers, start through end, capped at two weeks so a bad end date cannot flood. */
function spanKeys(ev: ProgramEvent): string[] {
  const [y, m, d] = ev.dayKey.split('-').map(Number)
  const keys = [ev.dayKey]
  if (!ev.endDayKey || ev.endDayKey <= ev.dayKey) return keys
  for (let i = 1; i < 14; i++) {
    const k = dayKeyOf(utc(y, m - 1, d + i))
    if (k > ev.endDayKey) break
    keys.push(k)
  }
  return keys
}

/** The program year's thirteen months, December lead-in first, with every day's season, boundary, sign
 *  start and events. `today` decides the Today and past marks. */
export function buildProgramYear(year: number, events: readonly ProgramEvent[], today: Date): ProgramMonth[] {
  const todayKey = dayKeyOf(today)
  const byDay = new Map<string, ProgramDay['events']>()
  for (const ev of events) {
    const keys = spanKeys(ev)
    const kind = programEventKind(ev)
    keys.forEach((k, i) => {
      const list = byDay.get(k) ?? []
      list.push({ event: ev, kind, dayOf: i + 1, days: keys.length })
      byDay.set(k, list)
    })
  }

  const months: ProgramMonth[] = []
  for (let i = 0; i < 13; i++) {
    const first = utc(year - 1, 11 + i, 1)
    const y = first.getUTCFullYear()
    const month0 = first.getUTCMonth()
    const daysIn = utc(y, month0 + 1, 0).getUTCDate()
    const cells: (ProgramDay | null)[] = Array.from({ length: first.getUTCDay() }, () => null)
    const seasons: MensworkSeason[] = []
    let eventDays = 0
    for (let d = 1; d <= daysIn; d++) {
      const date = utc(y, month0, d)
      const key = dayKeyOf(date)
      const season = mensworkSeason(date)
      const before = mensworkSeason(utc(y, month0, d - 1))
      if (!seasons.includes(season)) seasons.push(season)
      // In the order handed in, which is start time (the reader sorts by starts_at).
      const dayEvents = byDay.get(key) ?? []
      if (dayEvents.length) eventDays++
      cells.push({
        key,
        day: d,
        weekday: date.getUTCDay(),
        season,
        boundaryFrom: before !== season ? before : null,
        signStart: mensworkSignStarting(date),
        events: dayEvents,
        isToday: key === todayKey,
        isPast: key < todayKey,
      })
    }
    while (cells.length % 7) cells.push(null)
    const weeks: (ProgramDay | null)[][] = []
    for (let w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7))
    months.push({ id: `m-${y}-${pad(month0 + 1)}`, year: y, month0, leadIn: i === 0, weeks, seasons, eventDays })
  }
  return months
}

// ── THE CALENDAR'S SMALL MARKS (LIVE-864) ────────────────────────────────────────────────────────────

/** US holidays the yearly calendar prints at the foot of a day, for the program year's thirteen months
 *  (the December lead-in, then January to December). Computed, never a list to keep up. */
export function programHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>()
  const put = (y: number, m0: number, d: number, name: string) => out.set(dayKeyOf(utc(y, m0, d)), name)
  /** The nth weekday (0 = Sunday) of a month; n = -1 is the last. */
  const nth = (y: number, m0: number, weekday: number, n: number) => {
    if (n < 0) {
      const last = utc(y, m0 + 1, 0)
      return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)
    }
    return 1 + ((weekday - utc(y, m0, 1).getUTCDay() + 7) % 7) + (n - 1) * 7
  }
  const y = year
  put(y - 1, 11, 24, 'Christmas Eve')
  put(y - 1, 11, 25, 'Christmas')
  put(y - 1, 11, 31, "New Year's Eve")
  put(y, 0, 1, "New Year's Day")
  put(y, 0, nth(y, 0, 1, 3), 'MLK Day')
  put(y, 1, 14, "Valentine's Day")
  put(y, 1, nth(y, 1, 1, 3), "Presidents' Day")
  // Easter Sunday (anonymous Gregorian computus).
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((8 * b + 13) / 25)) / 3) + 15) % 30
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7
  const mm = Math.floor((a + 11 * h + 22 * l) / 451)
  const easterMonth = Math.floor((h + l - 7 * mm + 114) / 31)
  put(y, easterMonth - 1, ((h + l - 7 * mm + 114) % 31) + 1, 'Easter')
  put(y, 4, nth(y, 4, 0, 2), "Mother's Day")
  put(y, 4, nth(y, 4, 1, -1), 'Memorial Day')
  put(y, 5, 19, 'Juneteenth')
  put(y, 5, nth(y, 5, 0, 3), "Father's Day")
  put(y, 6, 4, 'Independence Day')
  put(y, 8, nth(y, 8, 1, 1), 'Labor Day')
  put(y, 9, nth(y, 9, 1, 2), "Indigenous Peoples' Day")
  put(y, 9, 31, 'Halloween')
  put(y, 10, 11, 'Veterans Day')
  put(y, 10, nth(y, 10, 4, 4), 'Thanksgiving')
  put(y, 11, 24, 'Christmas Eve')
  put(y, 11, 25, 'Christmas')
  put(y, 11, 31, "New Year's Eve")
  return out
}

/** A course session's chip title: "Week 3" from "Opening course, week 3", else the event's own title. */
export function courseChipTitle(title: string): string {
  const m = /\bweek\s+(\d+)\b/i.exec(title)
  return m ? `Week ${m[1]}` : title
}

/** The small line under a pencilled-in gathering: the description's one-word opener (the seasonal feast
 *  it falls on) and where it sits in its sign, as "Imbolc · mid-Aquarius". Null when the description does
 *  not open with one word. */
export function gatheringNote(description: string | null | undefined, signName: string): string | null {
  const first = /^\s*([A-Z][\w'-]*)\./.exec(description ?? '')
  return first ? `${first[1]} · mid-${signName}` : null
}
