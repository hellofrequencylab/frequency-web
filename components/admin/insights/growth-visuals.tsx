import { RowCard } from '@/components/cards/row-card'
import { DashArea, GraphTile, Tile, TileGrid } from '@/components/admin/dash'
import { RingGauge } from '@/components/admin/spark-charts'
import { StatusChip } from '@/components/admin/status'
import { ProgressTrack } from '@/components/ui/progress-track'
import { StatCard } from '@/components/ui/stat-card'
import { measuredRate, type GrowthSnapshot } from '@/lib/analytics/growth'

export function AttendanceComparison({ current, previous }: { current: number; previous: number }) {
  const difference = current - previous
  const change = previous > 0 ? Math.round((difference / previous) * 100) : null
  const description = difference === 0
    ? 'Same number as the previous seven days'
    : `${difference > 0 ? '+' : ''}${difference.toLocaleString()} Members versus the previous seven days${change === null ? ' (no prior attendance baseline)' : ` (${change > 0 ? '+' : ''}${change}%)`}`
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-body-sm">
      <StatusChip tone={difference > 0 ? 'success' : difference < 0 ? 'warning' : 'neutral'}>
        {difference > 0 ? 'More Members showing up' : difference < 0 ? 'Fewer Members showing up' : 'Attendance unchanged'}
      </StatusChip>
      <span className="text-muted">{description}</span>
    </div>
  )
}

/** Separate populations stay visibly separate. These graphs never imply a visits-to-account join. */
export function CampaignOutcomeCharts({ data }: { data: GrowthSnapshot }) {
  const signupCampaigns = [...data.campaigns].sort((a, b) => b.activated - a.activated || b.eligible - a.eligible).slice(0, 6)
  const leadCampaigns = [...data.leadCampaigns].sort((a, b) => b.attended - a.attended || b.leads - a.leads).slice(0, 6)
  const maxSignupAttendance = Math.max(1, ...signupCampaigns.map((c) => c.activated))
  const maxLeadAttendance = Math.max(1, ...leadCampaigns.map((c) => c.attended))
  return (
    <TileGrid>
      <GraphTile label="Signup campaigns reaching the room" span={2} caption="Up to six campaigns, ranked by first attendance after signup among Members with a full seven-day follow-up. This is volume, not campaign efficiency.">
        {signupCampaigns.length ? <ol className="space-y-4">
          {signupCampaigns.map((c) => {
            const rate = measuredRate(c.activated, c.eligible)
            const name = `${c.campaign} · ${c.source} / ${c.medium} · ${c.converting_channel}`
            return <li key={JSON.stringify([c.campaign, c.source, c.medium, c.converting_channel])}>
              <RowCard title={<span className="break-words">{name}</span>}
                meta={<span className="tabular-nums">{c.activated} first attendees</span>}
                footer={<><ProgressTrack value={c.activated} max={maxSignupAttendance} label={`${name}: ${c.activated} first attendees`} />
                  <p className="mt-1 text-meta text-muted">{c.activated} of {c.eligible} eligible signups{rate === null ? ' · rate not measured' : ` · ${Math.round(rate * 100)}% attended`} · {c.pending} still observing</p></>} />
            </li>
          })}
        </ol> : <p className="text-body-sm text-muted">Campaign comparisons appear after attributed signups are recorded.</p>}
      </GraphTile>
      <GraphTile label="Captured leads reaching the room" caption="A separate lead cohort. Address capture, membership and attendance are distinct outcomes.">
        {leadCampaigns.length ? <ol className="space-y-4">
          {leadCampaigns.map((c) => {
            const name = `${c.campaign} · ${c.source} / ${c.medium}`
            return <li key={JSON.stringify([c.campaign, c.source, c.medium])}>
              <RowCard title={<span className="break-words">{name}</span>}
                footer={<><ProgressTrack value={c.attended} max={maxLeadAttendance} label={`${name}: ${c.attended} first attendees`} />
                  <p className="mt-1 text-meta text-muted">{c.leads} captured · {c.linked_members} linked Members · {c.attended} attended within seven days · {c.pending} still observing</p></>} />
            </li>
          })}
        </ol> : <p className="text-body-sm text-muted">No captured-lead campaign cohort in this window.</p>}
      </GraphTile>
    </TileGrid>
  )
}

export function MemberOutcomeGraphic({ data }: { data: GrowthSnapshot }) {
  const observed = measuredRate(data.firstAttendanceObserved, data.newMembers)
  return (
    <Tile label="New Members and first attendance">
      {observed === null
        ? <p className="text-body-sm text-muted">No new-Member cohort in this window.</p>
        : <RingGauge pct={observed} label="First completed gathering observed" sub={`${data.firstAttendanceObserved} of ${data.newMembers} new Members`} />}
      <dl className="mt-4 space-y-2 text-body-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Observed first completed gathering</dt><dd className="tabular-nums font-semibold text-text">{data.firstAttendanceObserved}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Awaiting an observed gathering</dt><dd className="tabular-nums font-semibold text-text">{data.newMembers - data.firstAttendanceObserved}</dd></div>
      </dl>
      <p className="mt-3 text-meta text-muted">Completion dates define the attendance window. This includes recent signups still being observed. Use the complete seven-day campaign cohorts to compare conversion.</p>
    </Tile>
  )
}


