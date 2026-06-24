import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { LifecycleFunnel } from '@/lib/dashboard/scores'

// The lifecycle funnel (Resonance Engine Phase 2 · ADR-383). The ladder a member climbs,
// mapped onto the real lifecycle_stage enum (new / activated / engaged / at_risk / dormant),
// with the count + the step-to-step conversion + a drill into the people stuck at each stage.
// Answers "where do members stall." Every step drills to a member list (?stage=<stage>), and
// from there each member to the contact_interactions timeline. Semantic tokens only; copy in
// voice (no em or en dashes).

interface Step {
  key: keyof LifecycleFunnel
  label: string
  /** The lifecycle_stage value to drill on. */
  stage: string
}

// The forward ladder. We surface the activation path (new -> engaged) as the primary funnel and
// hold at_risk / dormant as the leak the operator chases. Order matters: it is the climb.
const LADDER: Step[] = [
  { key: 'new', label: 'New', stage: 'new' },
  { key: 'activated', label: 'Activated', stage: 'activated' },
  { key: 'engaged', label: 'Engaged', stage: 'engaged' },
]

const LEAK: Step[] = [
  { key: 'atRisk', label: 'At risk', stage: 'at_risk' },
  { key: 'dormant', label: 'Dormant', stage: 'dormant' },
]

/** Step conversion as a whole-percent string, fail-safe to a dash when the prior step is empty. */
function conversion(curr: number, prev: number): string {
  if (prev <= 0) return '–'
  const pct = Math.round((curr / prev) * 100)
  return `${pct}%`
}

export function LifecycleFunnelPanel({
  funnel,
  drillBase,
}: {
  funnel: LifecycleFunnel
  /** Where a step drills. The member list reads ?stage=<stage>. */
  drillBase: string
}) {
  const max = Math.max(1, funnel.new, funnel.activated, funnel.engaged)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-sm text-muted">
        Where members stall on the climb from new to engaged. Tap a stage to see who is stuck there.
      </p>

      {/* The forward climb: a horizontal bar per stage + the step conversion between them. */}
      <div className="mt-4 space-y-2">
        {LADDER.map((step, i) => {
          const count = funnel[step.key]
          const prev = i === 0 ? null : funnel[LADDER[i - 1].key]
          const width = Math.round((count / max) * 100)
          return (
            <div key={step.key}>
              {prev != null && (
                <p className="py-0.5 pl-1 text-2xs text-subtle">{conversion(count, prev)} carry through</p>
              )}
              <Link
                href={`${drillBase}?stage=${step.stage}`}
                className="group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-surface-elevated/60"
              >
                <span className="w-20 shrink-0 text-sm font-medium text-text">{step.label}</span>
                <span className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-elevated">
                  <span
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/30"
                    style={{ width: `${Math.max(width, count > 0 ? 6 : 0)}%` }}
                    aria-hidden
                  />
                </span>
                <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-text">{count}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" />
              </Link>
            </div>
          )
        })}
      </div>

      {/* The leak: who has slipped off the climb (the win-back pool). */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
        {LEAK.map((step) => (
          <Link
            key={step.key}
            href={`${drillBase}?stage=${step.stage}`}
            className="group flex items-center justify-between rounded-xl bg-surface-elevated/60 px-3 py-2 transition-colors hover:bg-surface-elevated"
          >
            <span className="text-sm font-medium text-muted">{step.label}</span>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold tabular-nums text-text">
              {funnel[step.key]}
              <ArrowRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
