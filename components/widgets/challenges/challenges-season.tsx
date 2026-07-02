import { CheckCircle2, Circle, Zap, Target, Trophy, Flame } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { ChallengeDifficulty } from '@/lib/gamification'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { ExpressionAction } from '@/app/(main)/crew/challenges/expression-action'

type ChallengeRow = {
  id: string
  name: string
  description: string | null
  difficulty: string
  zaps_reward: number | null
  target: number
  journey_id: string | null
  criteria: unknown
  current: number
  completedAt: string | null
}

// Season Challenges layout module (ADR-270/294): the whole interior of /crew/challenges — the
// season KPI band (progress, zaps, in-progress, remaining) over the challenges-by-difficulty grid.
// Both views derive from ONE viewer-scoped fetch, so they live in one module rather than
// double-fetching across two. A self-fetching RSC keyed only on the viewer; it reads the challenge
// rows directly (not the redirecting getChallengesData action) so it degrades to null for a
// logged-out viewer instead of redirecting (the module contract). The page keeps its own auth guard.
export async function ChallengesSeason() {
  const profileId = await getMyProfileId()
  if (!profileId) return null

  const admin = createAdminClient()
  const season = 1
  const [{ data: challengeRows }, { data: progress }] = await Promise.all([
    admin.from('season_challenges').select('*').eq('season', season).eq('is_active', true).order('sort_order'),
    admin.from('challenge_progress').select('challenge_id, current, completed_at').eq('profile_id', profileId),
  ])

  const progressMap = new Map((progress ?? []).map((p) => [p.challenge_id, p]))
  const challenges = ((challengeRows ?? []) as Record<string, unknown>[]).map((c) => {
    const p = progressMap.get(c.id as string)
    return {
      ...(c as object),
      current: p?.current ?? 0,
      completedAt: p?.completed_at ?? null,
    }
  }) as ChallengeRow[]

  const stats = {
    total: challenges.length,
    completed: (progress ?? []).filter((p) => p.completed_at).length,
  }

  // ── Derived season metrics (drive the KPI band) ──────────────────────────────
  const completedPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const earnedZaps = challenges.filter((c) => c.completedAt).reduce((s, c) => s + (c.zaps_reward ?? 0), 0)
  const poolZaps = challenges.reduce((s, c) => s + (c.zaps_reward ?? 0), 0)
  const inProgress = challenges.filter((c) => !c.completedAt && (c.current ?? 0) > 0).length
  const remaining = stats.total - stats.completed
  const allDone = stats.total > 0 && stats.completed === stats.total

  // Group by difficulty (rendered hardest-last for a natural ramp).
  const byDifficulty = new Map<ChallengeDifficulty, ChallengeRow[]>()
  const order: ChallengeDifficulty[] = ['easy', 'normal', 'hard', 'legendary']
  for (const c of challenges) {
    const list = byDifficulty.get(c.difficulty as ChallengeDifficulty) ?? []
    list.push(c)
    byDifficulty.set(c.difficulty as ChallengeDifficulty, list)
  }

  return (
    <div className="space-y-6">
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
            label="Bonus Zaps earned"
            value={earnedZaps}
            icon={Zap}
            delta={{ label: `${poolZaps} up for grabs`, trend: 'flat' }}
          />
          <StatCard label="In progress" value={inProgress} icon={Flame} />
          <StatCard
            label="Challenges left"
            value={allDone ? 'Done!' : `${remaining} left`}
            icon={Trophy}
            delta={allDone ? { label: 'All complete', trend: 'up' } : undefined}
          />
        </div>

        {allDone && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-signal-strong">
            <Trophy className="h-4 w-4" /> All challenges complete. Great work this season!
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
                const progressPct = Math.min(100, Math.round((challenge.current / challenge.target) * 100))
                // Expression Challenges are a deliberate act, not a counter: they get
                // the share control instead of a progress bar (lib/quest/expression.ts).
                const isExpression =
                  (challenge.criteria as { type?: string } | null)?.type === 'expression' &&
                  !!challenge.journey_id

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
                        ) : isExpression ? (
                          <ExpressionAction journeyId={challenge.journey_id as string} />
                        ) : (
                          <div className="mt-2.5">
                            <div className="mb-1 flex items-center justify-between text-xs tabular-nums text-subtle">
                              <span>{challenge.current} / {challenge.target}</span>
                              <span>{progressPct}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                              <div className={`h-full rounded-full transition-all ${diff.bar}`} style={{ width: `${progressPct}%` }} />
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
    </div>
  )
}
