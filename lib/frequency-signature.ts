// The Frequency Signature — a member's evolving visual identity, derived purely
// from how their practice spreads across the four Pillars (Mind / Body / Spirit /
// Expression). See docs/JOURNEYS.md §9.2. This module is the PURE compute: it takes
// a per-pillar tally and returns the shape data a visual renders from. No I/O, no
// React, no Supabase — so it's trivially unit-testable and reusable client + server.
//
// The data fetch lives in lib/frequency-signature-data.ts (it tallies practice_logs
// per pillar, then calls computeSignature here). The visual lives in
// components/profile/frequency-signature.tsx.

import { PILLAR_SLUGS, type PillarSlug } from '@/lib/pillars'

/** The signature's axes are exactly the four Pillars. Re-exported as the canonical
 *  key so callers don't reach into lib/pillars for the slug union. */
export type PillarKey = PillarSlug

export const PILLAR_KEYS: readonly PillarKey[] = PILLAR_SLUGS

/** Raw input: how many qualifying acts (practice logs) landed in each Pillar. */
export type PillarCounts = Record<PillarKey, number>

/** Windowed engagement input: the number of DISTINCT practice-days each Pillar has
 *  inside the recent rolling window (see WINDOW_DAYS). This is the signal the shape
 *  GROWS from — and, because old days fall out of the window, the signal it COLLAPSES
 *  toward when a member stops practicing. Computed server-side (the clock read lives in
 *  lib/frequency-signature-data.ts, never in a React render). */
export type PillarWindowDays = Record<PillarKey, number>

/** The rolling window the bloom is measured over, in days. Wide enough that a steady
 *  member's shape is stable day to day, yet short enough that a lapse visibly fades it. */
export const WINDOW_DAYS = 21

/** Distinct active days, per Pillar, that drive a single Pillar's point all the way to
 *  the rim. Bloom is paced so a FULL, round bloom needs ~this many distinct days across
 *  EACH of the four Pillars — on the order of a week-plus of consistent, broad practice
 *  (4 Pillars × {@link TARGET_DAYS_PER_PILLAR} distinct days). Kept deliberately un-fast:
 *  one or two logs nudge the shape; filling it out takes sustained breadth. */
export const TARGET_DAYS_PER_PILLAR = 7

export interface FrequencySignature {
  /** The raw per-pillar tally (echoed back for display / debugging). */
  counts: PillarCounts
  /** Total acts across all pillars. `0` ⇒ the empty signature (no shape yet). */
  total: number
  /** Each axis as a 0..1 share of the *peak* pillar — the radius the visual draws.
   *  Normalised to the max (not the sum) so a balanced practitioner pushes all four
   *  axes outward and a single-pillar practitioner draws a spike. Empty ⇒ all 0. */
  axes: Record<PillarKey, number>
  /** Each axis as a 0..1 share of the *total* — the true proportion (sums to 1). */
  shares: Record<PillarKey, number>
  /** The strongest pillar (ties broken by PILLAR_KEYS order). `null` when empty. */
  dominant: PillarKey | null
  /** How many pillars have been touched at all (≥1 act). 0..4 — the "spread". */
  spread: number
  /** Balance 0..1: how evenly practice is distributed across the four pillars.
   *  1 = perfectly even (all four equal); → 0 = concentrated in one pillar.
   *  Defined as normalised Shannon evenness over the touched distribution; `0` when
   *  empty and `0` for a single touched pillar (a pure spike, no balance). */
  balance: number
  /** Per-Pillar BLOOM 0..1: how far that Pillar's point reaches toward the rim, from
   *  its distinct practice-days in the recent window vs {@link TARGET_DAYS_PER_PILLAR}.
   *  A Pillar at 1 "peaks out" — its point touches the rim and its edges bloom round.
   *  Curved (not linear) so the first day or two move a little and the climb to full
   *  is gentle. Absence of windowed input falls back to a damped read of all-time
   *  share, so the shape still grows for callers that don't pass a window. */
  bloom: Record<PillarKey, number>
  /** Overall FILL 0..1: how full the whole bloom is — the mean of the four blooms.
   *  This is ABSOLUTE progress, not balance: a brand-new member is ~0 (tiny, near the
   *  centre); a member practicing all four Pillars steadily for a week-plus approaches 1
   *  (a full, round bloom). Drops back toward 0 as recent activity ages out of the
   *  window. Drives the shape's size AND the brightness of the glow behind it. */
  fill: number
}

const EMPTY_COUNTS = (): PillarCounts => ({ mind: 0, body: 0, spirit: 0, expression: 0 })

