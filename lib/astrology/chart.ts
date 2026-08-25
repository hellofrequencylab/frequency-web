// Natal-chart COMPUTATION (DEF-HOUS, ADR-1138). Charts are computed by an IN-PROCESS JS
// ephemeris (astronomy-engine: pure JS, zero dependencies, no native module, no WASM,
// 1.8 MB installed), server-side AT SAVE TIME, and STORED on member_match_prefs.natal_chart.
// Matching reads the stored chart; nothing ever computes a chart per-request. Owner ruling
// 2026-08-25; no external astrology API.
//
// 🔴 IMPORT SEAM (build-budget, DEPLOY-SAFETY): this file is the ONLY module that may import
// 'astronomy-engine', and this file may only be imported from the profile-save path
// (app/(main)/settings/connections/match-actions.ts) and tests. Never from a root layout, a
// shared server module, or anything reachable from the app shell — anything reachable from a
// shared module is multiplied by every route beneath it. chart.test.ts pins both directions
// of this seam. The data shapes live in ./chart-data and pairwise compatibility in
// ./synastry (pure math) plus the SQL mirror public.housing_natal_compat, so READERS of
// stored charts never pull the ephemeris.
//
// PRECISION, stated honestly: we collect a birth DATE only, so the chart is computed at
// 12:00 UTC on that date and marked precision 'date-only'. The Sun and the slower bodies are
// solid at that precision; the Moon moves ~13 degrees a day, so its longitude is a midpoint
// estimate and its sign can be off on the roughly one day in three when the Moon changes
// sign. That is acceptable for a quiet 5% matching signal and is recorded on the chart so a
// future timed chart (birth_data reserves time + place for it) can supersede it cleanly.

import { Body, Ecliptic, EclipticGeoMoon, GeoVector, SunPosition } from 'astronomy-engine'
import { signFromLongitude, type ChartPoint, type NatalChart } from './chart-data'

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Compute a date-only natal chart for a 'YYYY-MM-DD' birth date. Deterministic: the same
 * date always yields the same chart, so re-saving is idempotent. Returns null on any
 * malformed or impossible date, or if the ephemeris throws — the caller stores null and
 * matching falls back to the sun-sign signal, never an error.
 */
export function computeNatalChart(birth: { date: string | null | undefined }): NatalChart | null {
  const raw = (birth.date ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // Reject impossible dates (2000-02-30 silently rolls over in Date.UTC; round-trip check).
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null

  try {
    const point = (lon: number): ChartPoint => ({ lon: round3(((lon % 360) + 360) % 360), sign: signFromLongitude(lon) })
    const planet = (b: Body): ChartPoint => point(Ecliptic(GeoVector(b, dt, true)).elon)
    return {
      v: 1,
      precision: 'date-only',
      bodies: {
        sun: point(SunPosition(dt).elon),
        moon: point(EclipticGeoMoon(dt).lon),
        mercury: planet(Body.Mercury),
        venus: planet(Body.Venus),
        mars: planet(Body.Mars),
        jupiter: planet(Body.Jupiter),
        saturn: planet(Body.Saturn),
      },
    }
  } catch {
    return null
  }
}
