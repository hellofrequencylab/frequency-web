import { readGrowthExperiments } from '@/app/(main)/admin/insights/experiment-actions'
import { EXPERIMENT_CATALOG, evaluateExperiment } from '@/lib/analytics/experiments'
import { DashArea, TileGrid, Tile } from '@/components/admin/dash'
import { RingGauge } from '@/components/admin/spark-charts'
import { ExperimentControls } from './experiment-controls'

export async function ExperimentPanel() {
  const read = await readGrowthExperiments()
  if (read.state === 'unavailable') return <DashArea label="Experiments unavailable" blurb="Experiment storage could not be read. Check database access and the reviewed experiment migration.">{null}</DashArea>
  const key = 'upcoming-next-step' as const
  const spec = EXPERIMENT_CATALOG[key]
  const result = read.rows.find((r) => r.key === key)
  const evaluation = result ? evaluateExperiment(result) : null
  return <DashArea label="Controlled improvements" blurb="A fixed, reviewed heading pilot with a control. No model can write a variant, change booking behavior, or promote it automatically.">
    <TileGrid>
      <Tile label={spec.title} span={3}>
        <p className="text-body-sm text-text">{spec.hypothesis}</p>
        <p className="mt-2 text-meta text-muted">Control: {spec.control}. Treatment: {spec.treatment}. Audience: signed-in Members allowed by browser and account analytics settings, excluding staff. Only headings visible in a foreground tab create exposures.</p>
        <p className="mt-2 text-meta text-muted">Target: {spec.targetPerArm} mature exposures per arm, a fixed {spec.minimumDays}-day enrollment horizon, then {spec.conversionDays} days of follow-up. This is a pilot target, not a statistical power guarantee. Primary outcome: a server-confirmed RSVP within seven days of exposure.</p>
        <p className="mt-2 text-meta text-muted">Guardrails: {spec.guardrails}</p>
        <p className="mt-2 text-body-sm text-text">State: {result?.status ?? 'not drafted'}. {evaluation?.explanation ?? 'No experiment is running. A draft does not change the member experience.'}</p>
      </Tile>
      {result && (['control','treatment'] as const).map((variant) => {
        const arm = result[variant]
        return <Tile key={variant} label={variant === 'control' ? 'Control' : 'Treatment'}>
          {arm.eligible > 0 ? <RingGauge pct={arm.converted / arm.eligible} label="RSVP within seven days" sub={`${arm.converted} of ${arm.eligible} mature exposures`} /> : <p className="text-body-sm text-muted">No exposure has a complete seven-day follow-up.</p>}
          <p className="mt-2 text-meta text-muted">{arm.exposed} exposed memberships retained. {arm.pending} still being observed. {arm.excluded} exposed memberships removed after assignment; exclusions prevent a winner claim.</p>
        </Tile>
      })}
      {read.canWrite && <Tile span={3}><ExperimentControls experimentKey={key} status={result?.status ?? 'missing'} /></Tile>}
    </TileGrid>
  </DashArea>
}
