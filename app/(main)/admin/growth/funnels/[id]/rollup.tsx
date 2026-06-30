// The funnel conversion rollup (GE2-2 view), an async Server Component that awaits the
// passed promise so the parent never blocks the shell (PAGE-FRAMEWORK §5). Renders the
// stage-by-stage bars: distinct actors per stage as a share of the first, with the
// drop-off from the previous stage. Returns a calm empty state when there is no signal
// yet (a fresh funnel has nothing in the ledger).

import { EmptyState } from '@/components/ui/empty-state'
import type { FunnelRollupStage } from '@/lib/funnels/store'

export async function FunnelRollup({ promise }: { promise: Promise<FunnelRollupStage[]> }) {
  const stages = await promise
  const top = stages[0]?.actors ?? 0

  if (stages.length === 0 || top === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No funnel signal yet."
        description="Once people travel this funnel, each stage's reach and its drop-off show here. Wire the stages below and share an entry point to start the flow."
      />
    )
  }

  return (
    <div className="space-y-3">
      {stages.map((s) => {
        const width = top > 0 ? Math.round((s.actors / top) * 100) : 0
        return (
          <div key={s.stageId}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-text">
                <span className="text-2xs uppercase tracking-wide text-subtle">{s.kind}</span>{' '}
                {s.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted">
                {s.actors.toLocaleString()}
                {s.dropPct !== null && s.dropPct > 0 && (
                  <span className="ml-1.5 text-2xs text-danger">-{s.dropPct}%</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
