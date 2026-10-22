import { storedWallClock } from '@/lib/sites/site-events'
import { templeSpan } from '@/lib/sites/temple-events'

// THE TEMPLE'S STANDING WEEK (design: "Same slots, all year"). Derived, never typed in: the recurring series a
// Space publishes, read for the next four weeks and folded onto the weekday each lands on. Two series on one
// weekday that never share a date alternate ("or"); two that land on the same date run in order ("then").
// A weekday with no series is a quiet card; its words, when the owner wrote any, come from the site's own
// content, never from the Space's internal day notes (those are team-only, ADR-1387). PURE.

const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** The week reads Monday first, Sunday last, as the design sets it. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_MS = 86_400_000
const WINDOW_DAYS = 28
/** A quiet day the owner words as a closure reads as held (the night card). */
const HELD = /\b(held|retreat|rental|private|closed|reserved)\b/i

export interface TempleWeekEvent {
  title: string
  startsAt: string
  endsAt?: string | null
  recurring?: boolean
}

export interface TempleDay {
  name: string
  slots: { title: string; time: string | null }[]
  joiner: 'or' | 'then'
  note: string | null
  tone: 'busy' | 'quiet' | 'held'
}

/** The weekday a card title names ("Friday", "Fri"), or null. */
export function weekdayOfTitle(title: string): number | null {
  const t = title.trim().toLowerCase()
  const i = FULL.findIndex((d) => d.toLowerCase() === t || d.slice(0, 3).toLowerCase() === t)
  return i < 0 ? null : i
}

/** The seven days, from the recurring rows in the next four weeks and the owner's own day words. */
export function templeWeek(events: readonly TempleWeekEvent[], now: Date, words: ReadonlyMap<number, string> = new Map()): TempleDay[] {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const to = from + WINDOW_DAYS * DAY_MS
  const byDay = new Map<number, Map<string, { time: string | null; dates: Set<string>; count: number }>>()
  for (const e of events) {
    if (!e.recurring) continue
    const s = storedWallClock(e.startsAt)
    if (!s || s.getTime() < from || s.getTime() >= to) continue
    const wd = s.getUTCDay()
    const titles = byDay.get(wd) ?? new Map()
    const hit = titles.get(e.title) ?? { time: templeSpan(e.startsAt, e.endsAt), dates: new Set<string>(), count: 0 }
    hit.dates.add(s.toISOString().slice(0, 10))
    hit.count += 1
    titles.set(e.title, hit)
    byDay.set(wd, titles)
  }
  return ORDER.map((wd) => {
    const titles = byDay.get(wd)
    const slots = titles ? [...titles.entries()].map(([title, v]) => ({ title, time: v.time })) : []
    if (!titles || slots.length === 0) {
      const note = words.get(wd) ?? null
      return { name: FULL[wd].slice(0, 3), slots, joiner: 'or', note, tone: note && HELD.test(note) ? 'held' : 'quiet' } satisfies TempleDay
    }
    const seen = new Set<string>()
    let shared = false
    for (const v of titles.values()) {
      for (const d of v.dates) {
        if (seen.has(d)) shared = true
        seen.add(d)
      }
    }
    const joiner = shared ? 'then' : 'or'
    const note = words.get(wd) ?? (slots.length < 2 ? null : joiner === 'then' ? `Most ${FULL[wd]}s` : 'Alternating')
    return { name: FULL[wd].slice(0, 3), slots, joiner, note, tone: 'busy' } satisfies TempleDay
  })
}
