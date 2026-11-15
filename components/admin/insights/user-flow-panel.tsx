import { DashArea, Tile, TileGrid } from '@/components/admin/dash'
import { StatusChip } from '@/components/admin/status'
import { StatCard } from '@/components/ui/stat-card'
import { ProgressTrack } from '@/components/ui/progress-track'
import { buildUserFlow, type UserFlowInvestigation } from '@/lib/analytics/user-flow'
import type { GrowthSnapshot } from '@/lib/analytics/growth'

/** Aggregate readout only. Every count keeps its population and observation window. */
export function UserFlowPanel({ snapshot }: { snapshot: GrowthSnapshot }) {
  const flow = buildUserFlow(snapshot)
  const firstMature = flow.builderSteps[0]?.matureVisits ?? 0
  const gaps = flow.investigations.filter((item) => item.kind === 'coverage')
  const friction = flow.investigations.filter((item) => item.kind === 'measured-friction')
  const followup = flow.investigations.filter((item) => item.kind === 'weak-signal' || item.kind === 'follow-up')
  return (
    <DashArea label="People, actions and flow blockers" blurb="See the populations we can count, the actions recorded, and the steps worth investigating. This is not a count of people online or a record of individual browsing.">
      <div className="mt-5 space-y-3">
        <h3 className="text-body-sm font-semibold text-text">People and actions</h3>
        <p className="text-meta text-muted">Each card names its own population and window. These groups overlap and must not be added together or divided into a single conversion funnel.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{flow.stages.map((stage) => <div key={stage.key} className="space-y-1.5">
          <StatCard label={stage.label} size={stage.state === 'not-measured' || stage.count === null ? 'sm' : 'md'} value={stage.state === 'not-measured' || stage.count === null ? 'Not measured' : stage.count} detail={`${stage.window} · ${stage.unit}. ${stage.detail}`} />
          <StatusChip size="sm" tone={stage.state === 'observed' ? 'info' : 'neutral'}>{stage.state === 'observed' ? 'Recorded aggregate' : stage.state === 'pending' ? 'Still observing' : 'Measurement unavailable'}</StatusChip>
        </div>)}</div>
      </div>
      <TileGrid>
        <Tile label="Completed follow-up · builder progression" span={2}>
          <p className="text-meta text-muted">These steps follow the same measured cohort with a full seven-day follow-up. A recorded-step difference is not proof of why a person stopped.</p>
          <ol className="mt-4 space-y-4">{flow.builderSteps.map((step, index) => <li key={step.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
              <span className="font-medium text-text">{index + 1}. {step.label}</span>
              <span className="tabular-nums text-text">{step.matureVisits} completed-follow-up visits</span>
            </div>
            {firstMature > 0 && <ProgressTrack className="mt-1.5" value={step.matureVisits} max={firstMature} label={`${step.label}: ${step.matureVisits} of ${firstMature} mature opening visits`} />}
            <p className="mt-1 text-meta text-muted">{step.continuedRate === null ? 'Step-to-step continuation is not measured here.' : `${Math.round(step.continuedRate * 100)}% continued from the previous recorded step.`}{' '}Still observing: {step.pendingVisits} visits at this step.</p>
          </li>)}</ol>
          {flow.builderSteps.length === 0 && <p className="mt-3 text-body-sm text-muted">Ordered builder measurement is unavailable. Resolve the measurement gaps before reading continuation.</p>}
          {flow.builderSteps.length > 0 && firstMature === 0 && <p className="mt-3 text-body-sm text-muted">There is no mature opening cohort yet. Pending visits are not counted as abandonment.</p>}
        </Tile>
        <Tile label="What remains unknown">
          <p className="text-body-sm text-text">No identities or individual browsing histories are shown.</p>
          <ul className="mt-3 list-disc space-y-2 pl-4 text-meta text-muted">{flow.limitations.map((limitation, index) => <li key={`${index}:${limitation}`}>{limitation}</li>)}</ul>
        </Tile>
        <Tile label="Measured flow friction" span={3}>
          <InvestigationList items={friction} empty="No measured step loss meets the investigation threshold. This does not prove the flow has no friction." />
        </Tile>
        <Tile label="Measurement gaps" span={3}>
          <InvestigationList items={gaps} empty="No additional measurement gap was detected in this snapshot. Complete tracking is not established by this alone." />
        </Tile>
        {followup.length > 0 && <Tile label="Still observing and follow-up" span={3}><InvestigationList items={followup} empty="No follow-up notes." /></Tile>}
      </TileGrid>
    </DashArea>
  )
}

function InvestigationList({ items, empty }: { items: UserFlowInvestigation[]; empty: string }) {
  if (items.length === 0) return <p className="text-body-sm text-muted">{empty}</p>
  return <ul className="space-y-4">{items.map((item) => <li key={item.id}>
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip size="sm" tone={item.kind === 'coverage' || item.kind === 'measured-friction' ? 'warning' : 'neutral'}>{item.kind === 'coverage' ? 'Check coverage' : item.kind === 'measured-friction' ? 'Investigate the step' : 'Await or verify evidence'}</StatusChip>
      <h4 className="text-body-sm font-semibold text-text">{item.title}</h4>
    </div>
    <p className="mt-2 text-body-sm text-muted">{item.evidence}</p>
    <p className="mt-1 text-body-sm text-text">{item.guidance}</p>
  </li>)}</ul>
}
