import { describe, expect, it } from 'vitest'
import {
  bandSegments,
  gridHeight,
  hourMarks,
  layoutTimed,
  minutesAtOffset,
  moveBandToDay,
  moveToTime,
  nowOffset,
  quickAddMinutes,
  snapMinutes,
  visibleHourRange,
} from './week-layout'

const t = (id: string, startMin: number, durMin: number) => ({ id, startMin, durMin })
const base = { startHour: 7, endHour: 23 }

describe('visibleHourRange', () => {
  it('is 7 AM to 11 PM when nothing sits outside it', () => {
    expect(visibleHourRange([t('a', 9 * 60, 60)])).toEqual(base)
    expect(gridHeight(base)).toBe(16 * 52)
  })
  it('grows to hold an item before 7 AM', () => {
    expect(visibleHourRange([t('swim', 6 * 60 + 30, 60)]).startHour).toBe(6)
  })
  it('grows to hold an item that runs past 11 PM, and stops at midnight', () => {
    expect(visibleHourRange([t('late', 22 * 60, 150)]).endHour).toBe(24)
    expect(visibleHourRange([t('later', 23 * 60, 600)]).endHour).toBe(24)
  })
  it('ignores all-day items and honours a different start hour', () => {
    expect(visibleHourRange([{ startMin: null, durMin: 0 }], { startHour: 8, endHour: 20 })).toEqual({ startHour: 8, endHour: 20 })
  })
})

describe('hourMarks and now line', () => {
  it('labels hours with Noon in the middle', () => {
    const marks = hourMarks(base)
    expect(marks).toHaveLength(16)
    expect(marks[0]).toEqual({ hour: 7, label: '7 AM', top: 0 })
    expect(marks.find((m) => m.hour === 12)?.label).toBe('Noon')
    expect(marks[marks.length - 1].label).toBe('10 PM')
  })
  it('puts the now line at 14:24 where the prototype did', () => {
    expect(nowOffset(14 * 60 + 24, base)).toBeCloseTo(7.4 * 52, 5)
    expect(nowOffset(5 * 60, base)).toBeNull()
  })
})

describe('layoutTimed', () => {
  it('places a card at the prototype geometry', () => {
    const [p] = layoutTimed([t('a', 9 * 60 + 30, 90)], base)
    expect(p.top).toBe(2.5 * 52 + 1)
    expect(p.height).toBe(1.5 * 52 - 4)
    expect(p.lanes).toBe(1)
    expect(p.widthPct).toBe(100)
  })
  it('floors a short card at 24px', () => {
    expect(layoutTimed([t('a', 600, 15)], base)[0].height).toBe(24)
  })
  it('splits an overlap into lanes', () => {
    const out = layoutTimed([t('a', 600, 120), t('b', 630, 60)], base)
    expect(out.map((p) => [p.id, p.lane, p.lanes])).toEqual([['a', 0, 2], ['b', 1, 2]])
    expect(out[1].leftPct).toBe(50)
    expect(out[1].widthPct).toBe(50)
  })
  it('sizes lanes per cluster, so a lone item keeps the full width', () => {
    const out = layoutTimed(
      [t('m1', 9 * 60, 120), t('m2', 9 * 60 + 15, 60), t('m3', 9 * 60 + 30, 60), t('lone', 15 * 60, 60)],
      base,
    )
    expect(out.find((p) => p.id === 'm1')!.lanes).toBe(3)
    expect(out.find((p) => p.id === 'lone')).toMatchObject({ lanes: 1, widthPct: 100, leftPct: 0 })
  })
  it('lets back-to-back items share a lane', () => {
    const out = layoutTimed([t('a', 600, 60), t('b', 660, 60)], base)
    expect(out.every((p) => p.lanes === 1)).toBe(true)
  })
  it('chains a cluster through a middle item', () => {
    const out = layoutTimed([t('a', 600, 60), t('b', 630, 90), t('c', 680, 60)], base)
    expect(new Set(out.map((p) => p.lanes)).size).toBe(1)
  })
  it('skips all-day items and places a pre-7 AM item above the old origin', () => {
    const range = visibleHourRange([t('swim', 6 * 60 + 30, 60)])
    const out = layoutTimed([t('swim', 6 * 60 + 30, 60), { id: 'ad', startMin: null, durMin: 0 }], range)
    expect(out).toHaveLength(1)
    expect(out[0].top).toBeGreaterThanOrEqual(0)
  })
})

describe('snapping', () => {
  it('rounds to the nearest 15 minutes', () => {
    expect(snapMinutes(7 * 60 + 7)).toBe(7 * 60)
    expect(snapMinutes(7 * 60 + 8)).toBe(7 * 60 + 15)
    expect(snapMinutes(7 * 60 + 29, 30, 'floor')).toBe(7 * 60)
  })
  it('reads a drop from the card top, not the pointer', () => {
    // Pointer 130px down, card grabbed 26px below its top: the top is at 104px = 2h after 7.
    expect(minutesAtOffset(130, base, { grabOffsetPx: 26 })).toBe(9 * 60)
    expect(minutesAtOffset(130, base)).toBe(9 * 60 + 30)
  })
  it('stays on the grid', () => {
    expect(minutesAtOffset(-50, base)).toBe(7 * 60)
    expect(minutesAtOffset(9999, base)).toBe(23 * 60 - 15)
  })
  it('quick add floors to the half hour', () => {
    expect(quickAddMinutes(2.9 * 52, base)).toBe(9 * 60 + 30)
  })
})

describe('bands', () => {
  const week = '2026-10-19'
  it('clips a band to the window and marks the real ends', () => {
    const segs = bandSegments([{ id: 'retreat', date: '2026-10-17', end: '2026-10-21', startMin: null }], week, 7)
    expect(segs).toEqual([{ id: 'retreat', startCol: 0, endCol: 2, startsHere: false, endsHere: true, row: 0 }])
  })
  it('stacks overlapping bands and leaves room for a gap', () => {
    const segs = bandSegments(
      [
        { id: 'a', date: '2026-10-19', end: '2026-10-22', startMin: null },
        { id: 'b', date: '2026-10-21', end: '2026-10-23', startMin: null },
        { id: 'c', date: '2026-10-24', startMin: null },
      ],
      week,
      7,
    )
    expect(segs.map((s) => [s.id, s.row])).toEqual([['a', 0], ['b', 1], ['c', 0]])
  })
  it('leaves timed items and out-of-window bands out', () => {
    expect(bandSegments([{ id: 't', date: '2026-10-20', startMin: 600 }], week, 7)).toEqual([])
    expect(bandSegments([{ id: 'x', date: '2026-11-20', startMin: null }], week, 7)).toEqual([])
  })
  it('keeps a band its length when dropped on another day', () => {
    expect(moveBandToDay({ date: '2026-10-26', end: '2026-10-28' }, '2026-11-02')).toEqual({ date: '2026-11-02', end: '2026-11-04' })
    expect(moveBandToDay({ date: '2026-10-26', end: null }, '2026-11-02')).toEqual({ date: '2026-11-02', end: null })
  })
  it('turns a drop on a time into a one-day timed item', () => {
    expect(moveToTime({ durMin: 90 }, '2026-10-22', 600)).toEqual({ date: '2026-10-22', end: null, startMin: 600, durMin: 90 })
    expect(moveToTime({ durMin: 0 }, '2026-10-22', 600).durMin).toBe(60)
  })
})