/** Coerce a partial / untrusted tally into a complete, non-negative PillarCounts. */
function normaliseCounts(input: Partial<Record<PillarKey, number>>): PillarCounts {
  const out = EMPTY_COUNTS()
  for (const k of PILLAR_KEYS) {
    const n = input[k]
    out[k] = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return out
}

/** Bloom curve: maps a Pillar's RAW progress ratio (0..1, = distinct window-days /
 *  TARGET_DAYS_PER_PILLAR, already capped) to its 0..1 reach toward the rim. We bend it
 *  with a gentle ease so the first day or two of a Pillar nudge the shape outward a
 *  little while the final stretch to a fully peaked point needs sustained days — i.e. it
 *  blooms eagerly at first then asymptotes, so "full" genuinely takes a week-plus. */
function bloomCurve(ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio))
  // 1 - (1-r)^1.6 : starts with positive slope (early logs move it), flattens near 1.
  return 1 - Math.pow(1 - r, 1.6)
}

/** Coerce a partial / untrusted window tally into complete, non-negative day counts. */
function normaliseWindowDays(
  input: Partial<Record<PillarKey, number>> | undefined,
): PillarWindowDays {
  const out: PillarWindowDays = { mind: 0, body: 0, spirit: 0, expression: 0 }
  if (!input) return out
  for (const k of PILLAR_KEYS) {
    const n = input[k]
    out[k] = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  return out
}

/** Normalised Shannon evenness (Pielou's J) over the touched pillars, in 0..1.
 *  J = H / ln(S) where H = −Σ pᵢ ln pᵢ and S = number of touched pillars.
 *  Returns 0 when fewer than two pillars are touched (no spread ⇒ no balance). */
function evenness(counts: PillarCounts, total: number): number {
  const present = PILLAR_KEYS.map((k) => counts[k]).filter((n) => n > 0)
  const s = present.length
  if (s < 2 || total <= 0) return 0
  let h = 0
  for (const n of present) {
    const p = n / total
    h -= p * Math.log(p)
  }
  return h / Math.log(s)
}

/** Compute a member's Frequency Signature from their per-pillar act tally.
 *  Pure + total: any input (including a fully-empty tally) yields a valid
 *  FrequencySignature; `total === 0` is the well-defined empty signature.
 *
 *  `windowDays` (optional) is the per-Pillar DISTINCT practice-day count inside the
 *  recent rolling window — the engagement signal `bloom`/`fill` grow from and collapse
 *  toward. It is supplied by the server fetch (which owns the clock); when omitted, the
 *  bloom falls back to a damped read of all-time activity so the shape still grows. */
export function computeSignature(
  input: Partial<Record<PillarKey, number>>,
  windowDays?: Partial<Record<PillarKey, number>>,
): FrequencySignature {
  const counts = normaliseCounts(input)
  const total = PILLAR_KEYS.reduce((sum, k) => sum + counts[k], 0)
  const days = normaliseWindowDays(windowDays)
  const haveWindow = windowDays !== undefined

  if (total === 0) {
    const zero = { mind: 0, body: 0, spirit: 0, expression: 0 }
    return {
      counts,
      total: 0,
      axes: { ...zero },
      shares: { ...zero },
      dominant: null,
      spread: 0,
      balance: 0,
      bloom: { ...zero },
      fill: 0,
    }
  }

  const peak = Math.max(...PILLAR_KEYS.map((k) => counts[k]))
  const axes = {} as Record<PillarKey, number>
  const shares = {} as Record<PillarKey, number>
  const bloom = {} as Record<PillarKey, number>
  for (const k of PILLAR_KEYS) {
    axes[k] = peak > 0 ? counts[k] / peak : 0
    shares[k] = counts[k] / total
    // Bloom from the windowed distinct-days vs the per-Pillar target, gently curved.
    // Fallback (no window supplied): a heavily damped read of all-time counts so the
    // shape still grows for callers that haven't wired the window, without ever
    // claiming "full" from raw all-time volume (cap the fallback well under 1).
    if (haveWindow) {
      bloom[k] = bloomCurve(days[k] / TARGET_DAYS_PER_PILLAR)
    } else {
      bloom[k] = Math.min(0.85, bloomCurve(counts[k] / (TARGET_DAYS_PER_PILLAR * 3)))
    }
  }

  // Dominant = the peak pillar, ties broken by canonical order (Mind→…→Expression).
  let dominant: PillarKey = PILLAR_KEYS[0]
  for (const k of PILLAR_KEYS) {
    if (counts[k] > counts[dominant]) dominant = k
  }

  const spread = PILLAR_KEYS.reduce((n, k) => n + (counts[k] > 0 ? 1 : 0), 0)

  // Overall fill = mean bloom across the four Pillars: full ⇒ all four peaked.
  const fill = PILLAR_KEYS.reduce((sum, k) => sum + bloom[k], 0) / PILLAR_KEYS.length

  return {
    counts,
    total,
    axes,
    shares,
    dominant,
    spread,
    balance: evenness(counts, total),
    bloom,
    fill,
  }
}
