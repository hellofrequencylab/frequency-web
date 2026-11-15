import { RowCard } from '@/components/cards/row-card'
import { Suspense } from 'react'
import { Activity } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, GraphTile } from '@/components/admin/dash'
import { WeekBars, RingGauge } from '@/components/admin/spark-charts'
import { StatCard } from '@/components/ui/stat-card'
import { ProgressTrack } from '@/components/ui/progress-track'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { getGrowthReading } from '@/lib/analytics/growth-read'
import { growthExperiments, growthHealth, measuredRate, type GrowthSnapshot } from '@/lib/analytics/growth'
import { LiveRefresh } from './live-refresh'
import { GrowthTools } from './growth-tools'
import { AttendanceComparison, CampaignOutcomeCharts, MemberOutcomeGraphic } from './growth-visuals'
import { StatusChip } from '@/components/admin/status'
import { UserFlowPanel } from './user-flow-panel'
import { CampaignLinkBuilder } from './campaign-link-builder'
import { ExperimentPanel } from './experiment-panel'

export function GrowthTab() {
  return <>
    <Suspense fallback={<TableSkeleton rows={6} cols={4} />}><GrowthContent /></Suspense>
    <AdminSection title="Campaign links" description="Create consistent links for email, partners, printed material and social campaigns."><CampaignLinkBuilder /></AdminSection>
    <Suspense fallback={<TableSkeleton rows={3} cols={3} />}><ExperimentPanel /></Suspense>
  </>
}

