import { Suspense } from 'react'
import { Users, CircleDot, CalendarDays, Sparkles, Compass } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { EmptyState } from '@/components/ui/empty-state'
import { getMarketingIntel } from '@/lib/analytics/marketing-intel'
import type { InterestDemand, GeoRow, GrowthWeek, ContentRow, LeaderRow } from '@/lib/analytics/marketing-intel'
import { getAcquisitionRollup } from '@/lib/attribution/rollup'
import type { ChannelRollupRow } from '@/lib/attribution/rollup'
import { runAcquisitionBackfill } from '@/app/(main)/admin/insights/actions'
import {
  projectGrowth,
  demandGaps,
  buildStrategy,
  type Momentum,
  type StrategyStatus,
  type StrategyItem,
} from '@/lib/analytics/marketing-forecast'

// The "Marketing intel" tab of the consolidated Insights suite (ADR-263) — formerly /admin/intel.
// Vera Marketing Intelligence: real-time, first-party growth / demand / geo / content / leader signal
// from the deterministic mkt_* aggregates, plus grounded forecasts + strategy. Deterministic, no model
// call. The one-click acquisition Backfill action is preserved (runAcquisitionBackfill). Heavy
// aggregates sit behind one Suspense boundary so the shell never blocks.

// Momentum + strategy-status map onto the shared StatusChip tones.
const MOMENTUM: Record<Momentum, { tone: StatusTone; label: string }> = {
  accelerating: { tone: 'success', label: 'Accelerating' },
  steady: { tone: 'neutral', label: 'Steady' },
  slowing: { tone: 'warning', label: 'Slowing' },
}
const STATUS: Record<StrategyStatus, { tone: StatusTone; label: string }> = {
  now: { tone: 'success', label: 'Now' },
  watch: { tone: 'warning', label: 'Watch' },
  hold: { tone: 'neutral', label: 'Hold' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'never'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function IntelTab() {
  return (
    <Suspense fallback={<IntelSkeleton />}>
      <IntelContent />
    </Suspense>
  )
}

async function IntelContent() {
  const [intel, acq] = await Promise.all([getMarketingIntel(90, 30), getAcquisitionRollup()])

  const totals = intel.growth.reduce(
    (a, w) => ({
      members: a.members + w.new_members,
      circles: a.circles + w.new_circles,
      events: a.events + w.new_events,
    }),
    { members: 0, circles: 0, events: 0 },
  )

  // Phase 2: grounded forecasts + strategy. Deterministic, no model call.
  const forecast = projectGrowth(intel.growth, 4)
  const gaps = demandGaps(intel.demand)
  const strategy = buildStrategy(intel, forecast, gaps)

  const acqColumns: ColumnDef<ChannelRollupRow>[] = [
    { key: 'label', header: 'Channel', render: (r) => <span className="font-medium text-text">{r.label}</span> },
    { key: 'members', header: 'Members', type: 'number', render: (r) => r.members.toLocaleString() },
    { key: 'last30', header: 'New · 30d', type: 'number', render: (r) => r.last30.toLocaleString() },
    { key: 'share', header: 'Share', type: 'number', render: (r) => `${Math.round(r.share * 100)}%` },
  ]
  const demandColumns: ColumnDef<InterestDemand>[] = [
    { key: 'pillar', header: 'Pillar', render: (d) => <span className="font-medium text-text">{d.pillar}</span> },
    { key: 'interest', header: 'Channel', render: (d) => d.interest },
    { key: 'tune_ins', header: 'Tune-ins', type: 'number', render: (d) => d.tune_ins.toLocaleString() },
    { key: 'circles', header: 'Circles', type: 'number', render: (d) => d.circles.toLocaleString() },
    { key: 'members', header: 'Members', type: 'number', render: (d) => d.members.toLocaleString() },
  ]
  const geoColumns: ColumnDef<GeoRow>[] = [
    { key: 'city', header: 'City', render: (g) => <span className="font-medium text-text">{g.city}</span> },
    { key: 'circles', header: 'Circles', type: 'number', render: (g) => g.circles.toLocaleString() },
    { key: 'members', header: 'Members', type: 'number', render: (g) => g.members.toLocaleString() },
  ]
  const growthColumns: ColumnDef<GrowthWeek>[] = [
    { key: 'week', header: 'Week', render: (w) => <span className="font-medium text-text">{fmtDate(w.week)}</span> },
    { key: 'new_members', header: 'Members', type: 'number', render: (w) => w.new_members.toLocaleString() },
    { key: 'new_circles', header: 'Circles', type: 'number', render: (w) => w.new_circles.toLocaleString() },
    { key: 'new_events', header: 'Events', type: 'number', render: (w) => w.new_events.toLocaleString() },
  ]
  const contentColumns: ColumnDef<ContentRow>[] = [
    { key: 'created_at', header: 'When', render: (c) => <span className="font-medium text-text">{fmtDate(c.created_at)}</span> },
    { key: 'author', header: 'Author', render: (c) => c.author ?? 'Member' },
    { key: 'engagement_score', header: 'Score', type: 'number', render: (c) => Math.round(c.engagement_score ?? 0).toLocaleString() },
    { key: 'reactions', header: 'Reactions', type: 'number', render: (c) => (c.reactions ?? 0).toLocaleString() },
    { key: 'comments', header: 'Comments', type: 'number', render: (c) => (c.comments ?? 0).toLocaleString() },
    { key: 'excerpt', header: 'Excerpt', render: (c) => <span className="text-muted">{c.excerpt ?? ''}</span> },
  ]
  const leaderColumns: ColumnDef<LeaderRow>[] = [
    { key: 'leader', header: 'Leader', render: (l) => <span className="font-medium text-text">{l.leader ?? 'Member'}</span> },
    { key: 'role', header: 'Role', render: (l) => <StatusChip size="sm">{l.role}</StatusChip> },
    { key: 'circles', header: 'Circles', type: 'number', render: (l) => l.circles.toLocaleString() },
    { key: 'members', header: 'Members', type: 'number', render: (l) => l.members.toLocaleString() },
    { key: 'last_post', header: 'Last post', render: (l) => fmtDate(l.last_post) },
    { key: 'last_event', header: 'Last event', render: (l) => fmtDate(l.last_event) },
    { key: 'season_zaps', header: 'Zaps', type: 'number', render: (l) => (l.season_zaps ?? 0).toLocaleString() },
    { key: 'lifetime_gems', header: 'Gems', type: 'number', render: (l) => (l.lifetime_gems ?? 0).toLocaleString() },
  ]

  return (
    <>
      <AdminSection
        title="Forecast & strategy"
        description={
          forecast.grounded
            ? 'Projected next 4 weeks from the weekly trend, then what to do about it. Deterministic, grounded only in the signal below.'
            : 'Not enough weekly history yet to project a trend. The strategy below still reflects current demand, geo, and leader signal.'
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Projected new members · 4w" value={forecast.new_members.projectedTotal} icon={Users} detail={MOMENTUM[forecast.new_members.momentum].label} />
          <StatCard label="Projected new circles · 4w" value={forecast.new_circles.projectedTotal} icon={CircleDot} detail={MOMENTUM[forecast.new_circles.momentum].label} />
          <StatCard label="Projected new events · 4w" value={forecast.new_events.projectedTotal} icon={CalendarDays} detail={MOMENTUM[forecast.new_events.momentum].label} />
        </div>

        {strategy.length === 0 ? (
          <EmptyState variant="first-use" icon={Compass} title="No clear move yet" description="A prioritized strategy appears here as the signal builds." />
        ) : (
          <ol className="space-y-2">
            {strategy.map((s: StrategyItem, i) => (
              <li key={i} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
                <StatusChip tone={STATUS[s.status].tone} size="sm">{STATUS[s.status].label}</StatusChip>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </AdminSection>

      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={`New members · ${intel.windowDays}d`} value={totals.members} icon={Users} />
          <StatCard label="New circles" value={totals.circles} icon={CircleDot} />
          <StatCard label="New events" value={totals.events} icon={CalendarDays} />
          <StatCard label="Active leaders" value={intel.leaders.length} icon={Sparkles} />
        </div>
      </AdminSection>

      <AdminSection
        title="Acquisition sources"
        description={`How members first reached us (first-touch). ${acq.attributed} of ${acq.totalMembers} attributed (${Math.round(acq.coverage * 100)}% coverage).`}
        actions={
          <form action={runAcquisitionBackfill}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
            >
              <Compass className="h-3.5 w-3.5" aria-hidden /> Backfill from referrals + beta
            </button>
          </form>
        }
      >
        <DataTable
          rows={acq.rows}
          getRowId={(r) => r.label}
          columns={acqColumns}
          caption="Acquisition channels by first-touch attribution."
          empty={
            <EmptyState
              variant="first-use"
              icon={Compass}
              title="No attributed members yet"
              description="New signups are tagged automatically; Backfill infers a source for existing members from referrals and their beta answers."
            />
          }
        />
      </AdminSection>

      <AdminSection
        title="Channel demand vs supply"
        description="Where tune-ins and joins outrun the circles available. The gaps are what to seed next."
      >
        <DataTable
          rows={intel.demand}
          getRowId={(d) => d.interest_slug}
          columns={demandColumns}
          caption="Demand versus supply by channel."
          empty={<EmptyState variant="first-use" icon={CircleDot} title="No demand signal yet" description="Tune-ins and joins fill this in as members engage." />}
        />
      </AdminSection>

      <AdminSection title="Where it is concentrated" description="Circles and members reached, by city.">
        <DataTable
          rows={intel.geo}
          getRowId={(g) => g.city}
          columns={geoColumns}
          caption="Reach by city."
          empty={<EmptyState variant="first-use" icon={Compass} title="No geo signal yet" description="Reach by city appears as members and circles pick a place." />}
        />
      </AdminSection>

      <AdminSection title="Growth by week">
        <DataTable
          rows={intel.growth}
          getRowId={(w) => w.week}
          columns={growthColumns}
          caption="Weekly new members, circles, and events."
          empty={<EmptyState variant="first-use" icon={Users} title="No weekly history yet" description="Weekly growth fills in as the platform accrues activity." />}
        />
      </AdminSection>

      <AdminSection title="Top content" description={`Highest-engagement posts in the last ${intel.contentDays} days.`}>
        <DataTable
          rows={intel.content}
          getRowId={(c) => c.post_id}
          columns={contentColumns}
          caption="Top content by engagement."
          empty={<EmptyState variant="first-use" icon={Sparkles} title="No content signal yet" description="High-engagement posts appear here as the community posts." />}
        />
      </AdminSection>

      <AdminSection
        title="Leader activity"
        description="Per Host, Guide, and Mentor: circle health and momentum. This is the input to each leader's seed prompts."
        actions={<FreshnessNote at={new Date()} label="Computed" />}
      >
        <DataTable
          rows={intel.leaders}
          getRowId={(l) => l.profile_id}
          columns={leaderColumns}
          density="compact"
          caption="Leader circle health and momentum."
          empty={<EmptyState variant="first-use" icon={Sparkles} title="No leader activity yet" description="Leader health appears here as Hosts, Guides, and Mentors run circles." />}
        />
      </AdminSection>
    </>
  )
}

function IntelSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/70" />
        ))}
      </div>
      <TableSkeleton rows={6} cols={4} />
    </>
  )
}
