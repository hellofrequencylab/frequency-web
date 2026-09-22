// LUNAR PHASES, computed, never guessed (PROG-CAL10). Pure: no I/O, no dependency.
//
// Meeus, "Astronomical Algorithms" (2nd ed.), chapter 49: the mean phase from the lunation number
// k, plus the principal periodic corrections (the solar and lunar anomaly series, the planetary
// arguments A1 to A14). That lands each instant within a few minutes of the ephemeris, which is more
// than a calendar day needs. Dynamical time is corrected to UTC by a flat delta-T (about 69 seconds
// in 2026), which only matters when an instant sits within a minute or two of local midnight.
//
// Why this exists: "every new moon this winter" is a phrase a model can parse but must never
// estimate. The dates are computed here, and lib/ai/vera-calendar.ts hands them to the model as a
// tool result, so a proposal is built on arithmetic rather than recollection.

export type LunarPhase = 'new' | 'full'

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const SYNODIC_MONTH_DAYS = 29.530588861
const JD_UNIX_EPOCH = 2440587.5
const MS_PER_DAY = 86_400_000
/** TT minus UTC, seconds, for the 2020s. Flat on purpose: a day-level answer does not need a table. */
const DELTA_T_SECONDS = 69

const rad = (deg: number) => (deg * Math.PI) / 180
const sin = (deg: number) => Math.sin(rad(deg))

/** The instant (UTC) of the phase at lunation number k (an integer for a new moon, k + 0.5 for a
 *  full moon), as a Date. Meeus 49.1 to 49.3 and tables 49.A and 49.B. */
export function lunarPhaseInstant(k: number): Date {
  const T = k / 1236.85
  const T2 = T * T
  const T3 = T2 * T
  const T4 = T3 * T
  // Mean phase (49.1), in Julian Ephemeris Days.
  const jde =
    2451550.09766 + SYNODIC_MONTH_DAYS * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4
  const E = 1 - 0.002516 * T - 0.0000074 * T2
  // The four arguments, in degrees (49.4 to 49.7).
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3
  const Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4
  const F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4
  const O = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3

  const isNew = Math.abs(k - Math.round(k)) < 0.25
  // Table 49.A (new moon) and 49.B (full moon) share every term but the first six coefficients.
  const c = isNew
    ? [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208]
    : [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209]
  let corr =
    c[0] * sin(Mp) +
    c[1] * E * sin(M) +
    c[2] * sin(2 * Mp) +
    c[3] * sin(2 * F) +
    c[4] * E * sin(Mp - M) +
    c[5] * E * sin(Mp + M) +
    c[6] * E * E * sin(2 * M) -
    0.00111 * sin(Mp - 2 * F) -
    0.00057 * sin(Mp + 2 * F) +
    0.00056 * E * sin(2 * Mp + M) -
    0.00042 * sin(3 * Mp) +
    0.00042 * E * sin(M + 2 * F) +
    0.00038 * E * sin(M - 2 * F) -
    0.00024 * E * sin(2 * Mp - M) -
    0.00017 * sin(O) -
    0.00007 * sin(Mp + 2 * M) +
    0.00004 * sin(2 * Mp - 2 * F) +
    0.00004 * sin(3 * M) +
    0.00003 * sin(Mp + M - 2 * F) +
    0.00003 * sin(2 * Mp + 2 * F) -
    0.00003 * sin(Mp + M + 2 * F) +
    0.00003 * sin(Mp - M + 2 * F) -
    0.00002 * sin(Mp - M - 2 * F) -
    0.00002 * sin(3 * Mp + M) +
    0.00002 * sin(4 * Mp)

  // The planetary arguments (49.8) and their additional corrections.
  const A = [
    299.77 + 0.107408 * k - 0.009173 * T2,
    251.88 + 0.016321 * k,
    251.83 + 26.651886 * k,
    349.42 + 36.412478 * k,
    84.66 + 18.206239 * k,
    141.74 + 53.303771 * k,
    207.14 + 2.453732 * k,
    154.84 + 7.30686 * k,
    34.52 + 27.261239 * k,
    207.19 + 0.121824 * k,
    291.34 + 1.844379 * k,
    161.72 + 24.198154 * k,
    239.56 + 25.513099 * k,
    331.55 + 3.592518 * k,
  ]
  const Ac = [0.000325, 0.000165, 0.000164, 0.000126, 0.00011, 0.000062, 0.00006, 0.000056, 0.000047, 0.000042, 0.00004, 0.000037, 0.000035, 0.000023]
  for (let i = 0; i < A.length; i++) corr += Ac[i] * sin(A[i])

  const jdUtc = jde + corr - DELTA_T_SECONDS / 86_400
  return new Date(Math.round((jdUtc - JD_UNIX_EPOCH) * MS_PER_DAY))
}

function dayMs(day: string): number | null {
  const m = DAY_RE.exec(day)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(ms)
  if (back.getUTCMonth() !== Number(m[2]) - 1 || back.getUTCDate() !== Number(m[3])) return null
  return ms
}

/** The approximate lunation number at an instant (49.2), before rounding to a phase. */
function lunationAt(ms: number): number {
  const yearFraction = 2000 + (ms - Date.UTC(2000, 0, 1)) / (365.25 * MS_PER_DAY)
  return (yearFraction - 2000) * 12.3685
}

/** Every instant of `phase` (UTC) from `fromDay` to `toDay` inclusive, plus one lunation of slack
 *  either side so a zone shift at the edges cannot lose a date. Sorted. Empty on a bad day key. */
export function lunarPhaseInstants(phase: LunarPhase, fromDay: string, toDay: string): Date[] {
  const from = dayMs(fromDay)
  const to = dayMs(toDay)
  if (from === null || to === null || to < from) return []
  const offset = phase === 'new' ? 0 : 0.5
  const kStart = Math.floor(lunationAt(from)) - 1
  const kEnd = Math.ceil(lunationAt(to)) + 1
  const out: Date[] = []
  for (let k = kStart; k <= kEnd; k++) {
    const at = lunarPhaseInstant(k + offset)
    if (at.getTime() >= from - MS_PER_DAY && at.getTime() < to + 2 * MS_PER_DAY) out.push(at)
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

/** The calendar day of `at` as seen in `timeZone`, YYYY-MM-DD. An unknown zone reads as UTC. */
export function dayInTimeZone(at: Date, timeZone: string): string {
  try {
    return at.toLocaleDateString('en-CA', { timeZone })
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/**
 * The LOCAL calendar days (YYYY-MM-DD, in `timeZone`) on which the phase falls, from `fromDay` to
 * `toDay` inclusive. This is the shape a Pencil wants: a day, in the Space's own zone. Deduped and
 * sorted; empty when the range is invalid.
 */
export function lunarPhaseDates(phase: LunarPhase, fromDay: string, toDay: string, timeZone: string): string[] {
  const days = new Set<string>()
  for (const at of lunarPhaseInstants(phase, fromDay, toDay)) {
    const day = dayInTimeZone(at, timeZone)
    if (day >= fromDay && day <= toDay) days.add(day)
  }
  return [...days].sort()
}
