// Member practice-activity series (ADR-270/294). Powers the "Your activity" visualizer — an
// Insight-Timer-style bar chart with Days / Weeks / Months views. One server fetch builds all three
// series so the client can flip views with no extra round trip. Each bar's value is MINUTES
// practiced (airtime from On Air sits); a period that was logged without a timed sit still counts as
// active (a short floor bar). Server-only: reads go through the admin client behind app authz.

import { createAdminClient } from '@/lib/supabase/admin'
import { getMemberPractices } from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { memberDay } from '@/lib/member-day'

const DAYS_VIEW = 14
const WEEKS_VIEW = 10
const MONTHS_VIEW = 6

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type ActivityView = 'days' | 'weeks' | 'months'

export interface ActivityBar {
  key: string
  /** Short axis label (weekday initial · week start · month abbrev). */
  label: string
  minutes: number
  /** Any practice that period (a timed sit OR a plain log). */
  active: boolean
}

export interface MemberActivity {
  days: ActivityBar[]
  weeks: ActivityBar[]
  months: ActivityBar[]
  streakLine: string | null
  /** No practices and no logs ⇒ the caller renders nothing. */
  hasAny: boolean
}

function streakLine(streak: { current: number; loggedToday: boolean; atRisk: boolean; resting: boolean }): string | null {
  if (streak.resting) return 'Resting'
  if (streak.current === 0) return null
  const days = `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`
  if (streak.loggedToday) return `${days} streak`
  if (streak.atRisk) return `${days} streak. Log today to keep it.`
  return `${days} streak`
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10)

/** A member's practice activity across Days (14), Weeks (10), and Months (6). One fetch covers the
 *  longest window; the three series are bucketed from a single per-day tally. */
export async function getMemberActivity(profileId: string): Promise<MemberActivity> {
  const admin = createAdminClient()
  // The chart's day/week/month buckets must line up with practice_logs.logged_for,
  // which is written in the member's LOCAL calendar day. Anchoring "today" in UTC put
  // an evening-Pacific member's log in tomorrow's column. Resolve the member's tz once
  // and bucket everything (logs + timed sits) by their local day. The anchor is a
  // member-local calendar date carried as a UTC-midnight Date, so isoOf (UTC) and the
  // getUTC*/setUTC* math below stay aligned to that local calendar.
  const { data: profRow } = await admin
    .from('profiles')
    .select('home_timezone')
    .eq('id', profileId)
    .maybeSingle()
  const tz = (profRow as { home_timezone: string | null } | null)?.home_timezone ?? null
  const [ty, tm, td] = memberDay(tz).split('-').map(Number)
  const today = new Date(Date.UTC(ty, tm - 1, td))
  // The earliest day any view needs: the first of the oldest month shown.
  const windowStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MONTHS_VIEW - 1), 1))
  const windowStartISO = isoOf(windowStart)

  const [mine, streak, logsRes, sessionsRes] = await Promise.all([
    getMemberPractices(profileId),
    getPracticeStreak(profileId),
    admin.from('practice_logs').select('logged_for').eq('profile_id', profileId).gte('logged_for', windowStartISO),
    admin
      .from('practice_sessions')
      .select('seconds, ended_at')
      .eq('profile_id', profileId)
      .gte('ended_at', `${windowStartISO}T00:00:00Z`),
  ])
  const logs = (logsRes.data ?? []) as { logged_for: string }[]
  const sessions = (sessionsRes.data ?? []) as { seconds: number | null; ended_at: string | null }[]
  const hasAny = mine.length > 0 || logs.length > 0 || sessions.length > 0

  // Per-day minutes (rounded airtime) + whether the day was logged at all.
  const minutesByDay = new Map<string, number>()
  for (const s of sessions) {
    // A timed sit's minutes bucket by the member's LOCAL day of ended_at (an instant),
    // so an evening-Pacific sit counts for the same local day its log does.
    const day = s.ended_at ? memberDay(tz, new Date(s.ended_at)) : null
    if (day) minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + Math.round((s.seconds ?? 0) / 60))
  }
  const loggedDays = new Set(logs.map((l) => l.logged_for))
  const dayMinutes = (iso: string) => minutesByDay.get(iso) ?? 0
  const dayActive = (iso: string) => loggedDays.has(iso) || dayMinutes(iso) > 0

  // Days — the last 14, oldest left → today right.
  const days: ActivityBar[] = Array.from({ length: DAYS_VIEW }, (_, i) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - (DAYS_VIEW - 1 - i))
    const iso = isoOf(d)
    return { key: iso, label: DAY_INITIALS[d.getUTCDay()], minutes: dayMinutes(iso), active: dayActive(iso) }
  })

  // Weeks — the last 10 rolling 7-day buckets, each labelled by its start date.
  const weeks: ActivityBar[] = Array.from({ length: WEEKS_VIEW }, (_, i) => {
    const end = new Date(today)
    end.setUTCDate(end.getUTCDate() - 7 * (WEEKS_VIEW - 1 - i))
    let minutes = 0
    let active = false
    for (let k = 0; k < 7; k++) {
      const d = new Date(end)
      d.setUTCDate(d.getUTCDate() - k)
      const iso = isoOf(d)
      minutes += dayMinutes(iso)
      active = active || dayActive(iso)
    }
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 6)
    return { key: isoOf(end), label: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`, minutes, active }
  })

  // Months — the last 6 calendar months.
  const months: ActivityBar[] = Array.from({ length: MONTHS_VIEW }, (_, i) => {
    const m = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (MONTHS_VIEW - 1 - i), 1))
    const y = m.getUTCFullYear()
    const mo = m.getUTCMonth()
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
    let minutes = 0
    let active = false
    for (let day = 1; day <= last; day++) {
      const iso = isoOf(new Date(Date.UTC(y, mo, day)))
      minutes += dayMinutes(iso)
      active = active || dayActive(iso)
    }
    return { key: `${y}-${mo}`, label: MONTH_ABBR[mo], minutes, active }
  })

  return { days, weeks, months, streakLine: streakLine(streak), hasAny }
}
