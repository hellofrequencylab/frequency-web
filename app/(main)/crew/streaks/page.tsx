import { notFound } from 'next/navigation'
import { Flame, CalendarCheck, PenTool, Mic, LogIn, Snowflake } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getStreaksData } from '../gamification-actions'
import { STREAK_CONFIG, isStreakActive } from '@/lib/gamification'
import type { StreakType } from '@/lib/gamification'
import { IndexTemplate } from '@/components/templates'

const STREAK_ICONS: Record<StreakType, React.ElementType> = {
  attendance: CalendarCheck,
  posting: PenTool,
  hosting: Mic,
  login: LogIn,
}

function getFlameColor(count: number): string {
  if (count >= 13) return 'text-signal'
  if (count >= 8) return 'text-primary'
  if (count >= 4) return 'text-primary'
  if (count >= 1) return 'text-primary'
  return 'text-subtle'
}

function getFlameBg(count: number): string {
  if (count >= 13) return 'bg-signal-bg/40'
  if (count >= 8) return 'bg-warning-bg'
  if (count >= 4) return 'bg-warning-bg/40'
  if (count >= 1) return 'bg-warning-bg'
  return 'bg-surface-elevated'
}

export default async function StreaksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const streaks = await getStreaksData()

  // Build map with all streak types (show inactive ones too)
  const streakMap = new Map(streaks.map(s => [s.streak_type, s]))
  const allTypes: StreakType[] = ['attendance', 'posting', 'hosting']

  return (
    <IndexTemplate
      title="Streaks"
      description="Build momentum by showing up consistently. Maintain streaks to earn bonus achievements and freeze tokens."
    >
      {/* Streak cards */}
      <div className="space-y-4">
        {allTypes.map(type => {
          const streak = streakMap.get(type)
          const config = STREAK_CONFIG[type]
          const Icon = STREAK_ICONS[type]
          const current = streak?.current_count ?? 0
          const longest = streak?.longest_count ?? 0
          const active = streak ? isStreakActive(streak.last_activity_at, config.window_days) : false
          const freezes = streak?.freeze_tokens ?? 0
          const milestones = [3, 4, 8, 13]

          return (
            <div
              key={type}
              className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Flame indicator */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${getFlameBg(current)}`}>
                    <Flame className={`w-7 h-7 ${getFlameColor(current)}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-subtle" />
                      <h3 className="text-sm font-semibold text-text">
                        {config.label} Streak
                      </h3>
                      {active && current > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-success-bg text-success font-semibold">
                          Active
                        </span>
                      )}
                      {!active && current > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-danger-bg dark:bg-danger-bg text-danger font-semibold">
                          Expired
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {config.description}
                    </p>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mt-3">
                      <div>
                        <span className="text-2xl font-bold text-text">{current}</span>
                        <span className="text-xs text-subtle ml-1">weeks</span>
                      </div>
                      <div className="w-px h-6 bg-border-strong" />
                      <div>
                        <span className="text-sm font-semibold text-muted">{longest}</span>
                        <span className="text-xs text-subtle ml-1">best</span>
                      </div>
                      {freezes > 0 && (
                        <>
                          <div className="w-px h-6 bg-border-strong" />
                          <div className="flex items-center gap-1">
                            <Snowflake className="w-3.5 h-3.5 text-signal-strong" />
                            <span className="text-sm font-semibold text-signal">{freezes}</span>
                            <span className="text-xs text-subtle">freezes</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Milestone track */}
                <div className="mt-5">
                  <div className="flex items-center justify-between gap-1">
                    {milestones.map(m => {
                      const reached = current >= m
                      return (
                        <div key={m} className="flex flex-col items-center gap-1 flex-1">
                          <div className={`w-full h-1.5 rounded-full ${
                            reached
                              ? 'bg-gradient-to-r from-amber-400 to-primary'
                              : 'bg-surface-elevated'
                          }`} />
                          <span className={`text-xs font-semibold ${
                            reached ? 'text-warning' : 'text-subtle'
                          }`}>
                            {m}w
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Last activity */}
                {streak?.last_activity_at && (
                  <p className="text-xs text-subtle mt-3">
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

      {/* Streak freeze explanation */}
      <div className="mt-8 rounded-2xl border border-signal-bg bg-signal-bg/50 p-4">
        <div className="flex items-start gap-3">
          <Snowflake className="w-5 h-5 text-signal-strong shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-signal-strong">Streak Freezes</p>
            <p className="text-xs text-signal-strong mt-1 leading-relaxed">
              Earn freeze tokens at streak milestones (4, 8, 13, 26, 52 weeks).
              When a streak would break, a freeze token is automatically used to protect it.
              Build long streaks to bank more freezes.
            </p>
          </div>
        </div>
      </div>
    </IndexTemplate>
  )
}
