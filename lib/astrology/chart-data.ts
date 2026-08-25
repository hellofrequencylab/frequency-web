// The natal-chart DATA shapes (DEF-HOUS, ADR-1138) — pure, no ephemeris import. Everything
// that READS a stored chart (lib/match/*, ./synastry, the SQL mirror's TS fixtures) imports
// from here, so the astronomy-engine dependency stays confined to ./chart.ts, which only the
// profile-save path loads. See chart.ts for the seam rules; chart.test.ts pins them.

import type { ZodiacSign } from './signs'

/** The bodies a v1 chart carries. Houses/Ascendant need a birth time + place we do not
 *  collect yet, so they are deliberately absent. */
export const CHART_BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const
export type ChartBody = (typeof CHART_BODIES)[number]

export interface ChartPoint {
  /** Geocentric apparent ecliptic longitude, true equinox of date (tropical), degrees [0,360). */
  lon: number
  sign: ZodiacSign
}

/** The stored shape of member_match_prefs.natal_chart. Versioned so a future timed chart
 *  (v2, with houses) can coexist with stored v1 rows. */
export interface NatalChart {
  v: 1
  precision: 'date-only'
  bodies: Record<ChartBody, ChartPoint>
}

const SIGNS_IN_ORDER: ZodiacSign[] = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]

/** The tropical sign for an ecliptic longitude (30-degree slices from 0 Aries). Pure. */
export function signFromLongitude(lon: number): ZodiacSign {
  const norm = ((lon % 360) + 360) % 360
  return SIGNS_IN_ORDER[Math.min(11, Math.floor(norm / 30))]
}

/** Fail-safe read of a stored chart (jsonb from the DB): the v1 shape with finite
 *  longitudes for every body, else null. Never throws on junk. */
export function parseStoredChart(value: unknown): NatalChart | null {
  if (typeof value !== 'object' || value === null) return null
  const c = value as { v?: unknown; precision?: unknown; bodies?: unknown }
  if (c.v !== 1 || c.precision !== 'date-only') return null
  if (typeof c.bodies !== 'object' || c.bodies === null) return null
  const bodies = c.bodies as Record<string, { lon?: unknown; sign?: unknown }>
  for (const b of CHART_BODIES) {
    const p = bodies[b]
    if (!p || typeof p.lon !== 'number' || !Number.isFinite(p.lon)) return null
  }
  return value as NatalChart
}
