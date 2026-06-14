// Journeys v2 — the shared Circle cohort meter (ADR-252, J2b, JOURNEYS.md §3). The cooperative
// half of the experience: one shared meter for the whole Circle + group-completion celebration.
// No per-member ranking (research §10) — only "we're in this together."

import { Users, Trophy } from 'lucide-react'
import type { CohortProgress } from '@/lib/journeys/cohort'

export function CohortMeter({ progress, circleName }: { progress: CohortProgress; circleName?: string | null }) {
  if (progress.memberCount === 0) return null
  const completedPhases = progress.phases.filter((p) => p.allComplete).length

  return (
    <div className="rounded-xl border border-primary/30 bg-primary-bg/40 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-primary-strong">
          <Users className="h-4 w-4" />
          Your Circle{circleName ? ` · ${circleName}` : ''}
        </span>
        <span className="tabular-nums text-muted">
          {progress.memberCount} member{progress.memberCount === 1 ? '' : 's'} · {progress.meanPercent}% together
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.max(2, progress.meanPercent)}%` }} />
      </div>

      {progress.allComplete ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <Trophy className="h-4 w-4" /> Your Circle finished this together! 🎉
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          {completedPhases > 0
            ? `${completedPhases} of ${progress.phases.length} phases done as a group · ${progress.journeyCompleted} finished the whole journey`
            : 'Keep going — the Circle moves together.'}
        </p>
      )}
    </div>
  )
}
