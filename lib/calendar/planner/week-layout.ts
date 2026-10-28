import { addDays, diffDays, lastDay } from './days'
import type { PlannerItem } from './types'

// THE TIME GRID for Week and Day (README 1.3), as numbers a view turns into styles.
//
// Three fixes on the prototype live here. (1) The visible hours grow to hold an item before 7 AM or
// after 11 PM instead of clipping it (the Full moon swim at 6:30 sat at a negative top). (2) A
// card's lane width is worked out per OVERLAP CLUSTER, not per day, so a lone item on a day with a
// three-way overlap elsewhere keeps the whole column. (3) A drop reads where the card's top lands,
// not where the pointer is, so a card grabbed by its middle does not jump half its height.

/** Pixels per hour on the grid. */
const PX_PER_HOUR = 52
/** First hour drawn when nothing starts earlier. */
const DEFAULT_START_HOUR = 7
/** Hour the grid ends at when nothing runs later (11 PM). */
const DEFAULT_END_HOUR = 23
/** Minutes a drop snaps to. */
export const SNAP_MINUTES = 15
/** The shortest a card is drawn, so a 15 minute item can still be read and grabbed. */
const MIN_CARD_PX = 24

interface HourRange {
  startHour: number
  endHour: number
}

type Timed = Pick<PlannerItem, 'id' | 'startMin' | 'durMin'>

function endMinOf(item: Timed): number {
  return Math.min(1440, (item.startMin ?? 0) + Math.max(item.durMin, SNAP_MINUTES))
}

/** The hours the grid draws: the base range, grown to hold every timed item. */
export function visibleHourRange(
  items: readonly Pick<PlannerItem, 'startMin' | 'durMin'>[],
  base: HourRange = { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR },
): HourRange {
  let startHour = Math.max(0, Math.min(24, base.startHour))
  let endHour = Math.max(startHour + 1, Math.min(24, base.endHour))
  for (const it of items) {
    if (it.startMin == null) continue
    startHour = Math.min(startHour, Math.floor(Math.max(0, it.startMin) / 60))
    endHour = Math.max(endHour, Math.ceil(endMinOf({ id: '', startMin: it.startMin, durMin: it.durMin }) / 60))
  }
  return { startHour, endHour: Math.min(24, endHour) }
}

/** Height of the whole grid in pixels. */
export function gridHeight(range: HourRange): number {
  return (range.endHour - range.startHour) * PX_PER_HOUR
}

/** The hour labels down the left edge: "7 AM", "Noon", "10 PM". */
export function hourMarks(range: HourRange): { hour: number; label: string; top: number }[] {
  const out: { hour: number; label: string; top: number }[] = []
  for (let h = range.startHour; h < range.endHour; h++) {
    const label = h === 0 ? '12 AM' : h === 12 ? 'Noon' : h > 12 ? `${h - 12} PM` : `${h} AM`
    out.push({ hour: h, label, top: (h - range.startHour) * PX_PER_HOUR })
  }
  return out
}

/** Pixel offset of the "now" line for today's column, or null when now is outside the grid. */
export function nowOffset(nowMin: number, range: HourRange): number | null {
  if (nowMin < range.startHour * 60 || nowMin > range.endHour * 60) return null
  return ((nowMin - range.startHour * 60) / 60) * PX_PER_HOUR
}

interface TimedPlacement {
  id: string
  /** Pixels from the top of the grid. */
  top: number
  height: number
  /** Zero-based lane inside the overlap cluster. */
  lane: number
  /** How many lanes the cluster has; every card in the cluster shares this. */
  lanes: number
  /** Percent from the column's left edge. */
  leftPct: number
  /** Percent of the column width, before the view takes its gutter off. */
  widthPct: number
}

