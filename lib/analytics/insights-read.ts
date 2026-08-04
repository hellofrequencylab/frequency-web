// The two server reads behind /admin/insights → Experience (Lift 1a + Lift 7b).
//
// Thin by design: each function calls ONE aggregate RPC and hands the rows to the pure
// math in ./journeys.ts and ./vitals-budgets.ts. Nothing here decides anything — the
// funnel definitions and the budgets live in those two files so a design round reads
// them without reading a query.
//
// Server-only (admin client, service role). Both RPCs are granted to service_role only,
// so this module is the only path to them; callers are already behind requireAdmin.
// Both RPCs postdate lib/database.types.ts, so the generated `rpc` overloads do not know
// their names. The METHOD is cast, never the client (ADR-246), and each result is narrowed
// to the row shape the migration's RETURNS TABLE declares. That declaration is the contract
// the migration and this file hold between them.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  JOURNEYS,
  computeJourneyFunnel,
  toFunnelSpec,
  type Journey,
  type JourneyFunnel,
} from './journeys'
import {
  BUDGETED_METRICS,
  budgetClassFor,
  budgetFor,
  scoreVital,
  trendPct,
  worstStatus,
  type BudgetClass,
  type BudgetStatus,
  type BudgetedMetric,
} from './vitals-budgets'

// ── Journeys ────────────────────────────────────────────────────────────────────

interface RawFunnelRow {
  step_index: number
  step_key: string
  identity: string
  subjects: number
  linked: boolean
}

export const JOURNEY_WINDOW_DAYS = 30

type UntypedRpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown }>

/** The admin client stays typed; only its `rpc` method is widened. */
function rpc(): UntypedRpc {
  const db = createAdminClient()
  return db.rpc.bind(db) as unknown as UntypedRpc
}

async function readOne(journey: Journey, windowDays: number): Promise<JourneyFunnel> {
  const { data } = await rpc()('journey_funnel', {
    _journey_key: journey.key,
    _steps: toFunnelSpec(journey),
    _days: windowDays,
  })
  const rows = ((data ?? []) as RawFunnelRow[]).map((r) => ({
    stepKey: r.step_key,
    subjects: Number(r.subjects),
  }))
  return computeJourneyFunnel(journey, rows, windowDays)
}

/** All five funnels. One RPC per journey, in parallel — the walk is sequential inside
 *  the function and cannot be batched without losing the per-journey cohort. */
export async function getJourneyFunnels(
  windowDays = JOURNEY_WINDOW_DAYS,
): Promise<JourneyFunnel[]> {
  return Promise.all(JOURNEYS.map((j) => readOne(j, windowDays)))
}

// ── Vitals ──────────────────────────────────────────────────────────────────────

/** One row as `vitals_p75` returns it. numeric comes back as a string over PostgREST. */
export interface RawVitalRow {
  path: string
  metric: string
  p75: number | string | null
  samples: number
  prev_p75: number | string | null
  prev_samples: number
}

export const VITALS_WINDOW_DAYS = 28

export interface VitalCell {
  metric: BudgetedMetric
  p75: number | null
  samples: number
  budget: number
  status: BudgetStatus
  /** Signed % change vs the previous window of equal length. Positive is worse. */
  trendPct: number | null
}

export interface RouteVitals {
  path: string
  budgetClass: BudgetClass
  /** The worst status across this route's budgeted metrics. */
  status: BudgetStatus
  /** Largest sample count on the route, for sorting by traffic. */
  samples: number
  cells: VitalCell[]
}

export interface VitalsReadout {
  windowDays: number
  routes: RouteVitals[]
  /** Counts by status across every route, for the headline row. */
  tally: Record<BudgetStatus, number>
}

const num = (v: number | string | null): number | null => {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Pure: fold raw RPC rows into the per-route readout. Exported for the panel's tests
 *  and to keep the DB call in this file free of logic. */
export function buildVitalsReadout(
  raw: readonly RawVitalRow[],
  windowDays: number,
): VitalsReadout {
  const byPath = new Map<string, RawVitalRow[]>()
  for (const r of raw) {
    const list = byPath.get(r.path)
    if (list) list.push(r)
    else byPath.set(r.path, [r])
  }

  const routes: RouteVitals[] = [...byPath.entries()].map(([path, rows]) => {
    const budgetClass = budgetClassFor(path)
    const cells: VitalCell[] = BUDGETED_METRICS.map((metric) => {
      const row = rows.find((r) => r.metric === metric)
      const p75 = row ? num(row.p75) : null
      const samples = row ? Number(row.samples) : 0
      const budget = budgetFor(budgetClass, metric)
      return {
        metric,
        p75,
        samples,
        budget,
        status: scoreVital(p75, budget, samples),
        trendPct: trendPct(p75, row ? num(row.prev_p75) : null),
      }
    })
    return {
      path,
      budgetClass,
      status: worstStatus(cells.map((c) => c.status)),
      samples: Math.max(0, ...cells.map((c) => c.samples)),
      cells,
    }
  })

  // Worst first, then busiest: the breach at the top of the page is the one to fix.
  const rank: Record<BudgetStatus, number> = { fail: 0, watch: 1, pass: 2, unknown: 3 }
  routes.sort((a, b) => rank[a.status] - rank[b.status] || b.samples - a.samples)

  const tally: Record<BudgetStatus, number> = { pass: 0, watch: 0, fail: 0, unknown: 0 }
  for (const r of routes) tally[r.status] += 1

  return { windowDays, routes, tally }
}

export async function getVitalsReadout(
  windowDays = VITALS_WINDOW_DAYS,
  viewport: string | null = null,
): Promise<VitalsReadout> {
  const { data } = await rpc()('vitals_p75', {
    _days: windowDays,
    _path_template: null,
    _viewport: viewport,
  })
  return buildVitalsReadout((data ?? []) as RawVitalRow[], windowDays)
}
