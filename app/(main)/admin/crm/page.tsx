import { Suspense } from 'react'
import { Activity, HeartPulse, Sparkles, TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getPlatformHealth,
  getWorklist,
  getRisingMembers,
  type HealthSummary,
} from '@/lib/dashboard/scores'
import { verdictLine, healthTone, formatDelta } from '@/lib/dashboard/verdict'
import { Worklist } from '@/components/dashboard/worklist'
import { LifecycleFunnelPanel } from '@/components/dashboard/lifecycle-funnel'
import { RisingMembers } from './rising-members'
import { ToneStat } from './tone-stat'

// ALTITUDE 1 - the Platform cockpit (Resonance Engine Phase 2 · ADR-383 ·
// docs/NEXT-GEN-CRM.md "The brilliant admin dashboard"). The whole platform in one screen:
// a computed verdict line, four StatCards, the who-needs-attention worklist (the part operators
// use), then a drillable lifecycle funnel + a "rising members about to resonate" card. It passes
// the 5-second test: an owner who looks for five seconds knows the one thing to do next.
//
// STAFF-GATED, mirroring Phase 1's /admin/crm/today (requireAdmin('janitor')): a platform-wide
// member-health read is a sensitive operator view. The /admin/* group mounts its own info rail
// (page-chrome returns 'none' for /admin/*), so no rail registration is needed in a page.
//
// SPEED IS STRUCTURAL: the verdict + worklist read first (they are what matters); the heavy
// aggregates (funnel, rising members) each sit behind their own <Suspense>. Every read is
// fail-safe (zeros / empty), so the cockpit degrades to a calm empty state, never a crash.
// Semantic tokens only (no hardcoded hex); copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

const MEMBERS_DRILL = '/admin/crm/members'

export default async function PlatformCockpitPage() {
  await requireAdmin('janitor')

  // The verdict + worklist read together up front: they are the answer-first part of the page.
  // Both are fail-safe (zeros / empty list), so this await never throws.
  const [{ summary, funnel }, worklist] = await Promise.all([getPlatformHealth(), getWorklist()])
  const verdict = verdictLine(summary.meanHealth, worklist.rows.length)

  return (
    <AdminTemplate
      title="Resonance cockpit"
      eyebrow="CRM"
      icon={Sparkles}
      description={verdict}
      width="wide"
    >
      {/* The four-stat row: the platform's health at a glance, each colored by the legend. */}
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PlatformStats summary={summary} atRiskNow={worklist.rows.length} />
        </div>
      </AdminSection>

      {/* The hero worklist: people, not a chart. Reads up front (it is what operators use). */}
      <AdminSection title="Who needs you today" description="The members the model says are sliding now, each with the one move to make. Tap to act in Vera Today.">
        <Worklist rows={worklist.rows} laterCount={worklist.laterCount} />
      </AdminSection>

      {/* The lifecycle funnel: where members stall, drillable to the people stuck at each stage. */}
      <AdminSection title="Lifecycle funnel" description="The climb from new to engaged, and who has slipped off it.">
        <Suspense fallback={<PanelSkeleton />}>
          <FunnelSection funnel={funnel} />
        </Suspense>
      </AdminSection>

      {/* Rising members: the overlooked pool worth a reach-out. Its own boundary (a separate read). */}
      <AdminSection title="About to resonate" description="Members with room to move who are not yet resonant. The reach-out that converts.">
        <Suspense fallback={<PanelSkeleton />}>
          <RisingSection />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

/** The four platform StatCards. Period deltas use last week's mean as the baseline once the
 *  matview carries history; until then they read "first reading" (honest, never faked). */
function PlatformStats({ summary, atRiskNow }: { summary: HealthSummary; atRiskNow: number }) {
  // v1 baselines are null (no historical snapshot table yet), so deltas read "first reading".
  // The shape is ready for a week-ago snapshot to slot in behind the same call.
  const healthDelta = formatDelta(summary.meanHealth, null)
  const atRiskDelta = formatDelta(summary.atRisk, null, { lowerIsBetter: true })
  return (
    <>
      <ToneStat
        label="Resonance Health"
        value={summary.members === 0 ? '–' : Math.round(summary.meanHealth)}
        icon={HeartPulse}
        tone={summary.members === 0 ? 'flat' : healthTone(summary.meanHealth)}
        delta={healthDelta}
        detail={`across ${summary.members} scored ${summary.members === 1 ? 'member' : 'members'}`}
      />
      <ToneStat
        label="At risk now"
        value={summary.atRisk}
        icon={Activity}
        tone={summary.atRisk > 0 ? 'danger' : 'success'}
        delta={atRiskDelta}
        href={`${MEMBERS_DRILL}?tier=at_risk`}
        detail="members in the red tier"
      />
      <StatCard
        label="Need you today"
        value={atRiskNow}
        icon={Sparkles}
        href="/admin/crm/today"
        detail="on the Today worklist"
      />
      <ToneStat
        label="Weekly active"
        value={summary.weeklyActive}
        icon={TrendingUp}
        tone="success"
        detail={summary.members === 0 ? 'no members scored yet' : `of ${summary.members} scored`}
      />
    </>
  )
}

async function FunnelSection({ funnel }: { funnel: import('@/lib/dashboard/scores').LifecycleFunnel }) {
  const total = funnel.new + funnel.activated + funnel.engaged + funnel.atRisk + funnel.dormant
  if (total === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="No lifecycle data yet"
        description="Once the overnight refresh scores members, their climb from new to engaged shows here, drillable to who is stuck where."
      />
    )
  }
  return <LifecycleFunnelPanel funnel={funnel} drillBase={MEMBERS_DRILL} />
}

async function RisingSection() {
  const rising = await getRisingMembers()
  return <RisingMembers members={rising} />
}

function PanelSkeleton() {
  return <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/50" />
}
