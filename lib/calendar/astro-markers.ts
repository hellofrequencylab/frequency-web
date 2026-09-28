import { SearchSunLongitude, MakeTime } from 'astronomy-engine'
import { lunarPhaseInstants, dayInTimeZone } from '@/lib/calendar/moon'
import { SIGN_INFO, type ZodiacSign } from '@/lib/astrology/signs'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'

// ─────────────────────────────────────────────────────────────────────────────
// THE SKY ON A SPACE'S CALENDAR (LIVE-526).
//
// New moons, full moons, and the moment the Sun enters each sign — which is the
// same moment as the equinox or solstice four times a year.
//
// COMPUTED, NOT SEEDED (owner decision 2026-09-27), and COMPOSED, NOT REWRITTEN.
//
// THE MOONS ARE NOT COMPUTED HERE. `lib/calendar/moon.ts` (PROG-CAL10) already
// solves them: pure Meeus chapter 49, no dependency, and already trusted enough
// that `lib/ai/vera-calendar.ts` hands its dates to a model precisely so a
// proposal is "built on arithmetic rather than recollection". A first draft of
// this file computed them a second way, with astronomy-engine. Both agreed
// exactly across 2026 — all 25 instants, in Pacific, including the fold below —
// which is a good property for a cross-check and a bad reason to keep two
// engines. The sibling test keeps that comparison; the module delegates.
//
// What IS new here is the SUN: sign ingresses, and with them the equinoxes and
// solstices. `astronomy-engine` is already a dependency (lib/astrology/chart.ts
// uses it for natal charts), so that costs no new package and answers for any
// month a reader browses to, instead of running out at the end of a seeded
// table. Server-side only, so none of it reaches the phone bundle.
//
// 🔴 THE FOUR CARDINAL INGRESSES ARE THE EQUINOXES AND SOLSTICES. Not "near",
// not "usually": the same instant to the millisecond, because that is the
// definition. Measured for 2026:
//
//     Seasons().mar_equinox   2026-03-20T14:45:36.044Z
//     Sun enters Aries (0°)   2026-03-20T14:45:36.044Z
//
// So a marker set that emitted "March Equinox" AND "Sun enters Aries" as two
// rows on one day would be the two-rows-over-one-subject bug this repo has now
// fixed five times (reviews, circles, contact, events, discussion). ONE marker
// carries both facts: `solarPoint` names the equinox, `sign` names the sign.
//
// `Seasons()` is therefore NOT called here, and that is deliberate rather than an
// oversight: the twelve ingress searches already produce those four instants, so
// asking a second function for the same moment would be two sources for one fact,
// free to disagree the day either implementation changes. The sibling test DOES
// call `Seasons()` -- as an INDEPENDENT check that the equivalence this module
// relies on is real, which is the one job that second source is good for.
//
// 🔴 DAYS ARE THE SPACE'S DAYS, NEVER UTC'S. A full moon at 04:12 UTC on the
// 26th is the 25th in California, and putting it on the wrong square is the
// exact defect family LIVE-514 and LIVE-516 belong to. Every instant is folded
// through `dayInZone` with the Space's own zone before it becomes a day key,
// and the search window is widened past the requested range so a marker that
// lands inside the range LOCALLY is not missed because it sits outside it in
// UTC.
// ─────────────────────────────────────────────────────────────────────────────

/** What kind of sky moment this is. `sign-ingress` covers all twelve; four of them also carry a
 *  `solarPoint`, because those four ARE the equinoxes and solstices. */
export type AstroMarkerKind = 'new-moon' | 'full-moon' | 'sign-ingress'

export type SolarPoint = 'march-equinox' | 'june-solstice' | 'september-equinox' | 'december-solstice'

export interface AstroMarker {
  /** 'YYYY-MM-DD' in the SPACE's zone, which is the square this belongs on. */
  day: string
  kind: AstroMarkerKind
  /** The exact instant, ISO. Kept so a surface can show the time without recomputing. */
  at: string
  /** Short, already title-cased: "Full moon", "Sun enters Libra, September equinox". */
  label: string
  /** The glyph the existing SIGN_INFO carries (♈), or the moon's. Never invented here. */
  symbol: string
  /** The sign the Sun enters. Only on a `sign-ingress` marker. */
  sign?: ZodiacSign
  /** Only on the four cardinal ingresses, where the ingress IS the equinox or solstice. */
  solarPoint?: SolarPoint
}

/** Ecliptic longitude of each sign's first degree, in calendar order from the March equinox. */
const SIGN_LONGITUDES: { sign: ZodiacSign; lon: number }[] = [
  { sign: 'aries', lon: 0 },
  { sign: 'taurus', lon: 30 },
  { sign: 'gemini', lon: 60 },
  { sign: 'cancer', lon: 90 },
  { sign: 'leo', lon: 120 },
  { sign: 'virgo', lon: 150 },
  { sign: 'libra', lon: 180 },
  { sign: 'scorpio', lon: 210 },
  { sign: 'sagittarius', lon: 240 },
  { sign: 'capricorn', lon: 270 },
  { sign: 'aquarius', lon: 300 },
  { sign: 'pisces', lon: 330 },
]

