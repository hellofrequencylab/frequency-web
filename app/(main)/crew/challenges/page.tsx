import { notFound } from 'next/navigation'
import { CheckCircle2, Circle, Zap, Target, Trophy, Flame } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getChallengesData } from '../gamification-actions'
import { DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { ChallengeDifficulty } from '@/lib/gamification'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'

export default async function ChallengesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { challenges, stats } = await getChallengesData(1)

  // ── Derived season metrics (drive the KPI band) ──────────────────────────────
  const completedPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const earnedZaps = challenges.filter((c) => c.completedAt).reduce((s, c) => s + (c.zaps_reward ?? 0), 0)
  const poolZaps = challenges.reduce((s, c) => s + (c.zaps_reward ?? 0), 0)
  const inProgress = challenges.filter((c) => !c.completedAt && (c.current ?? 0) > 0).length
  const remaining = stats.total - stats.completed
  const allDone = stats.total > 0 && stats.completed === stats.total

  // Group by difficulty (rendered hardest-last for a natural ramp).
  const byDifficulty = new Map<ChallengeDifficulty, typeof challenges>()
  const order: ChallengeDifficulty[] = ['easy', 'normal', 'hard', 'legendary']
  for (const c of challenges) {
    const list = byDifficulty.get(c.difficulty as ChallengeDifficulty) ?? []
    list.push(c)
    byDifficulty.set(c.difficulty as ChallengeDifficulty, list)
  }

  return (
    <DashboardTemplate
      eyebrow="The Quest · Season 1"
      title="Season Challenges"
      description="Complete challenges this season to earn bonus zaps and unlock Luminary rank. Each season runs 13 weeks."
    >
      {/* ── KPI band — deliberately a shade darker than the canvas so the season
            stats read as one focused dashboard header. ─────────────────────────── */}
      <section className="rounded-3xl border border-border/70 bg-marketing-canvas p-5 shadow-sm sm:p-6">
        {/* Season progress headline */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">Season 1 progress</p>
              <p className="text-xs text-muted">{stats.completed} of {stats.total} challenges complete</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold leading-none tabular-nums text-text">{completedPct}%</p>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${completedPct}%` }}
          />
        </div>

        {/* KPI tiles */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Challenges done"
            value={`${stats.completed}/${stats.total}`}
            icon={CheckCircle2}
            delta={{ label: `${completedPct}% of season`, trend: completedPct > 0 ? 'up' : 'flat' }}
          />
          <StatCard
            label="Bonus zaps earned"
            value={earnedZaps}
            icon={Zap}
            delta={{ label: `${poolZaps} up for grabs`, trend: 'flat' }}
          />
          <StatCard label="In progress" value={inProgress} icon={Flame} />
          <StatCard
            label="To Luminary"
            value={allDone ? 'Unlocked' : `${remaining} left`}
            icon={Trophy}
            delta={allDone ? { label: 'Rank unlocked', trend: 'up' } : undefined}
          />
        </div>

        {allDone && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-signal-strong">
            <Trophy className="h-4 w-4" /> All challenges complete — Luminary rank unlocked!
          </p>
        )}
      </section>

      {/* ── Challenges by difficulty ───────────────────────────────────────────── */}
      {order.map((difficulty) => {
        const items = byDifficulty.get(difficulty)
        if (!items?.length) return null
        const diff = DIFFICULTY_CONFIG[difficulty]
        const done = items.filter((c) => c.completedAt).length

        return (
          <section key={difficulty}>
            <SectionHeader
              title={diff.label}
              action={
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${diff.bg} ${diff.color}`}>
                  {done}/{items.length}
                </span>
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((challenge) => {
                const isComplete = !!challenge.completedAt
                const progress = Math.min(100, Math.round((challenge.current / challenge.target) * 100))

                return (
                  <div
                    key={challenge.id}
                    className={`rounded-2xl border p-4 transition-colors ${
                      isComplete
                        ? 'border-success/30 bg-success-bg/30'
                        : 'border-border bg-surface hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isComplete ? 'bg-success-bg text-success' : 'bg-surface-elevated text-subtle'
                        }`}
                      >
                        {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`text-sm font-semibold ${isComplete ? 'text-success' : 'text-text'}`}>
                            {challenge.name}
                          </h3>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ${
                              isComplete ? 'bg-success-bg text-success' : 'bg-primary-bg text-primary-strong'
                            }`}
                          >
                            <Zap className="h-3 w-3" /> {challenge.zaps_reward}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-snug text-muted">{challenge.description}</p>

                        {isComplete ? (
                          challenge.completedAt && (
                            <p className="mt-2 text-xs font-medium text-success">
                              Completed {new Date(challenge.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )
                        ) : (
                          <div className="mt-2.5">
                            <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-subtle">
                              <span>{challenge.current} / {challenge.target}</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                              <div className={`h-full rounded-full transition-all ${diff.bar}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </DashboardTemplate>
  )
}
