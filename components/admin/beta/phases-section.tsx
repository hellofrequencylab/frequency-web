import { Suspense } from 'react'
import { Flag, Target } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusChip } from '@/components/admin/status'
import { listPhases } from '@/lib/beta/phases'
import { listTasks } from '@/lib/beta/tasks'
import { listPhaseOutbound } from '@/lib/beta/approvals'
import { approverGate } from '@/lib/beta/guard'
import {
  PhaseStatusControl,
  TaskStatusControl,
  PhaseOutbound,
} from './phase-controls'

// PHASES — the owner's core workflow (Wave 2). Walk each phase P0..P4 in order:
// read its goal, work its task board (each task shows its "done when…" acceptance
// and an editable status), review its outbound queue, then ARM the phase when it is
// ready. It is the primary consumer of the approval spine's phase-scoped API.
//
// Server Component: it self-fetches phases + tasks + each phase's outbound and hands
// serializable data to the small client controls in phase-controls.tsx. Nothing
// arms unless the operator clicks; the copy makes that explicit. Arming is
// approver-gated (admin/janitor) — for a non-approver the arm/approve controls are
// withheld and the queue stays read-only. The whole board streams behind a
// <Suspense> boundary so it never blocks the tab shell (PAGE-FRAMEWORK §5).

export function BetaPhasesSection() {
  return (
    <Suspense fallback={<PhasesSkeleton />}>
      <PhasesBoard />
    </Suspense>
  )
}

function PhasesSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 w-full rounded-3xl" />
      ))}
    </div>
  )
}

async function PhasesBoard() {
  const [phases, allTasks, gate] = await Promise.all([
    listPhases(),
    listTasks(),
    approverGate(),
  ])
  const canArm = gate.ok

  if (phases.length === 0) {
    return (
      <AdminSection title="Phases">
        <EmptyState
          variant="first-use"
          title="No phases yet"
          description="The P0 to P4 plan seeds with the Beta schema. Once seeded, each phase and its tasks show up here to review and arm."
        />
      </AdminSection>
    )
  }

  // Fetch every phase's outbound in parallel, then index by phase for the render.
  const outboundByPhase = new Map(
    await Promise.all(
      phases.map(async (p) => [p.id, await listPhaseOutbound(p.id)] as const),
    ),
  )
  const tasksByPhase = new Map<string, typeof allTasks>()
  for (const task of allTasks) {
    const bucket = tasksByPhase.get(task.phaseId) ?? []
    bucket.push(task)
    tasksByPhase.set(task.phaseId, bucket)
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Walk each phase in order. Work the tasks, review the outbound, then arm the phase when it
        is ready. Nothing sends until you arm it.
      </p>

      {phases.map((phase) => {
        const tasks = tasksByPhase.get(phase.id) ?? []
        const outbound = outboundByPhase.get(phase.id) ?? []
        return (
          <section
            key={phase.id}
            className="space-y-5 rounded-3xl border border-border bg-surface p-5 sm:p-6"
          >
            {/* Phase header: key + title, goal, editable status. */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Flag className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
                  <h2 className="text-base font-bold text-text">
                    <span className="text-primary-strong">{phase.key}</span> · {phase.title}
                  </h2>
                </div>
                {phase.goal && (
                  <p className="flex items-start gap-1.5 text-sm text-muted">
                    <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
                    <span>{phase.goal}</span>
                  </p>
                )}
                {phase.summary && <p className="text-sm text-text/80">{phase.summary}</p>}
              </div>
              <PhaseStatusControl phaseId={phase.id} status={phase.status} />
            </div>

            {/* Task board: each task carries its "done when…" acceptance + a status control. */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-subtle">Tasks</h3>
              {tasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted">
                  No tasks on this phase yet.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text">{task.title}</p>
                          {task.priority === 'high' && (
                            <StatusChip tone="warning" size="sm">
                              High
                            </StatusChip>
                          )}
                        </div>
                        {task.detail && <p className="text-xs text-muted">{task.detail}</p>}
                        {task.acceptance && (
                          <p className="text-xs text-subtle">
                            <span className="font-semibold text-muted">Done when: </span>
                            {task.acceptance}
                          </p>
                        )}
                      </div>
                      <TaskStatusControl taskId={task.id} status={task.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Outbound queue + the phase arm control. */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-subtle">
                Outbound in this phase
              </h3>
              <PhaseOutbound phaseId={phase.id} items={outbound} canArm={canArm} />
            </div>
          </section>
        )
      })}
    </div>
  )
}
