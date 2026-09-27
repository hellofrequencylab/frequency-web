import { dayInTimeZone, lunarPhaseInstants } from './moon'

// THE SKY ON THE CALENDAR (owner directive 2026-09-27). Every new moon, full moon, equinox and
// solstice, marked on the day it falls on, on every calendar the product draws. Pure: no React, no
// Supabase, no clock.
//
// ── COMPUTED, NEVER TYPED IN ─────────────────────────────────────────────────────────────────────
// These are astronomy, not content. Twenty-five days a year, every year, forever: a table someone
// maintains by hand is a table that is wrong by the time anyone notices, and it would only ever cover
// the years someone bothered to fill in. The moons come from lib/calendar/moon.ts (Meeus ch. 49,
// already in this repo for Vera's `lunar_dates` tool) and the solar quarters from Meeus ch. 27, the
// same book and the same style.
//
// ── MEEUS CHAPTER 27, AND WHAT IT IS GOOD FOR ────────────────────────────────────────────────────
// The mean quarter instant from a quartic in the millennia since 2000 (27.1 / table 27.B for 1000 to
// 3000), corrected by the 24 periodic terms of table 27.C. That lands each instant within about a
// minute of the ephemeris. Dynamical time is reduced to UTC by the same flat delta-T the moon module
// uses, for the same reason: a marker names a DAY, so the only case a minute could change is an
// instant sitting within a minute of local midnight, and then the marker is one day off in a zone
// where the event genuinely straddles midnight.
//
// ── THE DAY IS LOCAL ─────────────────────────────────────────────────────────────────────────────
// A full moon at 11:40 PM in Vista is 2:40 AM the next day in New York, and both are right. So every
// instant is resolved to a calendar day IN A ZONE, and callers that know their Space's zone pass it
// (the calendar grid does). No zone reads as UTC, which is what a mixed-zone calendar can honestly say.

export type SkyMarkerKind =
  | 'new-moon'
  | 'full-moon'
  | 'march-equinox'
  | 'june-solstice'
  | 'september-equinox'
  | 'december-solstice'

export interface SkyMarker {
  kind: SkyMarkerKind
  /** The one character drawn in the day's corner. */
  emoji: string
  /** What a screen reader and a tooltip say. Sentence case, no trailing period. */
  label: string
}

/** The four solar quarters, in the order a year meets them. */
export type SolarQuarter = 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice'

const MARKERS: Record<SkyMarkerKind, { emoji: string; label: string }> = {
  'new-moon': { emoji: '🌑', label: 'New moon' },
  'full-moon': { emoji: '🌕', label: 'Full moon' },
  'march-equinox': { emoji: '🌱', label: 'Spring equinox' },
  'june-solstice': { emoji: '☀️', label: 'Summer solstice' },
  'september-equinox': { emoji: '🍂', label: 'Autumn equinox' },
  'december-solstice': { emoji: '❄️', label: 'Winter solstice' },
}

const JD_UNIX_EPOCH = 2440587.5
const MS_PER_DAY = 86_400_000
/** TT minus UTC, seconds, for the 2020s. Flat, exactly as lib/calendar/moon.ts is and for the same
 *  reason: a day-level answer does not need a table. */
const DELTA_T_SECONDS = 69

const rad = (deg: number) => (deg * Math.PI) / 180
const cos = (deg: number) => Math.cos(rad(deg))

/** Table 27.B: the mean instant of each quarter, as a quartic in millennia from 2000 (years 1000
 *  to 3000). Order: [constant, Y, Y², Y³, Y⁴]. */
const MEAN_QUARTER: Record<SolarQuarter, readonly [number, number, number, number, number]> = {
  'march-equinox': [2451623.80984, 365242.37404, 0.05169, -0.00411, -0.00057],
  'june-solstice': [2451716.56767, 365241.62603, 0.00325, 0.00888, -0.0003],
  'september-equinox': [2451810.21715, 365242.01767, -0.11575, 0.00337, 0.00078],
  'december-solstice': [2451900.05952, 365242.74049, -0.06223, -0.00823, 0.00032],
}

