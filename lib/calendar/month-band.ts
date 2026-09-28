// THE BAND OF MONTHS A SCROLLING GRID HOLDS (LIVE-530). Pure, so the decisions the continuous month
// scroll makes can be replayed without a browser: which months are on the scroller, which way it
// may grow, where it must stop growing on its own, and which month is the anchor when several are
// on screen.
//
// A band is a closed range of month keys ('YYYY-MM', lib/calendar/month-window.ts). It grows one
// month at a time at whichever end the reader is near, and it RE-CENTRES when the anchor month is
// handed in from outside the band (the jump panel, Prev / Next past its edge), because explicit
// navigation is never clamped: a person who asks for a month gets that month.
//
// 🔴 AUTOMATIC EXTENSION IS BOUNDED, AND THE BOUND IS THE EVENTS WINDOW. The operator grid draws
// events that arrive ONCE from the server, inside ADMIN_EVENT_FLOOR_MONTHS back and
// ADMIN_EVENT_CEILING_MONTHS forward of today (ADR-1536). Past either edge a month is silently
// event-free, which under a paged grid cost one deliberate act per month and under a scroll is one
// flick. So the scroll stops growing at those edges and says so in a terminal band, and the same
// two constants name both ends for the reader.
import { ADMIN_EVENT_CEILING_MONTHS, ADMIN_EVENT_FLOOR_MONTHS, adjacentMonth, monthKey, safeMonth } from './month-window'

export interface MonthBand {
  /** The first month on the scroller, inclusive. */
  from: string
  /** The last month on the scroller, inclusive. */
  to: string
}

export interface ScrollBounds {
  /** The earliest month automatic extension may reach. */
  floorKey: string
  /** The latest month automatic extension may reach. */
  ceilingKey: string
}

/** How many months a fresh band holds either side of its anchor. Two ahead so a scroller that is
 *  taller than three months still has room to scroll on a phone before the first extension. */
export const BAND_BACK = 1
export const BAND_FORWARD = 2

/** 'YYYY-MM' to a whole-month index, or null for anything that is not a month key. */
export function monthIndex(key: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const parts = safeMonth(m[1], m[2])
  return parts ? parts.year * 12 + (parts.month1 - 1) : null
}

/** The inverse of monthIndex. */
export function keyFromIndex(index: number): string {
  return monthKey(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1)
}

/** The band a fresh scroller opens with: `back` months before the anchor and `forward` after it. */
export function bandAround(anchorKey: string, back = BAND_BACK, forward = BAND_FORWARD): MonthBand {
  const i = monthIndex(anchorKey)
  if (i === null) return { from: anchorKey, to: anchorKey }
  return { from: keyFromIndex(i - back), to: keyFromIndex(i + forward) }
}

/** Every month key in the band, ascending. A malformed band yields its `from` alone. */
export function bandKeys(band: MonthBand): string[] {
  const a = monthIndex(band.from)
  const b = monthIndex(band.to)
  if (a === null || b === null || b < a) return [band.from]
  const out: string[] = []
  for (let i = a; i <= b; i += 1) out.push(keyFromIndex(i))
  return out
}

export function bandContains(band: MonthBand, key: string): boolean {
  return key >= band.from && key <= band.to
}

/**
 * The band grown by one month at `end`, or THE SAME OBJECT when it may not grow there, so a state
 * setter handed the result bails out of the render. It may not grow past the bounds, which is what
 * keeps a flick from walking into months the events read never covers.
 */
export function extendBand(band: MonthBand, end: 'back' | 'forward', bounds: ScrollBounds): MonthBand {
  if (end === 'back') {
    if (band.from <= bounds.floorKey) return band
    const i = monthIndex(band.from)
    return i === null ? band : { from: keyFromIndex(i - 1), to: band.to }
  }
  if (band.to >= bounds.ceilingKey) return band
  const i = monthIndex(band.to)
  return i === null ? band : { from: band.from, to: keyFromIndex(i + 1) }
}

/** Both edges automatic extension stops at, from today's day key: the events window's floor month
 *  and the last month INSIDE its exclusive ceiling. Stated from the same two constants the events
 *  read uses, so the scroll and the read agree about what is in range. */
export function scrollBounds(todayDayKey: string): ScrollBounds {
  const year = Number(todayDayKey.slice(0, 4))
  const month1 = Number(todayDayKey.slice(5, 7))
  const floor = adjacentMonth(year, month1, -ADMIN_EVENT_FLOOR_MONTHS)
  const ceiling = adjacentMonth(year, month1, ADMIN_EVENT_CEILING_MONTHS - 1)
  return { floorKey: monthKey(floor.year, floor.month1), ceilingKey: monthKey(ceiling.year, ceiling.month1) }
}

/** Which month the reader is on when several bands intersect the anchor line: the EARLIEST, which
 *  is the topmost on a scroller that runs down the page. Month order rather than a measured top, so
 *  the choice is monotone in scrollTop and cannot flip between two bands that share a boundary.
 *  Null when nothing intersects. */
export function topmostBand(intersecting: Iterable<string>): string | null {
  let best: string | null = null
  for (const key of intersecting) if (best === null || key < best) best = key
  return best
}
