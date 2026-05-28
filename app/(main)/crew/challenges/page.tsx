import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, Circle, Zap, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getChallengesData } from '../gamification-actions'
import { DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { ChallengeDifficulty } from '@/lib/gamification'

export default async function ChallengesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { challenges, stats } = await getChallengesData(1)

  const completedPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  // Group by difficulty
  const byDifficulty = new Map<ChallengeDifficulty, typeof challenges>()
  const order: ChallengeDifficulty[] = ['easy', 'normal', 'hard', 'legendary']
  for (const c of challenges) {
    const list = byDifficulty.get(c.difficulty as ChallengeDifficulty) ?? []
    list.push(c)
    byDifficulty.set(c.difficulty as ChallengeDifficulty, list)
  }

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
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Season Challenges</h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Complete challenges this season to earn bonus zaps and unlock Luminary rank.
          Each season runs 13 weeks.
        </p>
      </div>

      {/* Progress overview */}
      <div className="rounded-2xl border border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900 shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
              <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Season 1 Progress
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {stats.completed} of {stats.total} challenges completed
              </p>
            </div>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">{completedPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
            style={{ width: `${completedPct}%` }}
          />
        </div>
        {stats.completed === stats.total && stats.total > 0 && (
          <p className="text-sm font-semibold text-violet-600 dark:text-violet-400 mt-3 text-center">
            All challenges complete — Luminary rank unlocked!
          </p>
        )}
      </div>

      {/* Challenges by difficulty */}
      <div className="space-y-8">
        {order.map(difficulty => {
          const items = byDifficulty.get(difficulty)
          if (!items?.length) return null
          const diff = DIFFICULTY_CONFIG[difficulty]

          return (
            <section key={difficulty}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {diff.label}
                </h2>
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${diff.bg} ${diff.color}`}>
                  {items.filter(c => c.completedAt).length}/{items.length}
                </span>
              </div>

              <div className="space-y-2">
                {items.map(challenge => {
                  const isComplete = !!challenge.completedAt
                  const progress = Math.min(100, Math.round((challenge.current / challenge.target) * 100))

                  return (
                    <div
                      key={challenge.id}
                      className={`rounded-2xl border px-4 py-3 transition-all ${
                        isComplete
                          ? 'border-green-100 dark:border-green-900 bg-green-50/50 dark:bg-green-950/30'
                          : 'border-gray-200/60 dark:border-gray-800/60 bg-white dark:bg-gray-900'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isComplete ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-50 dark:bg-gray-800'
                        }`}>
                          {isComplete ? (
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${
                              isComplete ? 'text-green-800 dark:text-green-300' : 'text-gray-900 dark:text-gray-50'
                            }`}>
                              {challenge.name}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {challenge.description}
                          </p>

                          {/* Progress bar */}
                          {!isComplete && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-gray-400">
                                  {challenge.current} / {challenge.target}
                                </span>
                                <span className="text-[11px] text-gray-400">{progress}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${diff.bar}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {isComplete && challenge.completedAt && (
                            <p className="text-[11px] text-green-600 dark:text-green-400 mt-1">
                              Completed {new Date(challenge.completedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric',
                              })}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Zap className={`w-3.5 h-3.5 ${isComplete ? 'text-green-500' : 'text-amber-400'}`} />
                          <span className={`text-sm font-semibold ${
                            isComplete ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            +{challenge.zaps_reward}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