/** Classic growth uses its actual observed cohorts; unknown stages never inherit a different population. */
export function ClassicGrowthArea({ data }: { data: GrowthSnapshot }) {
  const eligible = data.campaigns.reduce((n, c) => n + c.eligible, 0)
  const activated = data.campaigns.reduce((n, c) => n + c.activated, 0)
  const pending = data.campaigns.reduce((n, c) => n + c.pending, 0)
  const leads = data.leadCampaigns.reduce((n, c) => n + c.leads, 0)
  const activation = measuredRate(activated, eligible)
  const retention = measuredRate(data.repeatReturned, data.repeatEligible)
  return <>
    <DashArea label="Classic growth" blurb="Acquisition, activation, retention, referrals and revenue. Each reading names its own source and follow-up window; missing evidence remains visible.">
      <TileGrid>
        <Tile label="Acquisition">
          <StatCard label={`New Members · ${data.windowDays}d`} value={data.newMembers} />
          <p className="mt-3 text-meta text-muted">First-party saved Member records, not a visitor count. {leads} captured lead records are a separate population. Campaign source and medium appear below.</p>
        </Tile>
        <Tile label="Activation">
          {activation === null ? <p className="text-body-sm text-muted">No signup cohort has complete seven-day follow-up.</p> : <RingGauge pct={activation} label="First attendance within 7d" sub={`${activated} of ${eligible} eligible new Members`} />}
          <p className="mt-3 text-meta text-muted">New Members in the {data.windowDays}-day signup cohort who reached a completed, host-confirmed gathering within seven days. {pending} new Members are still inside their seven-day follow-up.</p>
        </Tile>
        <Tile label="Retention">
          {retention === null ? <p className="text-body-sm text-muted">No first-attendance cohort has complete 28-day follow-up.</p> : <RingGauge pct={retention} label="Return within 28 days" sub={`${data.repeatReturned} of ${data.repeatEligible} eligible first attendees`} />}
          <p className="mt-3 text-meta text-muted">A different completed gathering within 28 days of first attendance. The {data.windowDays}-day first-attendance cohort ends 28 days ago, so every included Member has complete follow-up. This is attendance retention, not app usage.</p>
        </Tile>
        <Tile label="Referrals">
          <StatusChip tone="neutral">Not measured</StatusChip>
          <p className="mt-3 text-body-sm text-text">Referral outcomes are not measured.</p>
          <p className="mt-2 text-meta text-muted">A campaign link can name a referrer, but it does not prove an invitation was accepted or a referred person participated. No referral count or viral coefficient is inferred.</p>
        </Tile>
        <Tile label="Revenue">
          <StatusChip tone="neutral">Not linked</StatusChip>
          <p className="mt-3 text-body-sm text-text">Revenue is not linked to these cohorts.</p>
          <p className="mt-2 text-meta text-muted">Authorized finance operators can review the separate Finances ledger. This reading does not establish campaign revenue, acquisition cost, lifetime value or return on spend.</p>
        </Tile>
      </TileGrid>
    </DashArea>
    <DashArea label="Growth journey" blurb="Visitor arrival, signup, community participation and Space creation are independent populations below, not a joined conversion funnel. Time windows and missing coverage stay explicit.">
      <TileGrid>
        <Tile label="Visitors">
          <StatusChip tone="neutral">Not measured here</StatusChip>
          <p className="mt-3 text-meta text-muted">Distinct visitors are not supplied by this first-party aggregate. The Google Analytics tab reports its own consented audience and date window; its users cannot be divided into these Member counts.</p>
        </Tile>
        <Tile label="Signup">
          <StatCard label={`New Members · ${data.windowDays}d`} value={data.newMembers} />
          <p className="mt-3 text-meta text-muted">Saved Member records. Anonymous arrivals are not identity-linked to this cohort.</p>
        </Tile>
        <Tile label="Community participation">
          <StatCard label="Showing-up Members · 7d" value={data.showingUp} />
          <p className="mt-3 text-meta text-muted">Distinct Members at completed, host-confirmed gatherings in seven days. This is not the same population or window as the signup total.</p>
        </Tile>
        <Tile label="Space creation">
          <StatusChip tone="neutral">Not measured here</StatusChip>
          <p className="mt-3 text-body-sm text-text">Space creation is not measured by this reading.</p>
          <p className="mt-2 text-meta text-muted">{data.savedDrafts} server-saved builder drafts in {data.windowDays} days are intent, not created or published Spaces. The ordered builder flow below measures visits separately.</p>
        </Tile>
      </TileGrid>
    </DashArea>
  </>
}
