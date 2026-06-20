import { CalendarCheck, PenTool, Mic, Flame, Shield } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPracticeStreak } from '@/lib/practice-streak'
import { STREAK_CONFIG, isStreakActive, type StreakType } from '@/lib/gamification'
import { streakProgress } from '@/lib/streak'
import { SectionHeader } from '@/components/ui/section-header'
import { StreakHero } from '@/components/quest/streak-hero'

const STREAK_ICONS: Record<StreakType, React.ElementType> = {
  attendance: CalendarCheck,
  posting: PenTool,
  hosting: Mic,
  login: Flame,
}

function getRhythmColor(count: number): string {
  return count >= 1 ? 'text-primary' : 'text-subtle'
}

function getRhythmBg(count: number): string {
  return count >= 1 ? 'bg-primary-bg' : 'bg-surface-elevated'
}

type StreakRow = {
  streak_type: StreakType
  current_count: number | null
  longest_count: number | null
  last_activity_at: string | null
}

// Leaderboard layout module (ADR-270/294): "Consistency" — the daily practice streak (bounded
// forgiveness) + the weekly show-up rhythms, framed as how the steady person wins. A self-fetching
// RSC keyed only on the viewer (no scope/track facet, so it is a clean standalone block, unlike the
// scope-driven collective goal / standing band / individual board which stay hand-composed in the
// page). Returns null for a logged-out viewer (the module contract). Reads the streaks rows directly
// rather than the redirecting getStreaksData action so it can degrade to null instead of redirecting.
export async function LeaderboardConsistency() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const admin = createAdminClient()
  const [{ data: streakRows }, practice] = await Promise.all([
    admin.from('streaks').select('streak_type, current_count, longest_count, last_activity_at').eq('profile_id', profileId),
    getPracticeStreak(profileId),
  ])

  const streaks = ((streakRows ?? []) as StreakRow[]).map((s) => ({
    ...s,
    streak_type: s.streak_type as StreakType,
  }))

  // Daily practice streak, the headline. Progress is the milestone ladder.
  const prog = streakProgress(practice.current)

  // When the member is resting, name the day the rest ends (server-formatted so the client
  // component stays presentational).
  const restEndsLabel = practice.rest
    ? new Date(`${practice.rest.through}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      })
    : null

  // Weekly streaks (the show-up rhythms) sit below.
  const streakMap = new Map(streaks.map((s) => [s.streak_type, s]))
  const weeklyTypes: StreakType[] = ['attendance', 'posting', 'hosting']

  return (
    <section aria-labelledby="consistency-heading" className="scroll-mt-20">
      <SectionHeader title="Consistency" />
      <p className="-mt-2 mb-4 text-sm text-muted" id="consistency-heading">
        Showing up is how the steady person wins. Your daily practice streak is the
        heartbeat. One slip won’t break it, and a planned rest doesn’t count against you.
      </p>

      {/* Hero: daily practice streak (bounded forgiveness) */}
      <StreakHero
        streak={practice}
        progress={{ pct: prog.pct, next: prog.next ? { day: prog.next.day, label: prog.next.label } : null, toNext: prog.toNext }}
        restEndsLabel={restEndsLabel}
      />

      {/* How forgiveness works, the safety net made legible */}
      <div className="mt-6 rounded-2xl bg-signal-bg/40 p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-signal-strong" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-signal-strong">Your reserve</p>
            <p className="mt-1 text-sm leading-relaxed text-signal-strong">
              Miss one day and a reserve day bridges it the next time you log, so one
              slip never zeroes your streak. The rule is simple: never miss twice. Two
              days in a row and the streak starts fresh, with your best still on record.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-signal-strong">
              You bank a reserve day (up to two) at the Week, Month, Century and Year
              badges, and one for every five Full Day bonuses on a Journey. Planning real
              time off? Set a rest above and the break won’t count against you.
            </p>
          </div>
        </div>
      </div>

      {/* Weekly rhythms */}
      <div className="mt-8">
        <SectionHeader title="Weekly rhythms" />
      </div>
      <div className="space-y-4">
        {weeklyTypes.map((type) => {
          const streak = streakMap.get(type)
          const config = STREAK_CONFIG[type]
          const Icon = STREAK_ICONS[type]
          const current = streak?.current_count ?? 0
          const longest = streak?.longest_count ?? 0
          const active = streak ? isStreakActive(streak.last_activity_at, config.window_days) : false
          const milestones = [3, 4, 8, 13]

          return (
            <div key={type} className="rounded-2xl bg-surface-elevated/60">
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getRhythmBg(current)}`}>
                    <Icon className={`h-6 w-6 ${getRhythmColor(current)}`} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text">{config.label} streak</h3>
                      {active && current > 0 && (
                        <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-xs font-semibold text-success">Active</span>
                      )}
                      {!active && current > 0 && (
                        <span className="rounded-md bg-surface px-1.5 py-0.5 text-xs font-semibold text-muted">Resting</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{config.description}</p>
                    <div className="mt-3 flex items-center gap-4">
                      <div>
                        <span className="text-2xl font-bold text-text tabular-nums">{current}</span>
                        <span className="ml-1 text-xs text-subtle">{current === 1 ? 'week' : 'weeks'}</span>
                      </div>
                      <div className="h-6 w-px bg-border-strong" />
                      <div>
                        <span className="text-sm font-semibold text-muted tabular-nums">{longest}</span>
                        <span className="ml-1 text-xs text-subtle">best</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-1">
                    {milestones.map((m) => {
                      const reached = current >= m
                      return (
                        <div key={m} className="flex flex-1 flex-col items-center gap-1">
                          <div className={`h-1.5 w-full rounded-full ${reached ? 'bg-primary' : 'bg-surface-elevated'}`} />
                          <span className={`text-xs font-semibold ${reached ? 'text-primary-strong' : 'text-subtle'}`}>{m}w</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {streak?.last_activity_at && (
                  <p className="mt-3 text-xs text-subtle">
                    Last recorded: {new Date(streak.last_activity_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