/** The four cardinal ingresses, by the longitude that defines them. */
const SOLAR_POINTS: Record<number, { point: SolarPoint; label: string }> = {
  0: { point: 'march-equinox', label: 'March equinox' },
  90: { point: 'june-solstice', label: 'June solstice' },
  180: { point: 'september-equinox', label: 'September equinox' },
  270: { point: 'december-solstice', label: 'December solstice' },
}

const MOON_SYMBOL = { 'new-moon': '🌑', 'full-moon': '🌕' } as const

/** Days either side of the requested range to search, so a marker whose LOCAL day is in range but
 *  whose UTC instant is not still gets found. Two days covers every real zone offset (max ±14h)
 *  with room to spare. */
const ZONE_SLACK_DAYS = 2

function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  d.setUTCDate(d.getUTCDate() + by)
  return d.toISOString().slice(0, 10)
}

/** True when `day` is within [from, to] inclusive. Plain string compare: ISO days sort correctly. */
function inRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to
}

/**
 * Every sky marker whose day, IN THE SPACE'S ZONE, falls in [fromDay, toDay].
 *
 * Total and fail-safe: a malformed range or a failure inside the ephemeris returns [], because a
 * calendar that cannot draw the moon should still draw the gatherings.
 */
export function astroMarkersInRange(
  fromDay: string,
  toDay: string,
  timezone: string | null | undefined,
): AstroMarker[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDay) || !/^\d{4}-\d{2}-\d{2}$/.test(toDay)) return []
  if (toDay < fromDay) return []

  // ONE resolved zone for both halves, so the moons and the Sun can never fold on different days.
  // `dayInZone` takes null and falls back to the home zone; `dayInTimeZone` wants a string and
  // reads an unknown zone as UTC. Passing the same resolved value to both keeps them in step.
  const zone = timezone?.trim() || HOME_TZ

  try {
    const searchFrom = new Date(`${shiftDay(fromDay, -ZONE_SLACK_DAYS)}T00:00:00Z`)
    const searchTo = new Date(`${shiftDay(toDay, ZONE_SLACK_DAYS)}T23:59:59Z`)
    const out: AstroMarker[] = []

    // ── Moons, delegated. `lunarPhaseInstants` already carries a lunation of slack either side
    //    so a zone shift at the edges cannot lose a date, and `dayInTimeZone` is the same fold.
    for (const [kind, phase] of [
      ['new-moon', 'new'],
      ['full-moon', 'full'],
    ] as const) {
      for (const at of lunarPhaseInstants(phase, fromDay, toDay)) {
        const day = dayInTimeZone(at, zone)
        if (!inRange(day, fromDay, toDay)) continue
        out.push({
          day,
          kind,
          at: at.toISOString(),
          label: kind === 'new-moon' ? 'New moon' : 'Full moon',
          symbol: MOON_SYMBOL[kind],
        })
      }
    }

    // ── Sign ingresses, which include the equinoxes and solstices. Searched per calendar year
    //    touched by the window, because an ingress longitude occurs once a year.
    const firstYear = Number(fromDay.slice(0, 4)) - 1
    const lastYear = Number(toDay.slice(0, 4)) + 1
    for (let year = firstYear; year <= lastYear; year += 1) {
      for (const { sign, lon } of SIGN_LONGITUDES) {
        const hit = SearchSunLongitude(lon, MakeTime(new Date(Date.UTC(year, 0, 1))), 400)
        if (!hit) continue
        const at = hit.date
        if (at < searchFrom || at > searchTo) continue
        const day = dayInZone(at, zone)
        if (!inRange(day, fromDay, toDay)) continue
        const solar = SOLAR_POINTS[lon]
        out.push({
          day,
          kind: 'sign-ingress',
          at: at.toISOString(),
          // The sign leads, because that is what the owner asked to start each astro season; the
          // equinox or solstice rides along on the four where it is the same moment.
          // 🔴 NOT "<sign> season". `season` is a LOCKED Quest word in docs/NAMING.md (a Quest IS
          // a season; the four are Stretch, Shed, Sit, Sprout), and this is member-facing copy, so
          // reusing it here would put a second meaning on a locked term. "Sun enters Libra" is the
          // standard phrasing and needs no collision guard (owner ruling 2026-09-28).
          label: solar ? `Sun enters ${SIGN_INFO[sign].label}, ${solar.label}` : `Sun enters ${SIGN_INFO[sign].label}`,
          symbol: SIGN_INFO[sign].symbol,
          sign,
          ...(solar ? { solarPoint: solar.point } : {}),
        })
      }
    }

    // Dedupe on (day, kind, at): the year loop overlaps at the edges, and the same ingress must
    // never be listed twice for a window that spans a year boundary.
    const seen = new Set<string>()
    return out
      .filter((m) => {
        const key = `${m.kind}:${m.at}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  } catch {
    return []
  }
}

/** The markers grouped by day key, which is the shape a month grid wants. */
export function astroMarkersByDay(markers: readonly AstroMarker[]): Map<string, AstroMarker[]> {
  const byDay = new Map<string, AstroMarker[]>()
  for (const m of markers) {
    const list = byDay.get(m.day)
    if (list) list.push(m)
    else byDay.set(m.day, [m])
  }
  return byDay
}
