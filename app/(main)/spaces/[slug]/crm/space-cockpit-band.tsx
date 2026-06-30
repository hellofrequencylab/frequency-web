import { Activity, HeartPulse, Mail, Users } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { Worklist } from '@/components/dashboard/worklist'
import { LifecycleFunnelPanel } from '@/components/dashboard/lifecycle-funnel'
import { SectionHeader } from '@/components/ui/section-header'
import { getSpaceHealth, getSpaceFunnel, getWorklist } from '@/lib/dashboard/scores'
import { getSpaceCrmFunnel } from '@/lib/spaces/crm-funnel'
import { getSpaceAcceptedIntros } from '@/lib/resonance/surface'
import { spaceVerdictLine, healthTone } from '@/lib/dashboard/verdict'

// ALTITUDE 2 - the Space cockpit band (Resonance Engine Phase 2 · ADR-383). The same verdict +
// health language as the platform cockpit, scoped to ONE Space's reachable members. Rendered ABOVE
// the existing pipeline / funnel / tasks on the Space CRM board (which stay intact). Every read is
// fail-safe (zeros / empty) and bound to this space_id. The Space board's own gate (canUseCrm:
// entitlement + owner/admin) already authorized the caller before this renders.
//
// authz-delegated: read-only; the gate is the Space CRM board page that mounts this. The space_id
// is the binding scope passed to every read.

const DOT = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', flat: 'bg-subtle' } as const

/** A small colored tier dot before a StatCard label (legible green/amber/red without recoloring
 *  the value). Mirrors the platform cockpit's ToneStat. */
function toneLabel(label: string, tone: keyof typeof DOT) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
      {label}
    </span>
  )
}

export async function SpaceCockpitBand({ spaceId, slug }: { spaceId: string; slug: string }) {
  // The reads, all fail-safe + scoped to this Space. Parallel so the band paints in one tick. The
  // intros count (ADR-385) reads accepted double-opt-in matches touching the Space; 0 pre-migration.
  const [health, worklist, reachFunnel, lifecycleFunnel, introsAccepted] = await Promise.all([
    getSpaceHealth(spaceId),
    getWorklist({ spaceId }),
    getSpaceCrmFunnel(spaceId),
    getSpaceFunnel(spaceId),
    getSpaceAcceptedIntros(spaceId),
  ])

  const verdict = spaceVerdictLine(health.meanHealth, worklist.rows.length, health.members)
  const boardHref = `/spaces/${slug}/crm`

  return (
    <section className="space-y-4">
      {/* The verdict line: the Space owner's whole week in one computed sentence. */}
      <p className="text-sm text-muted">{verdict}</p>

      {/* Four Space-scoped StatCards. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={toneLabel('Space Resonance Health', health.members === 0 ? 'flat' : healthTone(health.meanHealth))}
          value={health.members === 0 ? '–' : Math.round(health.meanHealth)}
          icon={HeartPulse}
          detail={`across ${health.members} scored ${health.members === 1 ? 'member' : 'members'}`}
        />
        <StatCard
          label="Reachable contacts"
          value={reachFunnel.reach.total}
          icon={Mail}
          detail={`${reachFunnel.reach.subscribed} subscribed`}
        />
        <StatCard
          label={toneLabel('At risk in this Space', health.atRisk > 0 ? 'danger' : 'success')}
          value={health.atRisk}
          icon={Activity}
          detail="members in the red tier"
        />
        <StatCard
          label="Intros accepted"
          value={introsAccepted}
          icon={Users}
          detail="double opt-in matches, both said yes"
        />
      </div>

      {/* The Space who-needs-attention worklist. Each row opens the on-board contact detail (the
          Space owner's action surface), not the platform Today (which is staff-only). */}
      <Worklist
        rows={worklist.rows}
        laterCount={worklist.laterCount}
        title="Who needs you in this Space"
        hrefFor={(row) => `${boardHref}?contact=${row.contactId}`}
        laterHref={boardHref}
      />

      {/* The Space lifecycle funnel (Altitude 2): where this Space's members stall on the climb
          from new to engaged, plus the at-risk / dormant leak. Each step drills to the Space's
          members at that stage (the board's own ?stage= list), each of whom opens their on-board
          detail, keeping the owner inside their Space. */}
      <div>
        <SectionHeader title="Lifecycle" />
        <LifecycleFunnelPanel funnel={lifecycleFunnel} drillBase={boardHref} />
      </div>
    </section>
  )
}
