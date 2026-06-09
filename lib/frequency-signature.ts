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
 *  FrequencySignature; `total === 0` is the well-defined empty signature. */
export function computeSignature(input: Partial<Record<PillarKey, number>>): FrequencySignature {
  const counts = normaliseCounts(input)
  const total = PILLAR_KEYS.reduce((sum, k) => sum + counts[k], 0)

  if (total === 0) {
    const zero = { mind: 0, body: 0, spirit: 0, expression: 0 }
    return { counts, total: 0, axes: { ...zero }, shares: { ...zero }, dominant: null, spread: 0, balance: 0 }
  }

  const peak = Math.max(...PILLAR_KEYS.map((k) => counts[k]))
  const axes = {} as Record<PillarKey, number>
  const shares = {} as Record<PillarKey, number>
  for (const k of PILLAR_KEYS) {
    axes[k] = peak > 0 ? counts[k] / peak : 0
    shares[k] = counts[k] / total
  }

  // Dominant = the peak pillar, ties broken by canonical order (Mind→…→Expression).
  let dominant: PillarKey = PILLAR_KEYS[0]
  for (const k of PILLAR_KEYS) {
    if (counts[k] > counts[dominant]) dominant = k
  }

  const spread = PILLAR_KEYS.reduce((n, k) => n + (counts[k] > 0 ? 1 : 0), 0)

  return { counts, total, axes, shares, dominant, spread, balance: evenness(counts, total) }
}
