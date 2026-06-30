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
import { runChurnBacktest } from '@/lib/playbooks/backtest'
import { CrmViewTabs, type CrmAdminView } from './crm-view-tabs'
import { MemberRoster } from './member-roster'

// ALTITUDE 1 - the Platform Resonance CRM (Resonance Engine Phase 2 · ADR-383 ·
// docs/NEXT-GEN-CRM.md "The brilliant admin dashboard" + the "list-first" principle). LIST-FIRST
// (mirroring the Space CRM, #1303): the familiar member roster is the DEFAULT front door and always
// one tap away. The cockpit (the computed verdict, four StatCards, the who-needs-attention worklist,
// the lifecycle funnel, the rising-members pool, and the score-trustworthiness backtest) is the
// SECONDARY view behind ?view=cockpit, so the scored members are visible up front even when the
// action panels are calm (the expected first-reading state). A persistent tabs row (Members default
// · Cockpit) keeps the list one tap from the cockpit and from any drill.
//
// STAFF-GATED, mirroring Phase 1's /admin/crm/today (requireAdmin('janitor')): a platform-wide
// member-health read is a sensitive operator view. The /admin/* group mounts its own info rail
// (page-chrome returns 'none' for /admin/*), so no rail registration is needed in a page.
//
// SPEED IS STRUCTURAL: the member roster and each heavy cockpit aggregate (funnel, rising members,
// backtest) sit behind their own <Suspense>. Every read is fail-safe (zeros / empty), so the CRM
// degrades to a calm empty state, never a crash. Semantic tokens only (no hardcoded hex); copy in
// voice (no em or en dashes).

export const dynamic = 'force-dynamic'

const CRM_HREF = '/admin/crm'
const MEMBERS_DRILL = '/admin/crm/members'

export default async function PlatformCrmPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  await requireAdmin('janitor')
  const { view } = await searchParams
  // LIST-FIRST: Members is the default front door. The cockpit is the secondary view behind
  // ?view=cockpit, never the landing. An unknown value falls back to Members.
  const rawView = Array.isArray(view) ? (view[0] ?? null) : (view ?? null)
  const activeView: CrmAdminView = rawView === 'cockpit' ? 'cockpit' : 'members'

  const viewCopy: Record<CrmAdminView, { title: string; description: string }> = {
    members: {
      title: 'Members',
      description: 'Everyone the engine has scored, lowest health first. Tap anyone to open their full timeline.',
    },
    cockpit: {
      title: 'Cockpit',
      description: 'The health read for the platform: who needs you, where members stall, and who is about to resonate.',
    },
  }

  return (
    <AdminTemplate
      title={viewCopy[activeView].title}
      eyebrow="CRM"
      icon={Sparkles}
      description={viewCopy[activeView].description}
      width="wide"
    >
      {/* LIST-FIRST (docs/NEXT-GEN-CRM.md): the persistent view tabs sit at the top of every view,
          so the familiar member list is always one tap away from the Cockpit. */}
      <CrmViewTabs boardHref={CRM_HREF} active={activeView} />

      {activeView === 'members' ? <MembersView /> : <CockpitView />}
    </AdminTemplate>
  )
}

// ── MEMBERS (default front door): the full scored roster, the familiar list ───────────────────────

function MembersView() {
  return (
    <AdminSection>
      <Suspense fallback={<ListSkeleton />}>
        <MemberRoster
          filter={{ kind: 'all' }}
          emptyTitle="No members scored yet"
          emptyDescription="Once the overnight refresh scores members, your whole roster shows here, each linking to their timeline."
        />
      </Suspense>
    </AdminSection>
  )
}

// ── COCKPIT (secondary): verdict + stats + worklist + funnel + rising + trust ─────────────────────

async function CockpitView() {
  // The verdict + worklist read together up front: they are the answer-first part of the cockpit.
  // Both are fail-safe (zeros / empty list), so this await never throws.
  const [{ summary, funnel }, worklist] = await Promise.all([getPlatformHealth(), getWorklist()])
  const verdict = verdictLine(summary.meanHealth, worklist.rows.length)

  return (
    <>
      {/* The computed verdict line: the whole cockpit in one sentence (the 5-second test). */}
      <AdminSection>
        <p className="text-sm text-text">{verdict}</p>
      </AdminSection>

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

      {/* Score trustworthiness (Phase 3 · ADR-384): the backtest of predicted churn vs actual
          dormancy, so an operator knows whether to trust the scores. Its own boundary; fail-safe. */}
      <AdminSection title="Can you trust the scores" description="A backtest of the churn risk calls against what actually happened.">
        <Suspense fallback={<PanelSkeleton />}>
          <TrustSection />
        </Suspense>
      </AdminSection>
    </>
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

function ListSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
