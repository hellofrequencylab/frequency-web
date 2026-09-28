import { describe, expect, it } from 'vitest'
import {
  BAND_BACK,
  BAND_FORWARD,
  bandAround,
  bandContains,
  bandKeys,
  extendBand,
  keyFromIndex,
  monthIndex,
  scrollBounds,
  topmostBand,
} from './month-band'
import { ADMIN_EVENT_CEILING_MONTHS, ADMIN_EVENT_FLOOR_MONTHS } from './month-window'

// LIVE-530. The continuous month scroll holds a BAND of months, grows it one month at a time toward
// the reader, re-centres on an anchor handed in from outside, and stops growing on its own at the
// events window's two edges. These are the decisions, replayed without a browser.

describe('month keys as whole-month indexes', () => {
  it('rounds trip across a year boundary', () => {
    expect(keyFromIndex(monthIndex('2026-12')! + 1)).toBe('2027-01')
    expect(keyFromIndex(monthIndex('2027-01')! - 1)).toBe('2026-12')
    expect(monthIndex('someday')).toBeNull()
    expect(monthIndex('2026-13')).toBeNull()
  })
})

describe('bandAround: a fresh scroller has room above and more room below', () => {
  it('opens one month back and two forward, so a tall scroller still has somewhere to go', () => {
    expect(BAND_BACK).toBe(1)
    expect(BAND_FORWARD).toBe(2)
    expect(bandAround('2026-09')).toEqual({ from: '2026-08', to: '2026-11' })
    expect(bandKeys(bandAround('2026-11'))).toEqual(['2026-10', '2026-11', '2026-12', '2027-01'])
  })

  it('contains its anchor and nothing outside its two ends', () => {
    const band = bandAround('2026-09')
    expect(bandContains(band, '2026-09')).toBe(true)
    expect(bandContains(band, '2026-08')).toBe(true)
    expect(bandContains(band, '2026-07')).toBe(false)
    expect(bandContains(band, '2026-12')).toBe(false)
  })
})

describe('extendBand: one month at a time, and never on its own past the events window', () => {
  const bounds = { floorKey: '2025-08', ceilingKey: '2027-11' }

  it('grows by one at the end the reader is near', () => {
    const band = { from: '2026-08', to: '2026-11' }
    expect(extendBand(band, 'back', bounds)).toEqual({ from: '2026-07', to: '2026-11' })
    expect(extendBand(band, 'forward', bounds)).toEqual({ from: '2026-08', to: '2026-12' })
  })

  it('🔴 returns the SAME object at a bound, so the setter bails and the edge holds', () => {
    const atFloor = { from: '2025-08', to: '2025-11' }
    expect(extendBand(atFloor, 'back', bounds)).toBe(atFloor)
    const atCeiling = { from: '2027-08', to: '2027-11' }
    expect(extendBand(atCeiling, 'forward', bounds)).toBe(atCeiling)
    // A band re-centred BEYOND the bound by explicit navigation is not clamped back, and does not
    // grow outward either: navigation is unclamped, extension is not.
    const beyond = { from: '2025-02', to: '2025-05' }
    expect(extendBand(beyond, 'back', bounds)).toBe(beyond)
    expect(extendBand(beyond, 'forward', bounds)).toEqual({ from: '2025-02', to: '2025-06' })
  })
})

describe('scrollBounds: the two edges are the events window, stated from the same constants', () => {
  it('names the floor month and the last month inside the exclusive ceiling', () => {
    expect(ADMIN_EVENT_FLOOR_MONTHS).toBe(13)
    expect(ADMIN_EVENT_CEILING_MONTHS).toBe(15)
    // From 2026-09-22 the events read covers [2025-08-01, 2027-12-01): August 2025 through
    // November 2027 inclusive.
    expect(scrollBounds('2026-09-22')).toEqual({ floorKey: '2025-08', ceilingKey: '2027-11' })
    expect(scrollBounds('2026-12-15')).toEqual({ floorKey: '2025-11', ceilingKey: '2028-02' })
  })
})

describe('topmostBand: the earliest month on the anchor line is the one on top', () => {
  it('is monotone in month order and null when nothing intersects', () => {
    expect(topmostBand(['2026-10', '2026-09'])).toBe('2026-09')
    expect(topmostBand(new Set(['2027-01', '2026-12']))).toBe('2026-12')
    expect(topmostBand([])).toBeNull()
  })
})
