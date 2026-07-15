import { Activity, HeartPulse, TrendingUp, Users } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { getPlatformHealth, getWorklist, type HealthSummary } from '@/lib/dashboard/scores'
import { verdictLine, healthTone, formatDelta } from '@/lib/dashboard/verdict'
import { Worklist } from '@/components/dashboard/worklist'
import { LifecycleFunnelPanel } from '@/components/dashboard/lifecycle-funnel'
import { ToneStat } from '@/app/(main)/admin/crm/tone-stat'

// Resonance CRM layout module (LP7, ADR-270/294): the health cockpit, restored BELOW the viewer — the
// computed verdict, the LIVE StatCard row, the who-needs-attention worklist, and the lifecycle funnel.
// Self-fetching RSC; the page owns the janitor gate, so this never re-gates. The verdict + worklist read
// together up front (both fail-safe: zeros / empty), so this await never throws. Semantic tokens only.

const MEMBERS_DRILL = '/admin/crm/members'

/** The COMPACT platform stat row for the Resonance CRM home header (ADR-459): Members / Active this
 *  week / At risk / Resonance Health, read from getPlatformHealth. Self-fetching + fail-safe (zeros),
 *  so it never blocks the shell — mount it behind its own <Suspense>. Semantic tokens only. */
export async function CrmHealthStatRow() {
  const { summary } = await getPlatformHealth()
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Members"
        value={summary.members}
        icon={Users}
        href={MEMBERS_DRILL}
        detail={summary.members === 1 ? 'scored member' : 'scored members'}
      />
      <ToneStat
        label="Active this week"
        value={summary.weeklyActive}
        icon={TrendingUp}
        tone="success"
        detail={summary.members === 0 ? 'no members scored yet' : `of ${summary.members} scored`}
      />
      <ToneStat
        label="At risk"
        value={summary.atRisk}
        icon={Activity}
        tone={summary.atRisk > 0 ? 'danger' : 'success'}
        href={`${MEMBERS_DRILL}?tier=at_risk`}
        detail="in the red tier"
      />
      <ToneStat
        label="Resonance Health"
        value={summary.members === 0 ? '–' : Math.round(summary.meanHealth)}
        icon={HeartPulse}
        tone={summary.members === 0 ? 'flat' : healthTone(summary.meanHealth)}
        detail={`across ${summary.members} scored`}
      />
    </div>
  )
}

export async function CrmCockpitStats() {
  // The verdict + worklist read together up front: they are the answer-first part of the cockpit.
  // Both are fail-safe (zeros / empty list), so this await never throws.
  const [{ summary, funnel }, worklist] = await Promise.all([getPlatformHealth(), getWorklist()])
  const verdict = verdictLine(summary.meanHealth, worklist.rows.length)
  const funnelTotal = funnel.new + funnel.activated + funnel.engaged + funnel.atRisk + funnel.dormant

  return (
    <>
      {/* The computed verdict line: the whole cockpit in one sentence (the 5-second test). */}
      <AdminSection>
        <p className="text-sm text-text">{verdict}</p>
      </AdminSection>

      {/* The LIVE stat row: the platform's health at a glance, each colored by the legend. */}
      <AdminSection title="Live" description="The platform's health right now, each band drillable to its members.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <PlatformStats summary={summary} />
        </div>
      </AdminSection>

      {/* Needs attention: people, not a chart. The members the model says are sliding now. */}
      <AdminSection title="Needs attention" description="The members the model says are sliding now, each with the one move to make. Tap to act in Vera Today.">
        <Worklist rows={worklist.rows} laterCount={worklist.laterCount} />
      </AdminSection>

      {/* The lifecycle funnel: where members stall, drillable to the people stuck at each stage. */}
      <AdminSection title="Lifecycle funnel" description="The climb from new to engaged, and who has slipped off it.">
        {funnelTotal === 0 ? (
          <EmptyState
            variant="first-use"
            title="No lifecycle data yet"
            description="Once the overnight refresh scores members, their climb from new to engaged shows here, drillable to who is stuck where."
          />
        ) : (
          <LifecycleFunnelPanel funnel={funnel} drillBase={MEMBERS_DRILL} />
        )}
      </AdminSection>
    </>
  )
}

/** The four platform StatCards (the LIVE row): Members + Active this week + At risk now + Resonance
 *  Health. Period deltas use last week's mean as the baseline once the matview carries history; until
 *  then they read "first reading" (honest, never faked). */
function PlatformStats({ summary }: { summary: HealthSummary }) {
  // v1 baselines are null (no historical snapshot table yet), so deltas read "first reading".
  // The shape is ready for a week-ago snapshot to slot in behind the same call.
  const healthDelta = formatDelta(summary.meanHealth, null)
  const atRiskDelta = formatDelta(summary.atRisk, null, { lowerIsBetter: true })
  return (
    <>
      <StatCard
        label="Members"
        value={summary.members}
        icon={Users}
        href={MEMBERS_DRILL}
        detail={summary.members === 1 ? 'scored member' : 'scored members'}
      />
      <ToneStat
        label="Active this week"
        value={summary.weeklyActive}
        icon={TrendingUp}
        tone="success"
        detail={summary.members === 0 ? 'no members scored yet' : `of ${summary.members} scored`}
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
      <ToneStat
        label="Resonance Health"
        value={summary.members === 0 ? '–' : Math.round(summary.meanHealth)}
        icon={HeartPulse}
        tone={summary.members === 0 ? 'flat' : healthTone(summary.meanHealth)}
        delta={healthDelta}
        detail={`across ${summary.members} scored ${summary.members === 1 ? 'member' : 'members'}`}
      />
    </>
  )
}
