import { describe, expect, it } from 'vitest'
import { haversineM, MAX_NODES, shapeNearby } from './nearby'

// LIVE-721: what the nearby list may and may not say.

const AT = { lat: 33.0369, lng: -117.2919 }
const node = (id: string, extra: Partial<{ type: string; active: boolean; valid_until: string | null }> = {}) => ({
  id, type: 'qr', label: id, active: true, valid_from: null, valid_until: null, ...extra,
})

describe('shapeNearby', () => {
  it('keeps live nodes in range, nearest first, and drops inactive, expired and far ones', () => {
    const geo = [
      { id: 'far', lat: 33.2, lng: -117.2919, proximity_m: 50 },
      { id: 'b', lat: 33.0389, lng: -117.2919, proximity_m: 40 },
      { id: 'a', lat: 33.0370, lng: -117.2919, proximity_m: 30 },
      { id: 'off', lat: 33.0370, lng: -117.2919, proximity_m: 30 },
      { id: 'old', lat: 33.0370, lng: -117.2919, proximity_m: 30 },
    ]
    const out = shapeNearby(AT, 1000, geo, [node('far'), node('a'), node('b'), node('off', { active: false }), node('old', { valid_until: '2020-01-01' })])
    expect(out.map((n) => n.id)).toEqual(['a', 'b'])
    expect(out[0]).toMatchObject({ lat: 33.037, radiusM: 30 })
    expect(JSON.stringify(out)).not.toMatch(/secret/)
  })

  it("never returns a Ghost node's exact point, and widens its fence", () => {
    const out = shapeNearby(AT, 1000, [{ id: 'g', lat: 33.03712345, lng: -117.29187654, proximity_m: 25 }], [node('g', { type: 'ghost' })])
    expect(out[0].lat).toBe(33.037)
    expect(out[0].lng).toBe(-117.292)
    expect(out[0].radiusM).toBeGreaterThanOrEqual(150)
  })

  it('caps the count', () => {
    const geo = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, lat: AT.lat + i * 0.0001, lng: AT.lng, proximity_m: 20 }))
    expect(shapeNearby(AT, 5000, geo, geo.map((g) => node(g.id)))).toHaveLength(MAX_NODES)
  })

  it('measures distance in metres', () => {
    expect(Math.round(haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) / 1000)).toBe(111)
  })
})