/** Places a day's timed items: top, height and lane, with lane width set per overlap cluster. */
export function layoutTimed(items: readonly Timed[], range: HourRange): TimedPlacement[] {
  const timed = items
    .filter((it) => it.startMin != null)
    .slice()
    .sort((a, b) => a.startMin! - b.startMin! || endMinOf(b) - endMinOf(a))

  const clusters: Timed[][] = []
  let clusterEnd = -1
  for (const it of timed) {
    if (clusters.length === 0 || it.startMin! >= clusterEnd) {
      clusters.push([it])
      clusterEnd = endMinOf(it)
    } else {
      clusters[clusters.length - 1].push(it)
      clusterEnd = Math.max(clusterEnd, endMinOf(it))
    }
  }

  const out: TimedPlacement[] = []
  for (const cluster of clusters) {
    const laneEnds: number[] = []
    const assigned: { it: Timed; lane: number }[] = []
    for (const it of cluster) {
      let lane = 0
      while (laneEnds[lane] !== undefined && laneEnds[lane] > it.startMin!) lane++
      laneEnds[lane] = endMinOf(it)
      assigned.push({ it, lane })
    }
    const lanes = Math.max(1, laneEnds.length)
    for (const { it, lane } of assigned) {
      out.push({
        id: it.id,
        top: ((it.startMin! - range.startHour * 60) / 60) * PX_PER_HOUR + 1,
        height: Math.max(MIN_CARD_PX, (Math.max(it.durMin, 0) / 60) * PX_PER_HOUR - 4),
        lane,
        lanes,
        leftPct: (lane * 100) / lanes,
        widthPct: 100 / lanes,
      })
    }
  }
  return out
}

/** Minutes snapped to the step: nearest by default, or 'floor' for a click on empty space. */
export function snapMinutes(minutes: number, step: number = SNAP_MINUTES, mode: 'round' | 'floor' = 'round'): number {
  const n = minutes / step
  return (mode === 'floor' ? Math.floor(n) : Math.round(n)) * step
}

/**
 * The minute a drop lands on. `offsetPx` is the pointer's distance below the column's top;
 * `grabOffsetPx` is how far down the card the pointer held it, so the card's TOP is what snaps.
 * The result stays on the grid, with room left for the shortest card.
 */
export function minutesAtOffset(
  offsetPx: number,
  range: HourRange,
  opts: { grabOffsetPx?: number; step?: number; mode?: 'round' | 'floor' } = {},
): number {
  const step = opts.step ?? SNAP_MINUTES
  const top = offsetPx - (opts.grabOffsetPx ?? 0)
  const raw = range.startHour * 60 + (top / PX_PER_HOUR) * 60
  const snapped = snapMinutes(raw, step, opts.mode ?? 'round')
  return Math.max(range.startHour * 60, Math.min(range.endHour * 60 - step, snapped))
}

/** A click on empty time starts a new item on the half hour below it. */
export function quickAddMinutes(offsetPx: number, range: HourRange): number {
  return minutesAtOffset(offsetPx, range, { step: 30, mode: 'floor' })
}

interface BandSegment {
  id: string
  /** First and last column the band covers inside the window, zero-based. */
  startCol: number
  endCol: number
  /** True when the band truly begins / ends in this window, which decides its rounded corners. */
  startsHere: boolean
  endsHere: boolean
  /** Stack row, zero-based, so overlapping bands sit on top of each other. */
  row: number
}

/** The bands (all-day and multi-day items) a window of `days` columns draws, stacked in rows. */
export function bandSegments(
  items: readonly Pick<PlannerItem, 'id' | 'date' | 'end' | 'startMin'>[],
  windowStart: string,
  days: number,
): BandSegment[] {
  const windowEnd = addDays(windowStart, days - 1)
  const segs: Omit<BandSegment, 'row'>[] = []
  for (const it of items) {
    if (it.startMin != null && !it.end) continue
    const last = lastDay(it)
    if (last < windowStart || it.date > windowEnd) continue
    const from = it.date < windowStart ? windowStart : it.date
    const to = last > windowEnd ? windowEnd : last
    segs.push({
      id: it.id,
      startCol: diffDays(windowStart, from),
      endCol: diffDays(windowStart, to),
      startsHere: it.date >= windowStart,
      endsHere: last <= windowEnd,
    })
  }
  segs.sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol)
  const rowEnds: number[] = []
  return segs.map((s) => {
    let row = 0
    while (rowEnds[row] !== undefined && rowEnds[row] >= s.startCol) row++
    rowEnds[row] = s.endCol
    return { ...s, row }
  })
}

/** Dropping a day-owning item on another day keeps its length: the end moves by the same span. */
export function moveBandToDay(
  item: Pick<PlannerItem, 'date' | 'end'>,
  toDay: string,
): { date: string; end: string | null } {
  if (!item.end || item.end <= item.date) return { date: toDay, end: null }
  return { date: toDay, end: addDays(toDay, diffDays(item.date, item.end)) }
}

/** Dropping an item on a time makes it a one-day timed item: the band end is cleared with the move. */
export function moveToTime(
  item: Pick<PlannerItem, 'durMin'>,
  toDay: string,
  startMin: number,
): { date: string; end: null; startMin: number; durMin: number } {
  return { date: toDay, end: null, startMin, durMin: item.durMin > 0 ? item.durMin : 60 }
}
