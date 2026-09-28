import { describe, expect, it } from 'vitest'
import {
  monthGridWindow,
  operatorHorizonWindow,
  adminEventFloorDay,
  adminEventCeilingDay,
  adminEventWindow,
  ADMIN_EVENT_FLOOR_MONTHS,
  ADMIN_EVENT_CEILING_MONTHS,
  OPERATOR_HORIZON_BACK_MONTHS,
  OPERATOR_HORIZON_FORWARD_MONTHS,
} from './month-window'

// A window is only ever read as "does this date survive it", so that is what these measure.
const covers = (w: { fromDay: string; toDay: string }, day: string) => day >= w.fromDay && day < w.toDay

describe('operatorHorizonWindow', () => {
  it('carries a whole season forward, which a calendar year did not', () => {
    // Royal Temple's seeded schedule, the case that found this: Fall Equinox 2026 to Fall
    // Equinox 2027, surveyed from the September before it.
    const now = new Date('2026-09-22T00:00:00Z')
    const window = operatorHorizonWindow(now)

    expect(covers(window, '2026-09-27')).toBe(true) // the first pencilled date
    expect(covers(window, '2027-09-24')).toBe(true) // the last one, 12 months out

    // The window this replaced was `${year}-01-01` to `${year + 1}-01-01`. Every date from the
    // new year on fell outside it — 98 of the Space's 128 — while the month grid showed them.
    const calendarYear = { fromDay: '2026-01-01', toDay: '2027-01-01' }
    expect(covers(calendarYear, '2027-09-24')).toBe(false)
  })

  it('anchors on today rather than on January, so December reaches into the next year', () => {
    // The old window was at its worst in December: one month of runway left.
    const december = operatorHorizonWindow(new Date('2026-12-15T00:00:00Z'))
    expect(covers(december, '2027-11-01')).toBe(true)
    expect(december.fromDay).toBe('2026-09-01')
    expect(december.toDay).toBe('2028-03-01')
  })

  it('keeps a short tail of recent context and a long forward horizon', () => {
    const window = operatorHorizonWindow(new Date('2026-09-22T00:00:00Z'))
    expect(window).toEqual({ fromDay: '2026-06-01', toDay: '2027-12-01' })
    expect(OPERATOR_HORIZON_FORWARD_MONTHS).toBeGreaterThan(OPERATOR_HORIZON_BACK_MONTHS)
    // Far enough that a date a full year out is never near the edge.
    expect(OPERATOR_HORIZON_FORWARD_MONTHS).toBeGreaterThanOrEqual(13)
  })

  it('steps across a year boundary without arithmetic drift', () => {
    expect(operatorHorizonWindow(new Date('2027-01-01T00:00:00Z'))).toEqual({
      fromDay: '2026-10-01',
      toDay: '2028-04-01',
    })
  })
})

describe('monthGridWindow', () => {
  it('spans the spill days either side of the month, so the grid never loads a hole', () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    expect(monthGridWindow(2026, 9)).toEqual({ fromDay: '2026-08-30', toDay: '2026-10-04' })
  })
})

// LIVE-467. The team calendar's EVENTS read needs a floor of its own: with none, ascending and
// capped at 200, a Space past 200 events lost its upcoming ones from every team surface.
describe('adminEventFloorDay', () => {
  it('is the first of the month thirteen months back, so a season and its year of context fit', () => {
    expect(ADMIN_EVENT_FLOOR_MONTHS).toBe(13)
    expect(adminEventFloorDay(new Date('2026-09-22T00:00:00Z'))).toBe('2025-08-01')
    expect(adminEventFloorDay(new Date('2027-01-15T00:00:00Z'))).toBe('2025-12-01')
  })

  it('reaches further back than the operator entry horizon, so the two never disagree about recent', () => {
    expect(ADMIN_EVENT_FLOOR_MONTHS).toBeGreaterThanOrEqual(OPERATOR_HORIZON_BACK_MONTHS)
  })
})

// LIVE-480, the other half of LIVE-467. A floor and no roof is a window open at the top, and the
// newest-first read that closed LIVE-467 keeps the 200 FURTHEST-FUTURE rows inside it: a Space
// that had scheduled past the cap lost the dates it runs next month. The roof closes the window.
describe('adminEventCeilingDay', () => {
  it('is the first of the month fifteen months forward, exclusive, so a season fits under it', () => {
    expect(ADMIN_EVENT_CEILING_MONTHS).toBe(15)
    expect(adminEventCeilingDay(new Date('2026-09-22T00:00:00Z'))).toBe('2027-12-01')
    expect(adminEventCeilingDay(new Date('2026-11-15T00:00:00Z'))).toBe('2028-02-01')
  })

  it('reaches at least as far as the operator entry horizon, so events and entries agree on the far edge', () => {
    expect(ADMIN_EVENT_CEILING_MONTHS).toBeGreaterThanOrEqual(OPERATOR_HORIZON_FORWARD_MONTHS)
    const now = new Date('2026-09-22T00:00:00Z')
    expect(adminEventCeilingDay(now) >= operatorHorizonWindow(now).toDay).toBe(true)
  })

  it('states both ends together, and every date of a seeded year survives the window', () => {
    const now = new Date('2026-09-22T00:00:00Z')
    const window = adminEventWindow(now)
    expect(window).toEqual({ fromDay: adminEventFloorDay(now), toDay: adminEventCeilingDay(now) })
    expect(window).toEqual({ fromDay: '2025-08-01', toDay: '2027-12-01' })
    // Royal Temple's year, Fall Equinox 2026 to Fall Equinox 2027, from the September before it.
    expect(covers(window, '2026-09-27')).toBe(true)
    expect(covers(window, '2027-09-24')).toBe(true)
    // The roof is a roof: the first instant of the ceiling month is out.
    expect(covers(window, '2027-12-01')).toBe(false)
  })
})