export async function GrowthContent() {
  const reading = await getGrowthReading()
  if (reading.state === 'unavailable') return (
    <AdminSection title="Growth reading unavailable">
      <LiveRefresh at={null} />
      <EmptyState icon={Activity} variant="first-use" title="No reliable reading" description={reading.message} />
    </AdminSection>
  )
  const d = reading.data
  const repeat = measuredRate(d.repeatReturned, d.repeatEligible)
  const rsvp = measuredRate(d.rsvpAttended, d.rsvpEligible)
  const experiments = growthExperiments(d)
  const health = growthHealth(d)
  type Campaign = GrowthSnapshot['campaigns'][number]
  const columns: ColumnDef<Campaign>[] = [
    { key: 'campaign', header: 'First-touch campaign', render: (c) => <span className="break-words">{c.campaign}</span> },
    { key: 'source', header: 'Source / medium', render: (c) => `${c.source} / ${c.medium}` },
    { key: 'converting_channel', header: 'Converting channel', render: (c) => c.converting_channel },
    { key: 'signups', header: 'Signups', type: 'number', render: (c) => c.signups },
    { key: 'eligible', header: 'Full 7d follow-up', type: 'number', render: (c) => c.eligible },
    { key: 'pending', header: 'Still observing', type: 'number', render: (c) => c.pending },
    { key: 'activated', header: 'Attended within 7d', type: 'number', render: (c) => {
      const rate = measuredRate(c.activated, c.eligible)
      return `${c.activated} (${rate === null ? 'not measured' : `${Math.round(rate * 100)}%`})`
    } },
  ]
  type LeadCampaign = GrowthSnapshot['leadCampaigns'][number]
  const leadColumns: ColumnDef<LeadCampaign>[] = [
    { key: 'campaign', header: 'First-touch campaign', render: (c) => c.campaign },
    { key: 'source', header: 'Source / medium', render: (c) => `${c.source} / ${c.medium}` },
    { key: 'leads', header: 'Captured leads', type: 'number', render: (c) => c.leads },
    { key: 'linked_members', header: 'Linked to a Member', type: 'number', render: (c) => c.linked_members },
    { key: 'pending', header: 'Still observing', type: 'number', render: (c) => c.pending },
    { key: 'attended', header: 'Attended within 7d', type: 'number', render: (c) => {
      const rate = measuredRate(c.attended, c.eligible)
      return `${c.attended} of ${c.eligible} eligible (${rate === null ? 'not measured' : `${Math.round(rate * 100)}%`})`
    } },
  ]
  const builderStart = d.builder[0]?.visits ?? 0
  return (
    <>
      <AdminSection><LiveRefresh at={d.computedAt} /></AdminSection>
      <AdminSection title="Growth that reaches the room" description="Host-confirmed attendance is the north star. Page views, saved drafts and RSVPs measure intent along the way.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard label="Showing-up Members · 7d" value={d.showingUp} />
          <StatCard label="Previous 7d" value={d.previousShowingUp} />
          <StatCard label="New Members · 30d" value={d.newMembers} />
          <StatCard label="Drafts saved on server · 30d" value={d.savedDrafts} />
          <StatCard label="Guests showing up · 7d" value={d.guestsShowingUp} />
          <StatCard label="Awaiting first attendance · new Members" value={d.newMembers - d.firstAttendanceObserved} />
        </div>
        <AttendanceComparison current={d.showingUp} previous={d.previousShowingUp} />
      </AdminSection>
      <DashArea label="Participation and return" blurb="Each attendance reading counts distinct Members at completed gatherings, confirmed by another host. Windows use gathering completion dates; self check-ins do not count.">
        <TileGrid>
          <GraphTile label="Weekly showing-up Members" caption={`Eight trailing seven-day completion windows, oldest to newest: ${d.weeklyAttendance.join(', ')}.`}>
            <div className="h-32"><WeekBars values={d.weeklyAttendance} height={90} /></div>
          </GraphTile>
          <Tile label="Return within 28 days">
            {repeat === null ? <p className="text-body-sm text-muted">No first-attendance cohort has a complete follow-up yet.</p> : <RingGauge pct={repeat} label="Attended again" sub={`${d.repeatReturned} of ${d.repeatEligible} eligible first attendees`} />}
            <p className="mt-3 text-meta text-muted">First completed, host-confirmed gathering in the 30-day cohort ending 28 days ago. Return windows use gathering completion dates. Recent attendees are still being observed.</p>
          </Tile>
          <Tile label="Measurement health">
            <StatusChip tone={health.state === 'watch' ? 'warning' : health.state === 'good' ? 'success' : 'neutral'}>{health.state === 'watch' ? 'Check measurement' : health.state === 'good' ? 'No detected coverage warnings' : 'Coverage not established'}</StatusChip>
            <p className="text-body-sm text-text">{d.lastEventAt ? 'Latest accepted first-party event' : 'No first-party event has been recorded'}</p>
            {d.lastEventAt && <FreshnessNote at={d.lastEventAt} sla={60} label="Last event" />}
            {health.alerts.length > 0 && <ul className="mt-3 space-y-2">{health.alerts.map((alert) => <li key={alert.id} className="text-meta"><strong className="text-text">{alert.title}.</strong>{' '}<span className="text-muted">{alert.detail}</span></li>)}</ul>}
            <p className="mt-3 text-meta text-muted">A quiet stream can mean low traffic or missing tracking. Consent and staff exclusions affect coverage. This timestamp does not prove every emitter works.</p>
          </Tile>
        </TileGrid>
      </DashArea>
      <UserFlowPanel snapshot={d} />
      <DashArea label="From intent to attendance" blurb="A reservation is intent. The host's mark records attendance. Timing describes completed outcomes, with the still-waiting group shown alongside.">
        <TileGrid>
          <Tile label="RSVP to attendance">
            {rsvp === null ? <p className="text-body-sm text-muted">No eligible Member RSVPs for completed events in this window.</p> : <RingGauge pct={rsvp} label="Host-confirmed attendance" sub={`${d.rsvpAttended} of ${d.rsvpEligible} eligible Member reservations`} />}
            <p className="mt-3 text-meta text-muted">Non-cancelled events ending in the last 30 days. Only going, approved or approval-free Member RSVPs count. Guests and cancelled reservations are excluded. Missing host marks can undercount attendance.</p>
          </Tile>
          <MemberOutcomeGraphic data={d} />
          <Tile label="Time to first completed gathering">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Median hours · observed attendees" value={d.timeToFirstMedianHours === null ? 'Not measured' : Math.round(d.timeToFirstMedianHours)} />
              <StatCard label="90th percentile hours · observed attendees" value={d.timeToFirstP90Hours === null ? 'Not measured' : Math.round(d.timeToFirstP90Hours)} />
            </div>
            <p className="mt-3 text-meta text-muted">{d.firstAttendanceObserved} of {d.newMembers} new Members have a first completed, host-confirmed gathering. {d.newMembers - d.firstAttendanceObserved} are still awaiting an observed first completed gathering. These timing estimates describe attendees only and should not be treated as the whole cohort&apos;s expected waiting time.</p>
          </Tile>
        </TileGrid>
      </DashArea>
      <DashArea label="Builder flow" blurb="Ordered visits from the same anonymous tab key, within seven days of opening the builder. No conversion rate is drawn from anonymous visits to signed-in launches.">
        <TileGrid>
          <Tile label="Create a Space" span={2}>
            <ol className="space-y-3">{d.builder.map((s, i) => {
              const rate = i ? measuredRate(s.visits, d.builder[i - 1].visits) : null
              return <li key={s.i}>
                <div className="flex justify-between gap-3 text-body-sm"><span>{s.label}</span><span className="tabular-nums">{s.visits} visits{rate !== null ? ` · ${Math.round(rate * 100)}% continued` : ''}</span></div>
                <ProgressTrack className="mt-1" value={(measuredRate(s.visits, builderStart) ?? 0) * 100} label={`${s.label}: ${s.visits} ordered visits`} />
              </li>
            })}</ol>
            <p className="mt-4 text-meta text-muted">{d.builderPendingVisits} opening visits are still inside their seven-day follow-up. Completed follow-up: {d.builder[0]?.matureVisits ?? 0} opened, {d.builder.find((s) => s.event_type === 'createspace.lead')?.matureVisits ?? 0} reported a save. Use this mature group when judging abandonment.</p>
          </Tile>
          <Tile label="Recent accepted activity" caption="Last 30 minutes. These are event counts, not concurrent visitors.">
            {d.recentEvents.length ? <ul className="space-y-2 text-body-sm">{d.recentEvents.map((e) => <li key={e.event_type}><RowCard title={<span className="break-all">{e.event_type}</span>} meta={<span className="tabular-nums">{e.events} accepted events</span>} /></li>)}</ul> : <p className="text-body-sm text-muted">No accepted events in this window.</p>}
          </Tile>
        </TileGrid>
      </DashArea>
      <DashArea label="Campaign outcomes at a glance" blurb="Compare signup and captured-lead cohorts separately. The charts rank observed attendance volume and keep still-observing groups visible.">
        <CampaignOutcomeCharts data={d} />
      </DashArea>
      <AdminSection title="Campaigns to first attendance" description="First-touch signup cohorts, with the converting channel alongside. Attendance rates use only Members with a full seven-day follow-up. No cost is inferred without a spend source.">
        <DataTable rows={d.campaigns} columns={columns} getRowId={(c) => JSON.stringify([c.source, c.medium, c.campaign, c.converting_channel])} caption="First-touch campaign outcomes over 30 days." empty={<p className="text-body-sm text-muted">No signup cohort in this window.</p>} />
      </AdminSection>
      <AdminSection title="Captured leads by campaign" description="Server-captured signup leads. A captured address is not yet a qualified lead. Linked Members are shown separately; attendance rates use only leads with a complete seven-day follow-up.">
        <DataTable rows={d.leadCampaigns} columns={leadColumns} getRowId={(c) => JSON.stringify([c.source, c.medium, c.campaign])} caption="Captured lead cohorts over 30 days." empty={<p className="text-body-sm text-muted">No server-captured lead cohort in this window.</p>} />
      </AdminSection>
      <DashArea label="Learn and improve" blurb="Evidence suggests a question to test, not a proven cause. Proposals keep a control and an observation window before any change is promoted.">
        <TileGrid>
          {experiments.map((e) => <Tile key={e.id} label={e.title} span={3}>
            <p className="text-body-sm text-text">{e.evidence}</p>
            <p className="mt-2 text-body-sm text-muted">Hypothesis: {e.hypothesis}</p>
            <p className="mt-2 text-meta text-muted">Measure: {e.primaryMetric} Guardrails: {e.guardrails}</p>
            <p className="mt-2 text-meta text-muted">{e.evaluation}</p>
          </Tile>)}
          {!experiments.length && <Tile span={3}><p className="text-body-sm text-muted">No experiment meets the evidence threshold. Collect a baseline and verify event coverage first.</p></Tile>}
          <Tile span={3}><GrowthTools /></Tile>
        </TileGrid>
      </DashArea>
    </>
  )
}
