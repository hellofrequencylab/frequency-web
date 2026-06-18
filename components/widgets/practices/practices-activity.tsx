import { Flame } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, getRecentPracticeLogs } from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'

// Practices layout module (ADR-270/294): "Your activity" — a compact, left-to-right daily graph of
// the last 4 weeks (Insight Timer style). Each day is a bar whose height is the MINUTES practiced
// that day (airtime from On Air sits); a day that was logged without a timed sit gets a short bar,
// and an empty day gets a faint baseline tick. Self-fetching RSC, no client JS; renders nothing for
// a logged-out viewer or one with no practices and no logs yet. Keeps the id="practices-activity".

const DAYS = 28

function streakLine(streak: {
  current: number
  loggedToday: boolean
  atRisk: boolean
  resting: boolean
}): string | null {
  if (streak.resting) return 'Resting'
  if (streak.current === 0) return null
  const days = `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`
  if (streak.loggedToday) return `${days} streak`
  if (streak.atRisk) return `${days} streak. Log today to keep it.`
  return `${days} streak`
}

export async function PracticesActivity() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - (DAYS - 1))
  const windowStartISO = windowStart.toISOString().slice(0, 10)

  const [mine, recent, streak, sessions] = await Promise.all([
    getMemberPractices(profileId),
    getRecentPracticeLogs(profileId, DAYS * 4),
    getPracticeStreak(profileId),
    createAdminClient()
      .from('practice_sessions')
      .select('seconds, ended_at')
      .eq('profile_id', profileId)
      .gte('ended_at', `${windowStartISO}T00:00:00Z`)
      .then((r) => (r.data ?? []) as { seconds: number | null; ended_at: string | null }[]),
  ])
  if (recent.length === 0 && mine.length === 0) return null

  // Per-day airtime (minutes) + whether the day was logged at all.
  const secondsByDay = new Map<string, number>()
  for (const s of sessions) {
    const day = s.ended_at?.slice(0, 10)
    if (day) secondsByDay.set(day, (secondsByDay.get(day) ?? 0) + (s.seconds ?? 0))
  }
  const loggedDays = new Set(recent.map((r) => r.logged_for))

  const today = new Date()
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (DAYS - 1 - i))
    return d.toISOString().slice(0, 10)
  })
  const minutesOf = (day: string) => Math.round((secondsByDay.get(day) ?? 0) / 60)
  const maxMin = Math.max(1, ...days.map(minutesOf))
  const daysPracticed = days.filter((d) => loggedDays.has(d) || (secondsByDay.get(d) ?? 0) > 0).length
  const totalMin = days.reduce((s, d) => s + minutesOf(d), 0)

  const line = streakLine(streak)

  return (
    <section id="practices-activity" className="max-w-2xl scroll-mt-20">
      <SectionHeader title="Your activity" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2.5 flex items-end justify-between gap-2">
          <span className="text-xs font-medium text-subtle">Last 4 weeks</span>
          <span className="text-sm font-semibold text-text">
            {daysPracticed} {daysPracticed === 1 ? 'day' : 'days'}
            {totalMin > 0 ? <span className="font-normal text-muted"> · {totalMin} min</span> : null}
          </span>
        </div>

        {/* Daily bars, oldest left -> today right. Height = minutes (airtime); a logged-but-untimed
            day gets a short bar; an empty day gets a faint baseline tick. */}
        <div className="flex h-16 items-end gap-[3px]" role="img" aria-label={`${daysPracticed} days practiced in the last 4 weeks`}>
          {days.map((d) => {
            const min = minutesOf(d)
            const logged = loggedDays.has(d) || min > 0
            const pct = min > 0 ? Math.min(100, Math.max(20, Math.round((min / maxMin) * 100))) : logged ? 16 : 0
            return (
              <div
                key={d}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${d}${min > 0 ? ` · ${min} min` : logged ? ' · practiced' : ''}`}
              >
                {pct > 0 ? (
                  <div className={`w-full rounded-sm ${min > 0 ? 'bg-primary' : 'bg-primary/45'}`} style={{ height: `${pct}%` }} />
                ) : (
                  <div className="h-px w-full rounded-full bg-border" />
                )}
              </div>
            )
          })}
        </div>

        {line && (
          <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-text">
            <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> {line}
          </p>
        )}
      </div>
    </section>
  )
}
