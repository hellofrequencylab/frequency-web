import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'

// WAVE 2: TIMELINE — the launch schedule (phases + waves + scheduled sends on a calendar).
//
// CONTRACT (for the Wave-2 timeline agent):
//   • Export `BetaTimelineSection` from THIS file (the page switch imports it by name).
//   • Plugs into page.tsx at `tab === 'timeline'`.
//   • Data: beta_phases carry starts_on / ends_on (lib/beta/phases.ts); approvable
//     objects carry scheduled_for (lib/beta/approvals.ts OutboundItem.scheduledFor) and
//     sent_at. Render a phase-banded timeline of scheduled + sent outbound. Read-only in
//     Wave 2 v1; rescheduling routes through approve(ref, { scheduledFor }) (already built).
export function BetaTimelineSection() {
  return (
    <AdminSection title="Timeline">
      <EmptyState
        variant="first-use"
        title="The launch timeline lands in Wave 2"
        description="Phases, admission waves, and scheduled sends on one schedule."
      />
    </AdminSection>
  )
}
