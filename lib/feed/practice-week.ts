import { memberDay } from '@/lib/member-day'
export interface PracticeWeekDay { date: string; label: string; minutes: number; untimed: number; today: boolean; future: boolean }
type Session = { practice_id: string | null; seconds: number | null; ended_at: string | null }
type Log = { practice_id: string | null; logged_for: string; completed: boolean; seconds_done: number | null; seconds_target: number | null }
/** Same finish-day attribution as canonical Airtime. We do not infer paused/cross-midnight intervals. */
export function buildPracticeWeek(sessions: Session[], logs: Log[], timezone: string | null, now = new Date()): PracticeWeekDay[] {
  const today = memberDay(timezone, now)
  const anchor = new Date(`${today}T12:00:00Z`)
  const offset = (anchor.getUTCDay() + 6) % 7
  anchor.setUTCDate(anchor.getUTCDate() - offset)
  const seconds = new Map<string, number>()
  const timedPracticeDays = new Set<string>()
  for (const s of sessions) {
    if (!s.ended_at || !Number.isFinite(s.seconds) || (s.seconds ?? 0) <= 0) continue
    const day = memberDay(timezone, new Date(s.ended_at))
    seconds.set(day, (seconds.get(day) ?? 0) + s.seconds!)
    if (s.practice_id) timedPracticeDays.add(`${day}:${s.practice_id}`)
  }
  const untimed = new Map<string, number>()
  for (const log of logs) {
    if (!log.completed || (log.seconds_done ?? 0) > 0 || (log.seconds_target ?? 0) > 0 || timedPracticeDays.has(`${log.logged_for}:${log.practice_id}`)) continue
    untimed.set(log.logged_for, (untimed.get(log.logged_for) ?? 0) + 1)
  }
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
    const date = new Date(anchor); date.setUTCDate(date.getUTCDate() + i)
    const key = date.toISOString().slice(0, 10)
    return { date: key, label, minutes: key > today ? 0 : Math.round((seconds.get(key) ?? 0) / 6) / 10, untimed: key > today ? 0 : untimed.get(key) ?? 0, today: key === today, future: key > today }
  })
}