/** Table 27.C: the 24 periodic terms, [A, B, C], B and C in degrees. */
const PERIODIC: readonly (readonly [number, number, number])[] = [
  [485, 324.96, 1934.136],
  [203, 337.23, 32964.467],
  [199, 342.08, 20.186],
  [182, 27.85, 445267.112],
  [156, 73.14, 45036.886],
  [136, 171.52, 22518.443],
  [77, 222.54, 65928.934],
  [74, 296.72, 3034.906],
  [70, 243.58, 9037.513],
  [58, 119.81, 33718.147],
  [52, 297.17, 150.678],
  [50, 21.02, 2281.226],
  [45, 247.54, 29929.562],
  [44, 325.15, 31555.956],
  [29, 60.93, 4443.417],
  [18, 155.12, 67555.328],
  [17, 288.79, 4562.452],
  [16, 198.04, 62894.029],
  [14, 199.76, 31436.921],
  [12, 95.39, 14577.848],
  [12, 287.11, 31931.756],
  [12, 320.81, 34777.259],
  [9, 227.73, 1222.114],
  [8, 15.45, 16859.074],
]

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(ms)
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null
  return ms
}

/**
 * The instant (UTC) of one solar quarter in `year`, as a Date. Meeus 27.1, table 27.B for the mean
 * instant and table 27.C for the periodic correction.
 */
export function solarQuarterInstant(year: number, quarter: SolarQuarter): Date {
  const Y = (year - 2000) / 1000
  const [a, b, c, d, e] = MEAN_QUARTER[quarter]
  const jde0 = a + b * Y + c * Y * Y + d * Y ** 3 + e * Y ** 4
  const T = (jde0 - 2451545.0) / 36525
  const W = 35999.373 * T - 2.47
  const deltaLambda = 1 + 0.0334 * cos(W) + 0.0007 * cos(2 * W)
  let S = 0
  for (const [A, B, C] of PERIODIC) S += A * cos(B + C * T)
  const jde = jde0 + (0.00001 * S) / deltaLambda
  return new Date((jde - JD_UNIX_EPOCH) * MS_PER_DAY - DELTA_T_SECONDS * 1000)
}

/** The marker a kind draws: its emoji and its words. Total. */
export function skyMarker(kind: SkyMarkerKind): SkyMarker {
  return { kind, ...MARKERS[kind] }
}

/** Every marker kind, in the order they are listed in a legend. */
export const SKY_MARKER_KINDS = Object.keys(MARKERS) as SkyMarkerKind[]

/**
 * Every marked day from `fromDay` to `toDay` inclusive, as day key → its markers, resolved in
 * `timeZone` (an unknown or missing zone reads as UTC). A day can carry two: a new moon and an
 * equinox do fall together, and both are drawn rather than one hiding the other.
 *
 * Bad bounds give an empty map, so a caller can hand this straight into a render.
 */
export function skyMarkersForRange(
  fromDay: string,
  toDay: string,
  timeZone = 'UTC',
): Map<string, SkyMarker[]> {
  const out = new Map<string, SkyMarker[]>()
  const from = dayMs(fromDay)
  const to = dayMs(toDay)
  if (from === null || to === null || to < from) return out

  const add = (day: string, kind: SkyMarkerKind) => {
    if (day < fromDay || day > toDay) return
    const list = out.get(day)
    if (list) {
      if (!list.some((m) => m.kind === kind)) list.push(skyMarker(kind))
    } else {
      out.set(day, [skyMarker(kind)])
    }
  }

  for (const phase of ['new', 'full'] as const) {
    for (const at of lunarPhaseInstants(phase, fromDay, toDay)) {
      add(dayInTimeZone(at, timeZone), phase === 'new' ? 'new-moon' : 'full-moon')
    }
  }

  // A year either side of the window, so a December solstice read in a zone behind UTC still lands.
  const firstYear = Number(fromDay.slice(0, 4)) - 1
  const lastYear = Number(toDay.slice(0, 4)) + 1
  for (let year = firstYear; year <= lastYear; year++) {
    for (const quarter of ['march-equinox', 'june-solstice', 'september-equinox', 'december-solstice'] as const) {
      add(dayInTimeZone(solarQuarterInstant(year, quarter), timeZone), quarter)
    }
  }

  return out
}
