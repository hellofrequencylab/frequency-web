import { Users, CheckCircle2, UserPlus, Activity, GraduationCap } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSection } from '@/components/templates'
import { listBetaSignups, summarizeBeta } from '@/lib/studio/beta'
import { listReadyForApproval, groupReadyByPhase } from '@/lib/beta/approvals'
import { listPhases } from '@/lib/beta/phases'
import { NeedsApprovalQueue, type ApprovalGroup } from './needs-approval-queue'

// TODAY — the Beta Command Center default tab (Wave 1, minimal + real). Two blocks:
// the north-star stat row, and the "Needs your approval" queue (ready outbound grouped
// BY PHASE). Server Component: self-fetches, hands serializable data to the client queue.
//
// WAVE 2 fills the activation + graduation stats (stubbed below) and grows the queue with
// per-item preview + admit. It plugs in HERE (this file) — no contract change needed.

export async function BetaTodaySection() {
  const [signups, ready, phases] = await Promise.all([
    listBetaSignups(),
    listReadyForApproval(),
    listPhases(),
  ])
  const stats = summarizeBeta(signups)

  // Group the ready queue by phase, then resolve each phase id to a title for the header.
  const phaseById = new Map(phases.map((p) => [p.id, p]))
  const grouped = groupReadyByPhase(ready)
  const groups: ApprovalGroup[] = [...grouped.entries()]
    .map(([phaseId, items]) => {
      const phase = phaseId ? phaseById.get(phaseId) : undefined
      return {
        phaseKey: phase?.key ?? null,
        phaseTitle: phase ? `${phase.key} · ${phase.title}` : 'Not filed under a phase',
        items,
      }
    })
    // Keep phase order (by plan position); the unfiled bucket sorts last.
    .sort((a, b) => {
      const pa = a.phaseKey ? (phases.find((p) => p.key === a.phaseKey)?.position ?? 0) : 999
      const pb = b.phaseKey ? (phases.find((p) => p.key === b.phaseKey)?.position ?? 0) : 999
      return pa - pb
    })

  return (
    <div className="space-y-8">
      <AdminSection title="North star" description="The Beta at a glance.">
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
          <StatCard label="Waitlist" value={stats.total.toLocaleString()} icon={Users} />
          <StatCard label="Confirmed" value={stats.confirmed.toLocaleString()} icon={CheckCircle2} />
          <StatCard label="Ready to admit" value={stats.confirmed.toLocaleString()} icon={UserPlus} />
          {/* WAVE 2: activation rate (solo activation under 7 days) — wire the real read. */}
          <StatCard label="Activation" value="Soon" icon={Activity} detail="Wired in Wave 2" />
          {/* WAVE 2: graduation (Beta to founding member) — wire the real read. */}
          <StatCard label="Graduation" value="Soon" icon={GraduationCap} detail="Wired in Wave 2" />
        </div>
      </AdminSection>

      <AdminSection
        title="Needs your approval"
        description="Nothing sends until you sign off. Ready outbound, grouped by phase."
      >
        {groups.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="Nothing waiting"
            description="No campaigns or admission waves are ready for approval right now."
          />
        ) : (
          <NeedsApprovalQueue groups={groups} />
        )}
      </AdminSection>
    </div>
  )
}
