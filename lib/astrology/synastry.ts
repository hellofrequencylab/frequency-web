// Chart-to-chart compatibility (DEF-HOUS, ADR-1138). Pure math over two STORED natal
// charts — no ephemeris import, so matching surfaces can use it without pulling
// astronomy-engine into their bundles (see ./chart.ts for the seam).
//
// 🔴 SQL MIRROR: public.housing_natal_compat + public.housing_aspect_score (migration
// 20270326000000) mirror this file EXACTLY — same aspect table, same 8-degree orb, same
// linear falloff, same body pairs and weights — the same discipline signs.ts already keeps
// with housing_astro_compat. Change one and you must change the other in the same PR;
// synastry.test.ts carries the shared fixture vectors both sides must reproduce.
//
// The model, kept deliberately small and never a verdict: classic synastry aspects between
// a handful of body pairs. An aspect's score peaks at the exact angle and decays linearly
// to the neutral 0.5 at the edge of an 8-degree orb; separations holding no aspect are
// neutral. Trines flow, sextiles help, conjunctions are strong but intense, squares and
// oppositions carry friction (still not zero — friction is not incompatibility).

import type { ChartBody, NatalChart } from './chart-data'

/** Major aspects: exact angle -> score at exactness. Angles are >= 60 apart and the orb is
 *  8, so at most one aspect can match a separation — first match is the only match. */
const ASPECTS: { angle: number; score: number }[] = [
  { angle: 0, score: 0.9 },
  { angle: 60, score: 0.8 },
  { angle: 90, score: 0.45 },
  { angle: 120, score: 1.0 },
  { angle: 180, score: 0.55 },
]

const ORB = 8

/** Score the angular separation of two ecliptic longitudes (degrees). Pure, in [0,1]. */
export function aspectScore(lonA: number, lonB: number): number {
  let sep = Math.abs(lonA - lonB) % 360
  if (sep > 180) sep = 360 - sep
  for (const a of ASPECTS) {
    const dist = Math.abs(sep - a.angle)
    if (dist <= ORB) return 0.5 + (a.score - 0.5) * (1 - dist / ORB)
  }
  return 0.5
}

/** The pairs that make up the blend, weights summing to 1. Directional pairs appear both
 *  ways so the blend is symmetric: chartCompatibility(a, b) === chartCompatibility(b, a). */
const PAIRS: [ChartBody, ChartBody, number][] = [
  ['sun', 'sun', 0.25],
  ['moon', 'moon', 0.2],
  ['sun', 'moon', 0.1],
  ['moon', 'sun', 0.1],
  ['venus', 'mars', 0.1],
  ['mars', 'venus', 0.1],
  ['mercury', 'mercury', 0.15],
]

/** Copy for the strongest thread, in the same quiet register as signs.ts reasons. */
const PAIR_REASON: Record<string, string> = {
  'sun:sun': 'your Suns sit at an easy angle',
  'moon:moon': 'your Moons sit at an easy angle',
  'sun:moon': 'Sun and Moon line up across your charts',
  'moon:sun': 'Sun and Moon line up across your charts',
  'venus:mars': 'Venus and Mars line up across your charts',
  'mars:venus': 'Venus and Mars line up across your charts',
  'mercury:mercury': 'your Mercuries sit at an easy angle',
}

export interface ChartCompatibility {
  score: number // 0..1
  /** A short, plain, never-overstated reason. */
  reason: string
}

/** Weighted synastry blend of two charts. Pure, deterministic, symmetric, in [0,1]. */
export function chartCompatibility(a: NatalChart, b: NatalChart): ChartCompatibility {
  let score = 0
  let best: { key: string; s: number } | null = null
  for (const [ba, bb, w] of PAIRS) {
    const s = aspectScore(a.bodies[ba].lon, b.bodies[bb].lon)
    score += w * s
    if (!best || s > best.s) best = { key: `${ba}:${bb}`, s }
  }
  score = Math.max(0, Math.min(1, score))
  const reason = best && best.s >= 0.6 ? PAIR_REASON[best.key] : 'a spicier chart mix'
  return { score, reason }
}
