import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'

// WAVE 2: PHASES — the phase-by-phase review + ARM surface (owner's core workflow).
//
// This is where the operator walks each phase (P0..P4), reviews and EDITS its drafted
// outbound, then arms that phase's items to send. It is the primary consumer of the
// approval spine's phase-scoped API.
//
// CONTRACT (for the Wave-2 phases agent):
//   • Export `BetaPhasesSection` from THIS file (the page switch imports it by name).
//   • Plugs into page.tsx at `tab === 'phases'`.
//   • Data + actions (all already built in Wave 1):
//       - lib/beta/phases.ts: listPhases / getPhase / updatePhaseStatus / reorderPhases.
//       - lib/beta/tasks.ts: listTasks(phaseId) / updateTaskStatus / reorderTasks.
//       - lib/beta/approvals.ts: listPhaseOutbound(phaseId) → the phase's campaigns +
//         waves with approval_status; markReady / approve (per-item) / armPhase(phaseId)
//         (arm all ready at once). Every arm is APPROVER-gated (admin/janitor) + audited.
//     Render per phase: goal + status, the task board (with each task's acceptance), and
//     the outbound list with Review / Edit / Approve + an "Arm this phase" button
//     (armPhase). Compose the kit (StatusChip, StatCard, EmptyState); no hand-rolled UI.
export function BetaPhasesSection() {
  return (
    <AdminSection title="Phases">
      <EmptyState
        variant="first-use"
        title="Phase review + arm lands in Wave 2"
        description="Walk each phase, review and edit its drafted outbound, then arm it to send."
      />
    </AdminSection>
  )
}
