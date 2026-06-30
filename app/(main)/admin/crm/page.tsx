import { Suspense } from 'react'
import { Activity, HeartPulse, Sparkles, TrendingUp, Users } from 'lucide-react'
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
import { runChurnBacktest } from '@/lib/playbooks/backtest'
import { CockpitMemberViewer } from './cockpit-member-viewer'

// ALTITUDE 1 - the Platform Resonance CRM (Resonance Engine Phase 2 · ADR-383 · ADR-459 ·
// docs/NEXT-GEN-CRM.md "The brilliant admin dashboard"). VIEWER-FIRST: the reusable member-viewer
// block sits at the TOP of the cockpit (10 rows, most-recent first, with the hero sort + live search
// as the headline), so the scored roster + the search-and-sort an operator reaches for first are the
// landing. The health cockpit (the computed verdict, the StatCard row, the who-needs-attention
// worklist, the lifecycle funnel, the rising-members pool, and the score-trustworthiness backtest)
// sits BELOW the viewer, restored as StatCards + sections sourced from the existing cockpit readers.
//
// STAFF-GATED, mirroring Phase 1's /admin/crm/today (requireAdmin('janitor')): a platform-wide
// member-health read is a sensitive operator view. The /admin/* group mounts its own info rail
// (page-chrome returns 'none' for /admin/*), so no rail registration is needed in a page.
//
// SPEED IS STRUCTURAL: the member viewer (the one client island) and each heavy cockpit aggregate
// (the stats block, funnel, rising members, backtest) sit behind their own <Suspense>, so the shell
// never blocks on a slow await. Every read is fail-safe (zeros / empty), so the CRM degrades to a
// calm empty state, never a crash. Semantic tokens only (no hardcoded hex); copy in voice (no em or
// en dashes).

export const dynamic = 'force-dynamic'

const MEMBERS_DRILL = '/admin/crm/members'

export default async function PlatformCrmPage() {
  await requireAdmin('janitor')

  return (
    <AdminTemplate
      title="Resonance CRM"
      eyebrow="CRM"
      icon={Sparkles}
      description="Your whole scored roster up top, sorted by who joined most recently. The health read for the platform sits below."
      width="wide"
    >
      {/* VIEWER-FIRST: the member-viewer block is the cockpit's front door (ADR-459). Its own
          boundary so a slow roster read never blocks the cockpit stats below. */}
      <AdminSection
        title="Members"
        description="Everyone the engine has scored. Search, re-sort, and open anyone to see their roles, funnels, pipeline, and recent touches."
      >
        <Suspense fallback={<ViewerSkeleton />}>
          <CockpitMemberViewer />
        </Suspense>
      </AdminSection>

      {/* The health cockpit, restored BELOW the viewer. Its own boundary; fail-safe. */}
      <Suspense fallback={<PanelSkeleton />}>
        <CockpitStats />
      </Suspense>

      {/* Rising members: the overlooked pool worth a reach-out. Its own boundary (a separate read). */}
      <AdminSection title="About to resonate" description="Members with room to move who are not yet resonant. The reach-out that converts.">
        <Suspense fallback={<PanelSkeleton />}>
          <RisingSection />
        </Suspense>
      </AdminSection>

      {/* Score trustworthiness (Phase 3 · ADR-384): the backtest of predicted churn vs actual
          dormancy, so an operator knows whether to trust the scores. Its own boundary; fail-safe. */}
      <AdminSection title="Can you trust the scores" description="A backtest of the churn risk calls against what actually happened.">
        <Suspense fallback={<PanelSkeleton />}>
          <TrustSection />
        </Suspense>
      </AdminSection>
    </AdminTemplate>
  )
}

// ── COCKPIT STATS (restored below the viewer): verdict + the LIVE stat row + worklist + funnel ────

async function CockpitStats() {
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

/** The four platform StatCards (the LIVE row, restored below the viewer): Members + Active this week
 *  + At risk now + Resonance Health. Period deltas use last week's mean as the baseline once the
 *  matview carries history; until then they read "first reading" (honest, never faked). */
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

async function RisingSection() {
  const rising = await getRisingMembers()
  return <RisingMembers members={rising} />
}

/** The score-trustworthiness panel: the backtest verdict + the per-band calibration. Fail-safe (the
 *  read returns the honest "not enough history" report on any error). */
async function TrustSection() {
  const report = await runChurnBacktest()
  if (!report.trustworthy) {
    return (
      <EmptyState
        variant="first-use"
        title="Not enough history yet"
        description="Once a few cycles of predictions have something to compare against, the score trustworthiness shows here."
      />
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-text">{report.verdict}</p>
      <div className="grid grid-cols-3 gap-3">
        {report.calibration.map((c) => (
          <StatCard
            key={c.band}
            label={`Predicted ${c.band}`}
            value={`${Math.round(c.actualDormantRate * 100)}%`}
            detail={`went dormant · ${c.count} ${c.count === 1 ? 'member' : 'members'}`}
          />
        ))}
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return <div className="h-44 animate-pulse rounded-2xl bg-surface-elevated/50" />
}

function ViewerSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-11 animate-pulse rounded-xl bg-surface-elevated/50" />
      <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
        ))}
      </div>
    </div>
  )
}
