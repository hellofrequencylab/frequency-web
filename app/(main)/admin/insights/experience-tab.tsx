import { Suspense } from 'react'
import { Route, Gauge, TriangleAlert } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile } from '@/components/admin/dash'
import { StatCard } from '@/components/ui/stat-card'
import { StatusChip } from '@/components/admin/status'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { FreshnessNote } from '@/components/admin/freshness-note'
import {
  getJourneyFunnels,
  getVitalsReadout,
  JOURNEY_WINDOW_DAYS,
  VITALS_WINDOW_DAYS,
  type RouteVitals,
} from '@/lib/analytics/insights-read'
import { journeyGaps, type JourneyFunnel, type JourneyFunnelStep } from '@/lib/analytics/journeys'
import {
  BUDGET_CLASS_LABEL,
  BUDGET_STATUS_ICON,
  BUDGET_STATUS_LABEL,
  formatVital,
  MIN_SAMPLES,
  VITALS_BUDGETS,
  type BudgetStatus,
} from '@/lib/analytics/vitals-budgets'

// The "Experience" tab of the consolidated Insights suite: the two reads a design round
// needs and nothing else (UX-MATURITY-PLAN Lift 1a + Lift 7b). Both panels live here
// because the plan is explicit that this is ONE insights surface, not two.
//
//   • The five funnels — the journeys that decide the product's fate, walked over the
//     ledger that already exists. No new tracking; the registry (lib/analytics/journeys.ts)
//     only names which existing marker proves which step.
//   • Page speed — field p75 per templated route against the budgets in
//     lib/analytics/vitals-budgets.ts, with the trend against the previous 28 days.
//
// Each panel awaits its own aggregate behind its OWN Suspense boundary, so a slow one
// never blocks the other or the shell (PAGE-FRAMEWORK §5). Server Components throughout.
//
// NAMING: these funnels are an internal analytics concept. "Journey" is a locked product
// noun (a Quest's Mind/Body/Spirit unit) and must not be reused here.

export function ExperienceTab() {
  return (
    <>
      <Suspense fallback={<PanelSkeleton label="The five funnels" />}>
        <FunnelsPanel />
      </Suspense>
      <Suspense fallback={<PanelSkeleton label="Page speed" />}>
        <VitalsPanel />
      </Suspense>
    </>
  )
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <DashArea label={label} blurb="Reading the ledger.">
      <TileGrid>
        <Tile span={3}>
          <TableSkeleton rows={5} />
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Panel 1: the five funnels ───────────────────────────────────────────────────

async function FunnelsPanel() {
  const funnels = await getJourneyFunnels(JOURNEY_WINDOW_DAYS)
  const gaps = journeyGaps()

  return (
    <DashArea
      icon={Route}
      label="The five funnels"
      blurb={`The five paths that decide whether this works. Each step is proved by a marker the ledger already records, so nothing here is new tracking. Counted over the last ${JOURNEY_WINDOW_DAYS} days, in order: a member counts at a step only if they reached the step before it first.`}
      footnote={
        <>
          Defined in <code>lib/analytics/journeys.ts</code>. A step marked{' '}
          <strong>not measured</strong> has no emitter yet, so its zero means nothing has
          been recorded, not that nobody got there.{' '}
          <FreshnessNote at={new Date()} label="Computed" />
        </>
      }
    >
      {gaps.length > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg px-4 py-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <p className="text-sm leading-relaxed text-warning">
            <strong>
              {gaps.length} step{gaps.length > 1 ? 's' : ''} cannot be measured yet.
            </strong>{' '}
            {gaps.map((g) => g.step.label).join(', ')}. Wiring these is the cheapest way to
            make this page tell the truth.
          </p>
        </div>
      )}

      <TileGrid>
        {funnels.map((f) => (
          <Tile key={f.key} label={f.name} span={3} caption={f.question}>
            <FunnelSteps funnel={f} />
          </Tile>
        ))}
      </TileGrid>
    </DashArea>
  )
}

function FunnelSteps({ funnel }: { funnel: JourneyFunnel }) {
  return (
    <ol className="flex flex-col gap-2">
      {funnel.steps.map((s, i) => (
        <li key={s.key}>
          {i > 0 && !s.linkedToPrevious && (
            <p className="mb-2 border-t border-dashed border-border pt-2 text-2xs uppercase tracking-wide text-subtle">
              New count starts here: the steps above and below identify people differently
              and cannot be joined
            </p>
          )}
          <FunnelStepRow step={s} />
        </li>
      ))}
    </ol>
  )
}

