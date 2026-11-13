import { RowCard } from '@/components/cards/row-card'
import { DashArea, GraphTile, Tile, TileGrid } from '@/components/admin/dash'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { RankList } from '@/components/admin/rank-list'
import { StatusChip } from '@/components/admin/status'
import { ProgressTrack } from '@/components/ui/progress-track'
import { buttonClasses } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { getGoogleAnalyticsReading } from '@/lib/analytics/google-data-read'
import type { GoogleReport } from '@/lib/analytics/google-data'

const LABELS: Record<string, string> = {
  sessionSource: 'Session source', sessionMedium: 'Session medium', sessionCampaignName: 'Session campaign',
  landingPage: 'Landing page', deviceCategory: 'Device', eventName: 'Event', sessions: 'Sessions',
  engagedSessions: 'Engaged sessions', keyEvents: 'Key events', sessionKeyEventRate: 'Session key-event rate',
  eventCount: 'Recorded actions', purchaseRevenue: 'Purchase revenue (property currency)',
  newVsReturning: 'New or returning', pagePath: 'Page', activeUsers: 'Active users',
  totalUsers: 'Reported users', newUsers: 'New users', screenPageViews: 'Page views',
  userEngagementDuration: 'Engagement seconds',
}
const ACTION_LABELS: Record<string, string> = {
  page_view: 'Page viewed', nav_page_view: 'App route viewed', session_start: 'Session started',
  first_visit: 'First measured visit', user_engagement: 'Engagement signal', scroll: 'Page scroll signal',
  sign_up: 'Account creation event', generate_lead: 'Lead capture event', purchase: 'Purchase event',
  commerce_checkout_started: 'Checkout started', event_rsvp: 'RSVP recorded', circle_joined: 'Circle joined',
  onboarding_induction_completed: 'Induction completed', onboarding_funnel_entered: 'Signup flow opened',
  onboarding_funnel_captured: 'Signup flow address capture reported',
  createspace_view: 'Space builder opened', createspace_name_started: 'Builder name started',
  createspace_accent_picked: 'Builder accent picked', createspace_offer: 'Builder offer step reported',
  createspace_lead: 'Builder save reported', createspace_photos: 'Builder photos step completed',
  createspace_resume: 'Builder resumed', createspace_step_done: 'Builder step completed',
  form_start: 'Form started', form_submit: 'Form submission reported', click: 'Outbound link clicked',
  file_download: 'File download reported', search_performed: 'Search performed', view_search_results: 'Search results viewed',
}
const ROUTING_EVENTS = new Set(['page_view', 'nav_page_view', 'session_start', 'first_visit', 'user_engagement', 'scroll', 'screen_view'])
const populationLabel = (value: string) => value === 'new' ? 'New users' : value === 'returning' ? 'Returning users' : (value === '(not set)' || value === '') ? 'Not classified' : value

