// THE FREQUENCY RIGHT RAIL, pure half (design_handoff/frequency/templates/members/README.md §3:
// Get started, Your week, Today's goals, the local board, People to know). Everything here is a
// shaping function over rows the reads module (lib/feed/frequency-rail.ts) already fetched, so the
// week, the goals and the board are unit-tested with no database (frequency-rail-core.test.ts).
//
// NO INVENTED NUMBERS. Every count is a count of real rows; a goal with nothing behind it is left
// out rather than drawn at zero, and no goal carries a Zap reward (the prototype's "⚡ 35" and the
// setup "⚡ 50" are sample values with no ledger entry behind them).

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** One RSVP'd Event as the week reads it. `startsAt` is the stored wall clock (UTC parts). */
export interface WeekPlanRow {
  eventId: string
  slug: string
  title: string
  startsAt: string
}

export interface WeekDay {
  /** YYYY-MM-DD, the member's calendar day. */
  date: string
  dow: string
  /** Day of the month, no leading zero. */
  d: string
  items: { eventId: string; href: string; name: string; time: string }[]
}

function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** "6:30pm" / "7pm" from a wall-clock ISO stored as UTC parts. */
export function wallTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** The seven days from `today`, each carrying the plans that start on it, soonest first. */
export function buildWeek(today: string, plans: readonly WeekPlanRow[]): WeekDay[] {
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i)
    const at = new Date(`${date}T12:00:00Z`)
    return { date, dow: DOW[at.getUTCDay()], d: String(at.getUTCDate()), items: [] }
  })
  const byDate = new Map(days.map((d) => [d.date, d]))
  const seen = new Set<string>()
  for (const p of [...plans].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    if (seen.has(p.eventId)) continue
    const day = byDate.get(p.startsAt.slice(0, 10))
    if (!day) continue
    seen.add(p.eventId)
    day.items.push({ eventId: p.eventId, href: `/events/${p.slug}`, name: p.title, time: wallTime(p.startsAt) })
  }
  return days
}

export function weekPlanCount(week: readonly WeekDay[]): number {
  return week.reduce((n, d) => n + d.items.length, 0)
}

/** Only the days that carry a plan, for the compact week. Empty means the panel stays away. */
export function plannedDays(week: readonly WeekDay[]): WeekDay[] {
  return week.filter((d) => d.items.length > 0)
}

// ── Stats and streaks ────────────────────────────────────────────────────────

/** The streak headline and today's state, from the count and the seven-day run (oldest first, the
 *  last entry being the member's today). A freeze or rest window is not a log, so only `done` today
 *  counts as logged. */
export function streakReading(streak: number, last7: readonly ('done' | 'missed' | 'frozen')[]): { loggedToday: boolean; line: string } {
  const loggedToday = last7.length > 0 && last7[last7.length - 1] === 'done'
  const days = `${streak} ${streak === 1 ? 'day' : 'days'}`
  const line = loggedToday
    ? streak > 0
      ? `Logged today · ${days} safe`
      : 'Logged today'
    : streak > 0
      ? `Log today to make it ${streak + 1}`
      : 'Log a practice to start one'
  return { loggedToday, line }
}

interface SparkBar {
  key: string
  label: string
  minutes: number
  /** 0..100, the bar's height against the busiest period shown. An active period with no timed
   *  minutes gets a floor so a plain log still shows. */
  h: number
  active: boolean
}

/** The last `n` periods of the member's practice activity (lib/practice-activity.ts) as a compact
 *  bar run. Null when none of them was active: no flat line of zeros drawn as if it said something. */
export function activitySpark(
  periods: readonly { key: string; label: string; minutes: number; active: boolean }[],
  n = 8,
): { bars: SparkBar[]; activeCount: number; latestMinutes: number } | null {
  const run = periods.slice(-n)
  const activeCount = run.filter((p) => p.active).length
  if (activeCount === 0) return null
  const max = Math.max(1, ...run.map((p) => p.minutes))
  const bars = run.map((p) => ({
    key: p.key,
    label: p.label,
    minutes: p.minutes,
    active: p.active,
    h: p.minutes > 0 ? Math.max(12, Math.round((p.minutes / max) * 100)) : p.active ? 12 : 0,
  }))
  return { bars, activeCount, latestMinutes: run[run.length - 1]?.minutes ?? 0 }
}

