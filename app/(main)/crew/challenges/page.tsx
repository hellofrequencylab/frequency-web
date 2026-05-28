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
            className="text-sm text-subtle hover:text-muted dark:hover:text-subtle transition-colors"
          >
            Crew
          </Link>
          <span className="text-subtle">/</span>
          <h1 className="text-xl font-semibold text-text">Season Challenges</h1>
        </div>
        <p className="text-sm text-muted mt-1">
          Complete challenges this season to earn bonus zaps and unlock Luminary rank.
          Each season runs 13 weeks.
        </p>
      </div>

      {/* Progress overview */}
      <div className="rounded-2xl border border-border bg-surface shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-bg flex items-center justify-center">
              <Target className="w-5 h-5 text-primary-strong" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text">
                Season 1 Progress
              </p>
              <p className="text-xs text-muted">
                {stats.completed} of {stats.total} challenges completed
              </p>
            </div>
          </div>
          <span className="text-2xl font-bold text-text">{completedPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-surface-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r bg-primary transition-all"
            style={{ width: `${completedPct}%` }}
          />
        </div>
        {stats.completed === stats.total && stats.total > 0 && (
          <p className="text-sm font-semibold text-signal-strong mt-3 text-center">
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
                <h2 className="text-sm font-semibold text-text">
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
                          ? 'border-green-100 bg-success-bg/50 dark:bg-success-bg/30'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isComplete ? 'bg-success-bg' : 'bg-surface-elevated'
                        }`}>
                          {isComplete ? (
                            <CheckCircle className="w-4 h-4 text-success" />
                          ) : (
                            <Circle className="w-4 h-4 text-subtle" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${
                              isComplete ? 'text-success' : 'text-text'
                            }`}>
                              {challenge.name}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5">
                            {challenge.description}
                          </p>

                          {/* Progress bar */}
                          {!isComplete && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-subtle">
                                  {challenge.current} / {challenge.target}
                                </span>
                                <span className="text-[11px] text-subtle">{progress}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${diff.bar}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {isComplete && challenge.completedAt && (
                            <p className="text-[11px] text-success mt-1">
                              Completed {new Date(challenge.completedAt).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric',
                              })}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Zap className={`w-3.5 h-3.5 ${isComplete ? 'text-success' : 'text-primary'}`} />
                          <span className={`text-sm font-semibold ${
                            isComplete ? 'text-success' : 'text-muted'
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
