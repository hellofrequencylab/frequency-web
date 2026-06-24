// The backtest harness (Resonance Engine Phase 3 · ADR-384 · docs/NEXT-GEN-CRM.md "Score
// trustworthiness"). Given a member's PAST churn_risk prediction and what ACTUALLY happened (did they
// go dormant?), it scores how well the prediction held up: a hit-rate + a simple per-band calibration
// table, so an operator can see whether to trust the scores. Recomputed quarterly against actuals.
//
// Two halves, deliberately split (the testability law):
//   • PURE math (`backtestChurn`, `hitRate`, `calibrationByBand`) — no IO. Given an array of
//     { predicted churn_risk, actual dormant } samples, computes the trustworthiness stats. Fully
//     unit-tested (a calibrated model scores high; a noisy one scores low; an empty set is honest).
//   • IO (`runChurnBacktest`) — assembles samples from member_traits history (the predicted band) +
//     actual dormancy (a later lifecycle/last_active read), FAIL-SAFE: any error yields the empty
//     report, so a missing history never crashes the cockpit; the function is the seam, the surface
//     reads it cheaply or just shows "not enough history yet".
//
// authz-delegated: this is a READ helper (no mutation). The gate lives at the staff-gated platform
// cockpit that calls it.

import type { ChurnRisk } from '@/lib/traits/compute'

/** One backtest sample: what the model PREDICTED, and what ACTUALLY happened. */
export interface ChurnSample {
  /** The churn_risk band the model assigned at prediction time. */
  predicted: ChurnRisk
  /** Did the member ACTUALLY go dormant over the lookahead window? The ground truth. */
  dormant: boolean
}

/** Per-band calibration: of the members the model put in this band, what FRACTION actually went
 *  dormant? A well-calibrated model has high -> ~1, low -> ~0. */
export interface BandCalibration {
  band: ChurnRisk
  /** Members the model assigned to this band. */
  count: number
  /** Fraction of them that actually went dormant, 0..1 (0 when count is 0). */
  actualDormantRate: number
}

/** The full backtest report: the headline hit-rate + the per-band calibration + a plain verdict. */
export interface BacktestReport {
  /** Total samples scored. */
  samples: number
  /** Hit-rate: the fraction of samples where the prediction matched reality (high/medium predicted
   *  dormancy correctly, low predicted retention correctly), 0..1. */
  hitRate: number
  /** The per-band calibration table (low, medium, high). */
  calibration: BandCalibration[]
  /** A plain, surface-ready trustworthiness verdict (no dashes). */
  verdict: string
  /** Whether there was enough history to say anything (samples >= MIN_SAMPLES). */
  trustworthy: boolean
}

/** A churn band counts as a "predicted dormant" call when it is medium or high; low predicts staying. */
function predictsDormant(band: ChurnRisk): boolean {
  return band === 'high' || band === 'medium'
}

/** The minimum samples before the backtest will offer a verdict (a tiny set says nothing). */
export const BACKTEST_MIN_SAMPLES = 20

const BANDS: readonly ChurnRisk[] = ['low', 'medium', 'high']

export const EMPTY_BACKTEST: BacktestReport = {
  samples: 0,
  hitRate: 0,
  calibration: BANDS.map((band) => ({ band, count: 0, actualDormantRate: 0 })),
  verdict: 'Not enough history yet to judge the scores. Come back after a few cycles.',
  trustworthy: false,
}

/** The hit-rate over the samples: fraction where the predicted direction matched reality. PURE.
 *  0 for an empty set (an honest "nothing to say", not a fake 1). */
export function hitRate(samples: ChurnSample[]): number {
  if (!samples.length) return 0
  let hits = 0
  for (const s of samples) {
    if (predictsDormant(s.predicted) === s.dormant) hits += 1
  }
  return hits / samples.length
}

/** The per-band calibration table. PURE. For each band, the fraction of members assigned there that
 *  actually went dormant. A calibrated model: low ~0, high ~1. */
export function calibrationByBand(samples: ChurnSample[]): BandCalibration[] {
  return BANDS.map((band) => {
    const inBand = samples.filter((s) => s.predicted === band)
    const dormant = inBand.filter((s) => s.dormant).length
    return {
      band,
      count: inBand.length,
      actualDormantRate: inBand.length ? dormant / inBand.length : 0,
    }
  })
}

/**
 * The full backtest report from a set of samples. PURE + deterministic. Below BACKTEST_MIN_SAMPLES it
 * returns the honest "not enough history" report rather than over-claiming on a thin sample. The
 * verdict reads the hit-rate: strong (>= 0.75), fair (>= 0.6), or weak (below).
 */
export function backtestChurn(samples: ChurnSample[]): BacktestReport {
  if (!samples.length || samples.length < BACKTEST_MIN_SAMPLES) {
    return { ...EMPTY_BACKTEST, samples: samples.length }
  }
  const rate = hitRate(samples)
  const calibration = calibrationByBand(samples)
  const verdict =
    rate >= 0.75
      ? `The scores held up well. They called it right ${Math.round(rate * 100)} percent of the time.`
      : rate >= 0.6
        ? `The scores are fair. They called it right ${Math.round(rate * 100)} percent of the time.`
        : `The scores are shaky. They called it right only ${Math.round(rate * 100)} percent of the time. Lean on judgment for now.`
  return { samples: samples.length, hitRate: rate, calibration, verdict, trustworthy: true }
}

// ── IO: assemble samples from history (fail-safe read) ───────────────────────────
// The read joins the predicted churn band (from a member_traits snapshot at prediction time) with the
// actual outcome (dormancy over the lookahead window). The minimal v1 reads the current churn_risk
// trait as the prediction and the current lifecycle_stage as the outcome (dormant === actually
// dormant), which is a coarse same-window proxy until a snapshot history table lands; the SHAPE is
// ready for a real point-in-time history join behind the same function.

import { createAdminClient } from '@/lib/supabase/admin'

type TraitRow = { profile_id: string; trait_key: string; value_text: string | null }

const CHURN_VALUES: readonly ChurnRisk[] = ['low', 'medium', 'high']
function asChurn(v: string | null): ChurnRisk | null {
  return v && (CHURN_VALUES as readonly string[]).includes(v) ? (v as ChurnRisk) : null
}

/**
 * Run the churn backtest over the current member_traits, pairing each member's predicted churn_risk
 * with whether their lifecycle_stage actually reads dormant. FAIL-SAFE: any error (a missing table,
 * an RLS hiccup) returns the empty report, so the cockpit degrades to "not enough history yet" rather
 * than crashing. The caller (the staff-gated platform cockpit) is the authority.
 */
export async function runChurnBacktest(): Promise<BacktestReport> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('member_traits')
      .select('profile_id, trait_key, value_text')
      .in('trait_key', ['churn_risk', 'lifecycle_stage'])
    if (error || !data) return EMPTY_BACKTEST

    const byMember = new Map<string, { predicted?: ChurnRisk; dormant?: boolean }>()
    for (const r of data as TraitRow[]) {
      const slot = byMember.get(r.profile_id) ?? {}
      if (r.trait_key === 'churn_risk') slot.predicted = asChurn(r.value_text) ?? slot.predicted
      else if (r.trait_key === 'lifecycle_stage') slot.dormant = r.value_text === 'dormant'
      byMember.set(r.profile_id, slot)
    }

    const samples: ChurnSample[] = []
    for (const s of byMember.values()) {
      if (!s.predicted) continue
      samples.push({ predicted: s.predicted, dormant: s.dormant === true })
    }
    return backtestChurn(samples)
  } catch {
    return EMPTY_BACKTEST
  }
}