export async function GoogleGrowthPanel() {
  const reading = await getGoogleAnalyticsReading()
  if (reading.state === 'unavailable') return (
    <DashArea label="Google acquisition reporting" blurb="Google reports acquisition and consented conversions. First-party attendance remains the operational source of truth.">
      <TileGrid><Tile label="Connection needs attention" span={3}>
        <StatusChip tone={reading.reason === 'not_configured' ? 'neutral' : 'warning'}>Google reading unavailable</StatusChip>
        <p className="mt-3 text-body-sm text-muted">{reading.message}</p>
        <a className={buttonClasses('secondary', 'sm', 'mt-3')} href="https://analytics.google.com/" target="_blank" rel="noreferrer">Open Google Analytics</a>
      </Tile></TileGrid>
    </DashArea>
  )
  const acquisition = reading.reports.find((r) => r.id === 'acquisition')
  const conversions = reading.reports.find((r) => r.id === 'conversions')
  const audience = reading.reports.find((r) => r.id === 'audience_summary')?.rows[0]?.metrics
  const populations = reading.reports.find((r) => r.id === 'user_populations')?.rows ?? []
  const actions = (reading.reports.find((r) => r.id === 'actions')?.rows ?? []).filter((r) => !ROUTING_EVENTS.has(r.dimensions.eventName)).slice(0, 8)
  const maxPopulation = Math.max(1, ...populations.map((r) => r.metrics.activeUsers))
  const maxActions = Math.max(1, ...actions.map((r) => r.metrics.eventCount))
  const topSources = acquisition?.rows.slice(0, 6) ?? []
  const maxSessions = Math.max(1, ...topSources.map((r) => r.metrics.sessions))
  const conversionCounts = new Map<string, number>()
  for (const row of conversions?.rows ?? []) {
    const event = row.dimensions.eventName
    conversionCounts.set(event, (conversionCounts.get(event) ?? 0) + row.metrics.eventCount)
  }
  const warnings = [...new Set(reading.reports.flatMap((r) => r.warnings))]
  return (
    <DashArea label="Google acquisition reporting" blurb={`Property ${reading.propertyId} · ${reading.hostname} · trailing 30 days through yesterday. Google processing and connector caching differ from the live first-party reading.`} footnote={<FreshnessNote at={reading.computedAt} sla={15} label="Google fetched" />}>
      <TileGrid>
        {audience && <Tile label="Reported audience in this period" span={3}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Reported users" value={audience.totalUsers} />
            <StatCard label="Active users" value={audience.activeUsers} />
            <StatCard label="New users" value={audience.newUsers} />
            <StatCard label="Sessions" value={audience.sessions} />
          </div>
          <p className="mt-3 text-meta text-muted">{audience.engagedSessions.toLocaleString()} engaged sessions · {audience.eventCount.toLocaleString()} recorded events. Google identities are not verified unique people; these totals are separate from overlapping page and event rows.</p>
        </Tile>}
        <GraphTile label="New and returning activity" caption="Active users in each measured population. The same user can be new and returning within this period; do not add the rows as a unique-user total.">
          {populations.length ? <ol className="space-y-4">{populations.map((row) => <li key={row.dimensions.newVsReturning}>
            <div className="flex justify-between gap-2 text-body-sm"><span>{populationLabel(row.dimensions.newVsReturning)}</span><strong>{row.metrics.activeUsers.toLocaleString()} active users</strong></div>
            <ProgressTrack className="mt-1.5" value={row.metrics.activeUsers} max={maxPopulation} label={`${populationLabel(row.dimensions.newVsReturning)}: ${row.metrics.activeUsers} active users`} />
            <p className="mt-1 text-meta text-muted">{row.metrics.sessions.toLocaleString()} sessions · {row.metrics.engagedSessions.toLocaleString()} engaged sessions</p>
          </li>)}</ol> : <p className="text-body-sm text-muted">No population rows were reported.</p>}
        </GraphTile>
        <GraphTile label="Recorded actions beyond navigation" span={2} caption="Top recorded event types, excluding routine routing, session and scroll signals. Events repeat; users overlap between action types. These are not conversions or an ordered flow.">
          {actions.length ? <ol className="space-y-4">{actions.map((row) => {
            const label = ACTION_LABELS[row.dimensions.eventName] ?? row.dimensions.eventName
            return <li key={row.dimensions.eventName}>
              <div className="flex justify-between gap-2 text-body-sm"><span>{label}</span><strong>{row.metrics.eventCount.toLocaleString()} events</strong></div>
              <ProgressTrack className="mt-1.5" value={row.metrics.eventCount} max={maxActions} label={`${label}: ${row.metrics.eventCount} events`} />
              <p className="mt-1 text-meta text-muted">{row.metrics.totalUsers.toLocaleString()} users recorded for this event type</p>
            </li>
          })}</ol> : <p className="text-body-sm text-muted">No action events beyond routine navigation were reported. This can reflect missing instrumentation, not an absence of real actions.</p>}
        </GraphTile>
        <GraphTile label="Where reported sessions arrive from" span={2} caption="Top six rows returned by Google, ranked by sessions. Source, medium and campaign share one row; these are session-scoped acquisition figures.">
          {topSources.length ? <ol className="space-y-4">{topSources.map((row) => {
            const name = `${row.dimensions.sessionSource} / ${row.dimensions.sessionMedium} · ${row.dimensions.sessionCampaignName}`
            return <li key={JSON.stringify(row.dimensions)}>
              <RowCard
                title={<span className="break-words">{name}</span>}
                badge={<span className="tabular-nums">{row.metrics.sessions.toLocaleString()} sessions</span>}
                context={`${row.metrics.engagedSessions.toLocaleString()} engaged sessions · ${(row.metrics.sessionKeyEventRate * 100).toFixed(1)}% session key-event rate`}
                footer={<ProgressTrack value={row.metrics.sessions} max={maxSessions} label={`${name}: ${row.metrics.sessions} sessions`} />}
              />
            </li>
          })}</ol> : <p className="text-body-sm text-muted">No acquisition rows were reported for this hostname and period.</p>}
        </GraphTile>
        <Tile label="Reported conversion events" caption="Counts across returned campaign rows. These are events, not unique leads, customers or attendance.">
          <RankList items={[...conversionCounts].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n)} empty="No conversion-event rows reported in this period." />
          <a className={buttonClasses('ghost', 'sm', 'mt-3')} href="https://analytics.google.com/" target="_blank" rel="noreferrer">Inspect the Google property</a>
        </Tile>
        {warnings.length > 0 && <Tile label="Reporting coverage" span={3}><ul className="space-y-2 text-meta text-muted">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Tile>}
        <Tile label="Report detail" span={3}>
          <div className="space-y-4">{reading.reports.map((report) => <GoogleReportTable key={report.id} report={report} />)}</div>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

function GoogleReportTable({ report }: { report: GoogleReport }) {
  type Row = GoogleReport['rows'][number]
  const columns: ColumnDef<Row>[] = [
    ...report.dimensions.map((key) => ({ key, header: LABELS[key] ?? key, render: (row: Row) => <span className="break-words">{key === 'eventName' ? ACTION_LABELS[row.dimensions[key]] ?? row.dimensions[key] : key === 'newVsReturning' ? populationLabel(row.dimensions[key]) : row.dimensions[key]}</span> })),
    ...report.metrics.map((key) => ({ key, header: LABELS[key] ?? key, type: 'number' as const, render: (row: Row) => key.endsWith('Rate') ? `${(row.metrics[key] * 100).toFixed(1)}%` : row.metrics[key].toLocaleString(undefined, { maximumFractionDigits: 2 }) })),
  ]
  return (
    <details>
      <summary className="cursor-pointer text-body-sm font-semibold text-text">{report.label} · {report.rows.length} returned rows{report.rowCount > report.rows.length ? ` of ${report.rowCount.toLocaleString()}` : ''}</summary>
      <div className="mt-3"><DataTable rows={report.rows} columns={columns} getRowId={(row) => JSON.stringify(row.dimensions)} caption={`${report.label}, Google acquisition reporting.`} empty={<p className="text-body-sm text-muted">No rows reported for this hostname and period.</p>} /></div>
    </details>
  )
}