function FunnelStepRow({ step }: { step: JourneyFunnelStep }) {
  const measured = step.coverage !== 'unimplemented'
  const width = step.ofStartPct ?? (step.linkedToPrevious ? 0 : 100)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-elevated">
        <div
          className={`absolute inset-y-0 left-0 ${measured ? 'bg-primary/15' : 'bg-transparent'}`}
          style={{ width: `${Math.min(100, Math.max(0, width))}%` }}
          aria-hidden
        />
        <p className="relative truncate px-3 py-2 text-sm text-text">{step.label}</p>
      </div>
      <p className="w-16 shrink-0 text-right text-sm font-bold tabular-nums text-text">
        {measured ? step.subjects.toLocaleString() : '–'}
      </p>
      <p className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
        {measured
          ? step.conversionPct !== null
            ? `${step.conversionPct}% of prior`
            : step.identity === 'session'
              ? 'sessions'
              : 'members'
          : ''}
      </p>
      {!measured && (
        <StatusChip tone="warning" size="sm">
          Not measured
        </StatusChip>
      )}
    </div>
  )
}

// ── Panel 2: page speed ─────────────────────────────────────────────────────────

const CHIP_TONE: Record<BudgetStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pass: 'success',
  watch: 'warning',
  fail: 'danger',
  unknown: 'neutral',
}

async function VitalsPanel() {
  const v = await getVitalsReadout(VITALS_WINDOW_DAYS)

  const columns: ColumnDef<RouteVitals>[] = [
    {
      key: 'path',
      header: 'Route',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-text">{r.path}</p>
          <p className="text-2xs text-subtle">{BUDGET_CLASS_LABEL[r.budgetClass]}</p>
        </div>
      ),
    },
    ...(['LCP', 'INP', 'CLS'] as const).map<ColumnDef<RouteVitals>>((metric) => ({
      key: metric,
      header: metric,
      type: 'number',
      render: (r) => {
        const cell = r.cells.find((c) => c.metric === metric)!
        return (
          <div className="whitespace-nowrap">
            <span className="mr-1" aria-hidden>
              {BUDGET_STATUS_ICON[cell.status]}
            </span>
            <span className="font-semibold tabular-nums text-text">
              {formatVital(metric, cell.p75)}
            </span>
            <span className="sr-only">
              {BUDGET_STATUS_LABEL[cell.status]}, budget {formatVital(metric, cell.budget)}
            </span>
            {cell.trendPct !== null && (
              <span
                className={`ml-1.5 text-2xs tabular-nums ${cell.trendPct > 0 ? 'text-danger' : 'text-success'}`}
              >
                {cell.trendPct > 0 ? '+' : ''}
                {cell.trendPct}%
              </span>
            )}
          </div>
        )
      },
    })),
    {
      key: 'samples',
      header: 'Loads',
      type: 'number',
      render: (r) => <span className="tabular-nums text-muted">{r.samples.toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <StatusChip tone={CHIP_TONE[r.status]} size="sm">
          {BUDGET_STATUS_LABEL[r.status]}
        </StatusChip>
      ),
    },
  ]

  return (
    <DashArea
      icon={Gauge}
      label="Page speed"
      blurb={`Field measurements from real page loads over the last ${VITALS_WINDOW_DAYS} days, at the 75th percentile, against the budget for each kind of surface. The percentage beside a number is the change since the ${VITALS_WINDOW_DAYS} days before that: a plus means the page got slower.`}
      footnote={
        <>
          Budgets live in <code>lib/analytics/vitals-budgets.ts</code>: marketing pages{' '}
          {VITALS_BUDGETS.marketing.lcpMs / 1000}s LCP, the app shell{' '}
          {VITALS_BUDGETS.app.lcpMs / 1000}s, operator consoles {VITALS_BUDGETS.operator.inpMs}ms
          INP. A route with fewer than {MIN_SAMPLES} loads is left unscored rather than
          guessed at. Collected anonymously, never tied to an account.
        </>
      }
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Routes within budget" value={v.tally.pass} icon={Gauge} />
          <StatCard label="Close to the limit" value={v.tally.watch} icon={TriangleAlert} />
          <StatCard label="Over budget" value={v.tally.fail} icon={TriangleAlert} />
          <StatCard label="Too few loads to score" value={v.tally.unknown} icon={Gauge} />
        </div>
      </AdminSection>

      <TileGrid>
        <Tile span={3} caption="Worst first, then busiest. The route at the top is the one to fix.">
          <DataTable
            caption="Page speed at the 75th percentile per route, against budget"
            columns={columns}
            rows={v.routes}
            getRowId={(r) => r.path}
            density="compact"
            empty={
              <EmptyState
                icon={Gauge}
                variant="no-results"
                title="No page-speed data yet"
                description="Measurements arrive as real people load pages. Give it a day of traffic."
              />
            }
          />
        </Tile>
      </TileGrid>
    </DashArea>
  )
}
