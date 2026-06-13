// Density / demand read-model (ADR-151, closes Stage B). Answers PLATFORM-VISION
// §6's question — "where is local community density crossing the threshold that
// justifies a Lab?" — as a product surface, not a slogan. The expansion
// decision-engine that doubles as the grant-funder + for-profit growth story.
//
// Split of concerns (same as marketing-intel → marketing-forecast): the SQL RPC
// `density_by_city` supplies grounded per-city FACTS; the Lab-readiness SCORE,
// stage, and derived signals are computed HERE — deterministic + unit-tested, so
// the expansion call is auditable. Server-only; admin-gated at the page.

import { createAdminClient } from '@/lib/supabase/admin'

/** One city's grounded facts, straight from the RPC. */
export interface DensityCityRow {
  city: string
  circles: number
  active_circles: number
  circle_members: number
  capacity: number
  residents: number
  new_residents_30d: number
  listings: number
}

/** The Lab-readiness ladder. A city climbs it as supply fills and demand grows. */
export type ExpansionStage = 'seed' | 'growing' | 'ready'

export interface DensityPlace extends DensityCityRow {
  /** Circle fill ratio: members ÷ capacity (0 when no circles yet). */
  saturation: number
  /** Residents on the platform not yet reached by a circle — latent demand. */
  unmet: number
  /** Monthly resident growth rate: new residents (30d) ÷ residents. */
  momentum: number
  /** 0–100 Lab-readiness, the ranking key. */
  score: number
  stage: ExpansionStage
  /** Circles are effectively full (≥ CRUNCH) — people are being turned away. */
  capacityCrunch: boolean
}

export interface DensityTotals {
  cities: number
  circles: number
  members: number
  residents: number
  listings: number
}

export interface DensitySignal {
  /** Every city, ranked by readiness score (desc). */
  places: DensityPlace[]
  /** The cities that have crossed the Lab threshold (stage === 'ready'). */
  ready: DensityPlace[]
  totals: DensityTotals
}

// --- The readiness heuristic (deterministic + documented) -------------------
// Weighted blend of three normalized terms: how full the existing circles are
// (supply pressure), how large the local population is (demand), and how fast it
// is arriving (momentum). Tuned so a Lab only reads "ready" when real circles are
// filling AND there's a population behind them — a population with no circles
// caps out at "growing" (seed a circle first, not a building).
export const READY_MEMBERS = 40 // residents at which the demand term maxes out
export const CRUNCH = 0.85 // fill ratio that means people are being turned away
export const READY_SCORE = 70 // score that justifies scouting a third space
export const GROWING_SCORE = 40 // score where momentum is real but pre-Lab
const MOMENTUM_FULL = 0.25 // 25% monthly resident growth maxes the momentum term
const W_SATURATION = 0.45
const W_DEMAND = 0.35
const W_MOMENTUM = 0.2

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

/** Score a single city's facts into a ranked, staged place. Pure + testable. */
export function scorePlace(row: DensityCityRow): DensityPlace {
  const saturation = row.capacity > 0 ? row.circle_members / row.capacity : 0
  const unmet = Math.max(0, row.residents - row.circle_members)
  const momentum = row.residents > 0 ? row.new_residents_30d / row.residents : 0

  const score = Math.round(
    100 *
      (W_SATURATION * clamp01(saturation) +
        W_DEMAND * clamp01(row.residents / READY_MEMBERS) +
        W_MOMENTUM * clamp01(momentum / MOMENTUM_FULL)),
  )
  const stage: ExpansionStage =
    score >= READY_SCORE ? 'ready' : score >= GROWING_SCORE ? 'growing' : 'seed'

  return { ...row, saturation, unmet, momentum, score, stage, capacityCrunch: saturation >= CRUNCH }
}

/** Rank + total a set of city facts. Pure (no I/O) so it's unit-tested directly. */
export function buildDensitySignal(rows: DensityCityRow[]): DensitySignal {
  const places = rows.map(scorePlace).sort((a, b) => b.score - a.score)
  const totals = places.reduce<DensityTotals>(
    (a, p) => ({
      cities: a.cities + 1,
      circles: a.circles + p.circles,
      members: a.members + p.circle_members,
      residents: a.residents + p.residents,
      listings: a.listings + p.listings,
    }),
    { cities: 0, circles: 0, members: 0, residents: 0, listings: 0 },
  )
  return { places, ready: places.filter((p) => p.stage === 'ready'), totals }
}

/** Read the grounded per-city facts and rank them into the expansion signal. The
 *  density_by_city RPC is new, so we call it through an untyped handle until
 *  `supabase gen types` is re-run (repo convention — see lib/marketplace.ts). */
export async function getDensitySignal(): Promise<DensitySignal> {
  const db = createAdminClient()
  const { data } = await db.rpc('density_by_city')
  return buildDensitySignal((data ?? []) as DensityCityRow[])
}
