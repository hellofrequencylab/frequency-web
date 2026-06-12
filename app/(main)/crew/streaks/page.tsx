import { notFound } from 'next/navigation'
import { Flame, CalendarCheck, PenTool, Mic, Snowflake, Check, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getStreaksData } from '../gamification-actions'
import { getPracticeStreak } from '@/lib/practice-streak'
import { STREAK_CONFIG, isStreakActive } from '@/lib/gamification'
import type { StreakType } from '@/lib/gamification'
import { STREAK_MILESTONES, streakProgress } from '@/lib/streak'
import { rankForZaps } from '@/lib/season-ranks'
import { getCurrentSeason } from '@/lib/seasons'
import { IndexTemplate } from '@/components/templates'
import { StandingHero } from '@/components/gamification/standing-hero'

const STREAK_ICONS: Record<StreakType, React.ElementType> = {
  attendance: CalendarCheck,
  posting: PenTool,
  hosting: Mic,
  login: Flame,
}

function getFlameColor(count: number): string {
  if (count >= 13) return 'text-signal'
  return count >= 1 ? 'text-primary' : 'text-subtle'
}

function getFlameBg(count: number): string {
  if (count >= 13) return 'bg-signal-bg/40'
  return count >= 1 ? 'bg-warning-bg' : 'bg-surface-elevated'
}

export default async function StreaksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const profileId = await getMyProfileId()
  if (!profileId) notFound()

  const admin = createAdminClient()
  const [streaks, practice, { data: prof }, season] = await Promise.all([
    getStreaksData(),
    getPracticeStreak(profileId),
    admin
      .from('profiles')
      .select('current_season_zaps, lifetime_gems, current_streak')
      .eq('id', profileId)
      .maybeSingle(),
    getCurrentSeason(),
  ])

  // The viewer's standing — the four counts, with the flame (streak) the subject
  // of this page (§2, one standing render).
  const standZaps = (prof as { current_season_zaps: number | null } | null)?.current_season_zaps ?? 0
  const standGems = (prof as { lifetime_gems: number | null } | null)?.lifetime_gems ?? 0
  const standStreak = (prof as { current_streak: number | null } | null)?.current_streak ?? 0
  const standRank = rankForZaps(standZaps)

  // Daily practice streak — the headline.
  const prog = streakProgress(practice.current)

  // Weekly streaks (the show-up rhythms) sit below.
  const streakMap = new Map(streaks.map(s => [s.streak_type, s]))
  const weeklyTypes: StreakType[] = ['attendance', 'posting', 'hosting']

  return (
    <IndexTemplate
      title="Streaks"
      description="Build momentum by showing up. Your daily practice streak is the heartbeat; the weekly rhythms below track the rest of how you show up."
    >
      {/* ── Standing hero — the four counts, the flame featured ──────── */}
      <div className="mb-6">
        <StandingHero
          zaps={standZaps}
          gems={standGems}
          streak={standStreak}
          rank={standRank}
          seasonName={season?.name}
          links={{ zaps: '/crew/leaderboard', rank: '/crew/achievements', streak: '/crew/streaks', gems: '/crew/store' }}
        />
      </div>

      {/* ── Hero: daily practice streak ─────────────────────────────── */}
      <div className="rounded-2xl border border-primary-bg bg-primary-bg/30 p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${getFlameBg(practice.current)}`}>
            <Flame className={`h-8 w-8 ${getFlameColor(practice.current)}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-text">Daily practice streak</h2>
              {practice.status === 'logged_today' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-1.5 py-0.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Logged today
                </span>
              )}
              {practice.status === 'at_risk' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-warning-bg px-1.5 py-0.5 text-xs font-semibold text-warning">
                  <AlertTriangle className="h-3 w-3" /> Log today to keep it
                </span>
              )}
              {practice.status === 'broken' && (
                <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-semibold text-danger">
                  Streak reset
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Consecutive days you’ve logged a practice. A practice a day keeps it lit.
            </p>

            {/* Stats row */}
            <div className="mt-3 flex items-center gap-4">
              <div>
                <span className="text-3xl font-bold text-text tabular-nums">{practice.current}</span>
                <span className="ml-1 text-xs text-subtle">{practice.current === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="h-6 w-px bg-border-strong" />
              <div>
                <span className="text-sm font-semibold text-muted tabular-nums">{practice.longest}</span>
                <span className="ml-1 text-xs text-subtle">best</span>
              </div>
              <div className="h-6 w-px bg-border-strong" />
              <div className="flex items-center gap-1" title="Streak freezes: each bridges one missed day automatically">
                <Snowflake className="h-3.5 w-3.5 text-signal-strong" />
                <span className="text-sm font-semibold text-signal tabular-nums">{practice.freezeTokens}</span>
                <span className="text-xs text-subtle">{practice.freezeTokens === 1 ? 'freeze' : 'freezes'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Milestone progress bar + pips (day-based). */}
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${prog.pct}%` }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-1">
            {STREAK_MILESTONES.map(m => {
              const hit = m.day <= practice.current
              const isNext = prog.next?.day === m.day
              return (
                <div key={m.day} className="flex flex-col items-center gap-1" title={`${m.label} · ${m.day} days · +${m.zaps} zaps`}>
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-3xs font-bold ${
                    hit ? 'bg-primary text-on-primary' : isNext ? 'bg-surface text-primary-strong ring-2 ring-primary' : 'bg-surface text-subtle'
                  }`}>
                    {hit ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : m.day}
                  </span>
                  <span className="text-3xs text-subtle">{m.label}</span>
                </div>
              )
            })}
          </div>
          {prog.next && (
            <p className="mt-3 text-xs text-subtle">
              {prog.toNext} {prog.toNext === 1 ? 'day' : 'days'} to the {prog.next.label} badge
              {` · +${STREAK_MILESTONES.find(m => m.day === prog.next!.day)?.zaps ?? 0} zaps`}
            </p>
          )}
        </div>
      </div>

      {/* ── Weekly rhythms ──────────────────────────────────────────── */}
      <h2 className="mt-8 mb-3 text-sm font-semibold text-text">Weekly rhythms</h2>
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
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getFlameBg(current)}`}>
                    <Icon className={`h-6 w-6 ${getFlameColor(current)}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text">{config.label} streak</h3>
                      {active && current > 0 && (
                        <span className="rounded-md bg-success-bg px-1.5 py-0.5 text-xs font-semibold text-success">Active</span>
                      )}
                      {!active && current > 0 && (
                        <span className="rounded-md bg-danger-bg px-1.5 py-0.5 text-xs font-semibold text-danger">Expired</span>
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
                          <span className={`text-xs font-semibold ${reached ? 'text-warning' : 'text-subtle'}`}>{m}w</span>
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

      {/* ── Streak freeze explanation ───────────────────────────────── */}
      <div className="mt-8 rounded-2xl bg-signal-bg/40 p-4">
        <div className="flex items-start gap-3">
          <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-signal-strong" />
          <div>
            <p className="text-sm font-semibold text-signal-strong">Streak freezes</p>
            <p className="mt-1 text-xs leading-relaxed text-signal-strong">
              You bank a freeze token when you reach the Week, Month, Century and Year
              milestones (up to two at a time). If you miss a single day, a freeze is
              spent automatically the next time you log, so one slip never erases the
              momentum you’ve built. Miss two days in a row and the streak resets.
            </p>
          </div>
        </div>
      </div>
    </IndexTemplate>
  )
}
