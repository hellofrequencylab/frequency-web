import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Flame, CalendarCheck, PenTool, Mic, LogIn, Snowflake } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getStreaksData } from '../gamification-actions'
import { STREAK_CONFIG, isStreakActive, getStreakFreezeEarnedAt } from '@/lib/gamification'
import type { StreakType } from '@/lib/gamification'

const STREAK_ICONS: Record<StreakType, React.ElementType> = {
  attendance: CalendarCheck,
  posting: PenTool,
  hosting: Mic,
  login: LogIn,
}

function getFlameColor(count: number): string {
  if (count >= 13) return 'text-violet-500'
  if (count >= 8) return 'text-orange-500'
  if (count >= 4) return 'text-amber-500'
  if (count >= 1) return 'text-yellow-500'
  return 'text-gray-300 dark:text-gray-600'
}

function getFlameBg(count: number): string {
  if (count >= 13) return 'bg-violet-50 dark:bg-violet-950/40'
  if (count >= 8) return 'bg-orange-50 dark:bg-orange-950/40'
  if (count >= 4) return 'bg-amber-50 dark:bg-amber-950/40'
  if (count >= 1) return 'bg-yellow-50 dark:bg-yellow-950/40'
  return 'bg-gray-50 dark:bg-gray-800'
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
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/crew"
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Crew
          </Link>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Streaks</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Build momentum by showing up consistently. Maintain streaks to earn bonus achievements and freeze tokens.
        </p>
      </div>

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
          const freezeEarned = getStreakFreezeEarnedAt(longest)

          return (
            <div
              key={type}
              className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Flame indicator */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${getFlameBg(current)}`}>
                    <Flame className={`w-7 h-7 ${getFlameColor(current)}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {config.label} Streak
                      </h3>
                      {active && current > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-600 dark:text-green-400 font-semibold">
                          Active
                        </span>
                      )}
                      {!active && current > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 font-semibold">
                          Expired
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {config.description}
                    </p>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mt-3">
                      <div>
                        <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">{current}</span>
                        <span className="text-xs text-gray-400 ml-1">weeks</span>
                      </div>
                      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                      <div>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{longest}</span>
                        <span className="text-xs text-gray-400 ml-1">best</span>
                      </div>
                      {freezes > 0 && (
                        <>
                          <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
                          <div className="flex items-center gap-1">
                            <Snowflake className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-sm font-semibold text-blue-500">{freezes}</span>
                            <span className="text-xs text-gray-400">freezes</span>
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
                              ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                              : 'bg-gray-100 dark:bg-gray-800'
                          }`} />
                          <span className={`text-[10px] font-semibold ${
                            reached ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
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
                  <p className="text-[11px] text-gray-400 mt-3">
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
      <div className="mt-8 rounded-2xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Snowflake className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Streak Freezes</p>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1 leading-relaxed">
              Earn freeze tokens at streak milestones (4, 8, 13, 26, 52 weeks).
              When a streak would break, a freeze token is automatically used to protect it.
              Build long streaks to bank more freezes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
