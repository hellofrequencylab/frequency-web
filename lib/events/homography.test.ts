import { describe, it, expect } from 'vitest'
import { solveHomography, applyHomography, mapBoxThroughHomography, type Mat3 } from './homography'

const UNIT = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]

describe('solveHomography', () => {
  it('returns identity for matching quads', () => {
    const m = solveHomography(UNIT, UNIT)
    expect(m).not.toBeNull()
    const p = applyHomography(m as Mat3, { x: 0.3, y: 0.7 })
    expect(p!.x).toBeCloseTo(0.3, 6)
    expect(p!.y).toBeCloseTo(0.7, 6)
  })

  it('recovers a pure translation', () => {
    const dst = UNIT.map((p) => ({ x: p.x + 0.2, y: p.y - 0.1 }))
    const m = solveHomography(UNIT, dst)!
    const p = applyHomography(m, { x: 0.5, y: 0.5 })!
    expect(p.x).toBeCloseTo(0.7, 6)
    expect(p.y).toBeCloseTo(0.4, 6)
  })

  it('maps a tilted quad onto the unit square (the deskew case)', () => {
    // A poster photographed at an angle: four skewed corners → unit square.
    const skewed = [
      { x: 0.12, y: 0.08 },
      { x: 0.91, y: 0.15 },
      { x: 0.88, y: 0.93 },
      { x: 0.07, y: 0.85 },
    ]
    const m = solveHomography(skewed, UNIT)!
    skewed.forEach((c, i) => {
      const p = applyHomography(m, c)!
      expect(p.x).toBeCloseTo(UNIT[i].x, 6)
      expect(p.y).toBeCloseTo(UNIT[i].y, 6)
    })
  })

  it('rejects degenerate (collinear) quads', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0.3, y: 0.3 },
      { x: 0.6, y: 0.6 },
      { x: 1, y: 1 },
    ]
    expect(solveHomography(line, UNIT)).toBeNull()
  })
})

describe('mapBoxThroughHomography', () => {
  it('passes a box through the identity unchanged', () => {
    const m = solveHomography(UNIT, UNIT)!
    const box = mapBoxThroughHomography(m, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 })!
    expect(box.x).toBeCloseTo(0.1, 6)
    expect(box.y).toBeCloseTo(0.2, 6)
    expect(box.w).toBeCloseTo(0.5, 6)
    expect(box.h).toBeCloseTo(0.4, 6)
  })

  it('clamps to the unit square and rejects collapsed regions', () => {
    const dst = UNIT.map((p) => ({ x: p.x + 0.95, y: p.y })) // push almost fully off-canvas
    const m = solveHomography(UNIT, dst)!
    expect(mapBoxThroughHomography(m, { x: 0.5, y: 0.4, w: 0.04, h: 0.2 })).toBeNull()
  })
})