// ── Today's goals ────────────────────────────────────────────────────────────

export interface Goal {
  key: 'practice' | 'streak' | 'lesson' | 'plan'
  title: string
  /** The right-hand reading, e.g. "1 of 2". Null when the bar says it all. */
  progress: string | null
  /** 0..100 */
  pct: number
  done: boolean
  href: string
}

interface GoalInputs {
  /** Practices the member has adopted. */
  adopted: number
  /** Adopted practices not yet logged on the member's today. */
  toLog: number
  /** Current day streak. */
  streak: number
  /** The member's enrolled Journey, if any. */
  lesson: { step: string; pct: number } | null
  /** Plans in the next seven days. */
  plans: number
}

/** Three goals for today, built only from the member's real state:
 *   1. the practice log (adopted vs logged today), or adopt one when there is none,
 *   2. the next Journey lesson when enrolled, else keeping (or starting) the streak,
 *   3. one plan in the week ahead. */
export function buildGoals(g: GoalInputs): Goal[] {
  const goals: Goal[] = []
  if (g.adopted > 0) {
    const logged = Math.max(0, g.adopted - g.toLog)
    goals.push({
      key: 'practice',
      title: g.adopted === 1 ? 'Log today’s practice' : 'Log today’s practices',
      progress: g.adopted === 1 ? null : `${logged} of ${g.adopted}`,
      pct: Math.round((logged / g.adopted) * 100),
      done: g.toLog === 0,
      href: '/practices',
    })
  } else {
    goals.push({ key: 'practice', title: 'Adopt a practice', progress: null, pct: 0, done: false, href: '/practices' })
  }
  if (g.lesson) {
    goals.push({
      key: 'lesson',
      title: g.lesson.step,
      progress: `${g.lesson.pct}%`,
      pct: g.lesson.pct,
      done: g.lesson.pct >= 100,
      href: '/journeys',
    })
  } else {
    const loggedToday = g.adopted > 0 && g.toLog < g.adopted
    goals.push({
      key: 'streak',
      title: g.streak > 0 ? `Keep your ${g.streak}-day streak` : 'Start a streak',
      progress: null,
      pct: loggedToday ? 100 : 0,
      done: loggedToday,
      href: '/practices',
    })
  }
  goals.push({
    key: 'plan',
    title: 'Say you’re going to something',
    progress: g.plans > 0 ? `${g.plans} this week` : null,
    pct: g.plans > 0 ? 100 : 0,
    done: g.plans > 0,
    href: '/events',
  })
  return goals
}

// ── The local board ──────────────────────────────────────────────────────────

export interface BoardRow {
  id: string
  name: string
  avatarUrl: string | null
  zaps: number
  /** Hidden from the individual board (profiles.meta.leaderboardOptOut). Still counts as a contributor. */
  optedOut: boolean
}

interface BoardEntry {
  n: number
  id: string
  name: string
  avatarUrl: string | null
  zaps: number
  me: boolean
}

export interface Board {
  /** Members in scope with any Zaps this season. */
  contributors: number
  /** Members in scope. */
  members: number
  top: BoardEntry[]
}

/** The cooperative local board: the top `size` by season Zaps among the member's Circle-mates, with
 *  the member's own row appended when they sit below it. Opted-out members are not listed and do
 *  not take a place number, but still count toward the shared total. */
export function buildBoard(rows: readonly BoardRow[], me: string, size = 4): Board | null {
  if (rows.length < 2) return null
  const contributors = rows.filter((r) => r.zaps > 0).length
  const listed = [...rows].filter((r) => !r.optedOut).sort((a, b) => b.zaps - a.zaps || a.name.localeCompare(b.name))
  const entries: BoardEntry[] = listed.map((r, i) => ({ n: i + 1, id: r.id, name: r.name, avatarUrl: r.avatarUrl, zaps: r.zaps, me: r.id === me }))
  const top = entries.slice(0, size)
  const mine = entries.find((e) => e.me)
  if (mine && !top.some((e) => e.me)) top.push(mine)
  if (top.length === 0) return null
  return { contributors, members: rows.length, top }
}
