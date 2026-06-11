import { describe, it, expect } from 'vitest'
import { solveProjection, projectPoint, cardTargetSize, autoContrast } from './deskew'

describe('solveProjection + projectPoint', () => {
  it('is the identity when the quad is already the destination rectangle', () => {
    const quad = [
      { x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 500 }, { x: 0, y: 500 },
    ]
    const hm = solveProjection(800, 500, quad)!
    expect(hm).not.toBeNull()
    const p = projectPoint(hm, 400, 250)
    expect(p.x).toBeCloseTo(400, 4)
    expect(p.y).toBeCloseTo(250, 4)
  })
  it('maps the destination corners exactly onto the source quad', () => {
    const quad = [
      { x: 120, y: 80 }, { x: 900, y: 140 }, { x: 880, y: 600 }, { x: 100, y: 560 },
    ]
    const hm = solveProjection(640, 400, quad)!
    const corners: [number, number][] = [[0, 0], [640, 0], [640, 400], [0, 400]]
    corners.forEach(([u, v], i) => {
      const p = projectPoint(hm, u, v)
      expect(p.x).toBeCloseTo(quad[i].x, 3)
      expect(p.y).toBeCloseTo(quad[i].y, 3)
    })
  })
  it('returns null for a degenerate (collinear) quad', () => {
    const quad = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 },
    ]
    expect(solveProjection(640, 400, quad)).toBeNull()
  })
})

describe('cardTargetSize', () => {
  it('uses the quad edge lengths and caps the long edge', () => {
    const quad = [
      { x: 0, y: 0 }, { x: 2048, y: 0 }, { x: 2048, y: 1280 }, { x: 0, y: 1280 },
    ]
    const { w, h } = cardTargetSize(quad, 1024)
    expect(w).toBe(1024)
    expect(h).toBe(640)
  })
})

describe('autoContrast', () => {
  it('stretches a low-contrast strip toward the full range', () => {
    // 256 gray pixels clustered between 100 and 150.
    const data = new Uint8ClampedArray(256 * 4)
    for (let i = 0; i < 256; i++) {
      const v = 100 + (i % 51)
      data[i * 4] = v
      data[i * 4 + 1] = v
      data[i * 4 + 2] = v
      data[i * 4 + 3] = 255
    }
    autoContrast(data)
    let min = 255
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i])
      max = Math.max(max, data[i])
    }
    expect(min).toBeLessThan(40)
    expect(max).toBeGreaterThan(220)
  })
  it('leaves an already full-range image alone', () => {
    const data = new Uint8ClampedArray(64 * 4)
    for (let i = 0; i < 64; i++) {
      const v = Math.round((i * 255) / 63)
      data[i * 4] = v
      data[i * 4 + 1] = v
      data[i * 4 + 2] = v
      data[i * 4 + 3] = 255
    }
    const before = Array.from(data)
    autoContrast(data)
    expect(Array.from(data)).toEqual(before)
  })
})
