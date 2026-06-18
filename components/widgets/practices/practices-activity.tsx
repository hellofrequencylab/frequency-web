import { Flame } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMemberPractices, getRecentPracticeLogs } from '@/lib/practices'
import { getPracticeStreak } from '@/lib/practice-streak'
import { SectionHeader } from '@/components/ui/section-header'

// Practices layout module (ADR-270/294): "Your activity" — an 8-week contribution-style heatmap
// of the days the member logged a practice. Self-fetching RSC, no client JS; renders nothing for
// a logged-out viewer or one with no practices and no logs yet (matching the page's prior gate).
// Keeps the id="practices-activity" anchor. The grid runs in week columns (oldest week left,
// this week right), each column a Mon→Sun run of seven day cells.

const WEEKS = 8
const WINDOW = WEEKS * 7 // 56 days

// A calm, non-shaming line for the current streak state — never a broken-streak warning.
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

  const [mine, recent, streak] = await Promise.all([
    getMemberPractices(profileId),
    getRecentPracticeLogs(profileId, WINDOW + 7),
    getPracticeStreak(profileId),
  ])
  if (recent.length === 0 && mine.length === 0) return null

  const loggedDays = new Set(recent.map((r) => r.logged_for))
  const today = new Date()

  // The trailing WINDOW days, oldest first.
  const days = Array.from({ length: WINDOW }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (WINDOW - 1 - i))
    return d.toISOString().slice(0, 10)
  })
  const daysPracticed = days.filter((d) => loggedDays.has(d)).length

  // Lay the days out in week columns. The first column is padded with empty
  // placeholders so each column starts on the same weekday (the grid reads as a
  // clean calendar, not a ragged run).
  const firstWeekday = new Date(`${days[0]}T00:00:00Z`).getUTCDay() // 0=Sun
  const cells: (string | null)[] = [...Array(firstWeekday).fill(null), ...days]
  const columns: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7))

  const line = streakLine(streak)

  return (
    <section id="practices-activity" className="max-w-2xl scroll-mt-20">
      <SectionHeader title="Your activity" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Flame className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Last 8 weeks
          </span>
          <span className="text-sm font-semibold text-text">
            {daysPracticed} {daysPracticed === 1 ? 'day' : 'days'} practiced
          </span>
        </div>

        <div className="flex gap-1" role="img" aria-label={`${daysPracticed} days practiced in the last 8 weeks`}>
          {columns.map((week, ci) => (
            <div key={ci} className="flex flex-1 flex-col gap-1">
              {week.map((d, ri) =>
                d === null ? (
                  <div key={ri} className="aspect-square rounded-sm bg-transparent" aria-hidden />
                ) : (
                  <div
                    key={ri}
                    title={`${d}${loggedDays.has(d) ? ' · practiced' : ''}`}
                    className={`aspect-square rounded-sm ${
                      loggedDays.has(d) ? 'bg-primary' : 'border border-border bg-surface'
                    }`}
                  />
                ),
              )}
            </div>
          ))}
        </div>

        {line && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-text">
            <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            {line}
          </p>
        )}
      </div>
    </section>
  )
}
