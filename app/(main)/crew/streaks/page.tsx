import { notFound } from 'next/navigation'
import { CalendarCheck, PenTool, Mic, Flame, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getStreaksData } from '../gamification-actions'
import { getPracticeStreak } from '@/lib/practice-streak'
import { STREAK_CONFIG, isStreakActive } from '@/lib/gamification'
import type { StreakType } from '@/lib/gamification'
import { streakProgress } from '@/lib/streak'
import { rankForCompletion, journeysFinishedThisSeason } from '@/lib/season-ranks'
import { getCurrentSeason } from '@/lib/seasons'
import { IndexTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { StandingHero } from '@/components/gamification/standing-hero'
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

export default async function StreaksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const profileId = await getMyProfileId()
  if (!profileId) notFound()

  const admin = createAdminClient()
  const [streaks, practice, { data: prof }, season, finishedCount] = await Promise.all([
    getStreaksData(),
    getPracticeStreak(profileId),
    admin
      .from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId)
      .maybeSingle(),
    getCurrentSeason(),
    journeysFinishedThisSeason(profileId),
  ])

  // The viewer's standing — the four counts, with the flame (streak) the subject
  // of this page (§2, one standing render).
  const standZaps = (prof as { current_season_zaps: number | null } | null)?.current_season_zaps ?? 0
  const standGems = (prof as { lifetime_gems: number | null } | null)?.lifetime_gems ?? 0
  const standStreak = (prof as { current_streak: number | null } | null)?.current_streak ?? 0
  const standRank = rankForCompletion(finishedCount)

  // Daily practice streak — the headline. Progress is the milestone ladder.
  const prog = streakProgress(practice.current)

  // When the member is resting, name the day the rest ends (server-formatted so
  // the client component stays presentational).
  const restEndsLabel = practice.rest
    ? new Date(`${practice.rest.through}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', timeZone: 'UTC',
      })
    : null

  // Weekly streaks (the show-up rhythms) sit below.
  const streakMap = new Map(streaks.map(s => [s.streak_type, s]))
  const weeklyTypes: StreakType[] = ['attendance', 'posting', 'hosting']

  return (
    <IndexTemplate
      title="Streaks"
      description="Build momentum by showing up. Your daily practice streak is the heartbeat. One slip won’t break it, and a planned rest doesn’t count against you."
    >
      {/* ── Standing hero — the four counts, the flame featured ──────── */}
      <div className="mb-6">
        <StandingHero
          zaps={standZaps}
          gems={standGems}
          streak={standStreak}
          rank={standRank}
          journeysFinished={finishedCount}
          seasonName={season?.name}
          links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
        />
      </div>

      {/* ── Hero: daily practice streak (bounded forgiveness) ────────── */}
      <StreakHero
        streak={practice}
        progress={{ pct: prog.pct, next: prog.next ? { day: prog.next.day, label: prog.next.label } : null, toNext: prog.toNext }}
        restEndsLabel={restEndsLabel}
      />

      {/* ── How forgiveness works — the safety net, made legible ─────── */}
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

      {/* ── Weekly rhythms ──────────────────────────────────────────── */}
      <div className="mt-8">
        <SectionHeader title="Weekly rhythms" />
      </div>
      <div className="space-y-4">
        {weeklyTypes.map(type => {
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
                    {milestones.map(m => {
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
    </IndexTemplate>
  )
}
