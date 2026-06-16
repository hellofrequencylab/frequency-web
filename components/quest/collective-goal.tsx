import { Users, Zap } from 'lucide-react'

// CollectiveGoal — the cooperative headline of the Quest leaderboard. Research on
// global/absolute boards (JMIR 2021; Festinger 1954) is plain: ranking the non-top
// majority against everyone demotivates them. So the page LEADS with a shared goal
// the whole Circle fills together, not a ladder. One warm "we're doing this
// together" bar: the Circle's combined season Zaps climbing toward a shared
// milestone, plus how many people are pitching in. Cooperative, never competitive.
//
// In-person Zaps are a natural fit for a shared total: every logged practice, every
// scan, every show-up adds to the same bar. No one is behind. The bar belongs to
// the group.
//
// Presentational + server-friendly (no hooks): the page server-fetches the combined
// total, the contributor count, and the scope label, then passes them down. The fill
// transition respects prefers-reduced-motion.

// Shared milestones the Circle climbs toward together. Picked so an active Circle
// crosses one every couple of weeks: enough cadence to feel movement, never a
// finish line that ends the season. The next uncrossed rung is the live target.
const MILESTONES = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000] as const

/** The milestone the group is climbing toward, and how far it sits between the last
 *  crossed rung and the next. At/above the top rung, the target keeps doubling so the
 *  bar never caps out for a thriving group. */
export function nextMilestone(total: number): { target: number; floor: number; pct: number } {
  const idx = MILESTONES.findIndex((m) => total < m)
  if (idx === -1) {
    // Past the published ladder: double the top rung until it clears the total.
    let target = MILESTONES[MILESTONES.length - 1] * 2
    while (target <= total) target *= 2
    const floor = target / 2
    return { target, floor, pct: clampPct(total, floor, target) }
  }
  const target = MILESTONES[idx]
  const floor = idx === 0 ? 0 : MILESTONES[idx - 1]
  return { target, floor, pct: clampPct(total, floor, target) }
}

function clampPct(total: number, floor: number, target: number): number {
  if (target <= floor) return 100
  return Math.min(100, Math.max(0, Math.round(((total - floor) / (target - floor)) * 100)))
}

export function CollectiveGoal({
  scopeLabel,
  total,
  contributors,
  seasonName,
}: {
  /** Whose goal this is, in plain words ("your Circle", "the season"). */
  scopeLabel: string
  /** Combined season Zaps everyone in scope has earned so far. */
  total: number
  /** How many people have added to the total this season. */
  contributors: number
  /** Optional season name for the eyebrow. */
  seasonName?: string | null
}) {
  const { target, pct } = nextMilestone(total)
  const remaining = Math.max(0, target - total)

  return (
    <section
      className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary-bg/55 via-surface to-surface shadow-sm dark:from-primary-bg/20"
      aria-labelledby="collective-goal-heading"
    >
      <div className="px-6 pt-6 sm:px-7">
        <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
          {seasonName ? `The Quest · ${seasonName}` : 'The Quest'}
        </p>
        <h2 id="collective-goal-heading" className="mt-0.5 text-xl font-bold leading-tight text-text">
          Together with {scopeLabel}
        </h2>
        <p className="mt-1 text-sm text-muted">
          Every practice you log adds to the same total. This one belongs to the group.
        </p>
      </div>

      {/* The shared bar — the headline read. The Circle's combined Zaps filling toward
          the next milestone. One total, everyone contributes, no one is behind. */}
      <div className="px-6 py-5 sm:px-7">
        <div className="flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <Zap className="h-5 w-5 shrink-0 self-center text-primary" aria-hidden />
            <span className="text-3xl font-extrabold leading-none tabular-nums text-text">
              {total.toLocaleString()}
            </span>
            <span className="text-sm font-medium text-muted">
              of {target.toLocaleString()} Zaps
            </span>
          </p>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-text">{pct}%</p>
        </div>

        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-surface-elevated"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${scopeLabel} progress to the next milestone`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Users className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
            <span className="font-semibold tabular-nums text-text">{contributors.toLocaleString()}</span>
            {contributors === 1 ? 'person adding to it' : 'people adding to it'}
          </p>
          {remaining > 0 ? (
            <p className="text-sm text-muted">
              <span className="font-semibold tabular-nums text-text">{remaining.toLocaleString()}</span> Zaps to the next milestone
            </p>
          ) : (
            <p className="text-sm font-semibold text-primary-strong">Milestone reached. The next one is already open.</p>
          )}
        </div>
      </div>
    </section>
  )
}
