import { describe, it, expect } from 'vitest'
import {
  approximatePoint,
  APPROX_GRID_DEG,
  APPROX_JITTER_DEG,
  APPROX_MAX_ERROR_M,
  APPROX_EVENT_NOTE,
  APPROX_SPACE_NOTE,
} from './approximate'

// The coarsening is arithmetic, so it is tested as arithmetic. Three properties matter, and they
// pull against each other, which is why all three are asserted rather than the convenient one:
//
//   1. IRREVERSIBLE. Two points in the same cell must produce the same cell, so the sub-cell
//      position is genuinely gone. This is the privacy claim, and it is the one a "deterministic
//      jitter" implementation silently fails while looking identical from the outside.
//   2. BOUNDED. The drawn point must stay within the distance the UI copy promises, or the map is
//      lying in the other direction.
//   3. STABLE and DISTINCT. Same input, same output forever (a pin that wanders between page loads
//      reads as a bug), and two different rows in one cell must not stack on the same dot.

const R = 6371008.8
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Which grid cell a coordinate falls in. The test derives this independently of the module, so a
 *  change to the module's own snapping cannot make these tests agree with a bug. */
function cell(lat: number, lng: number): string {
  return `${Math.floor(lat / APPROX_GRID_DEG)}:${Math.floor(lng / APPROX_GRID_DEG)}`
}

describe('the guarantee: the address is destroyed, not merely moved', () => {
  it('🔴 two addresses in one cell produce the SAME output for the same seed', () => {
    // This is the whole privacy property, and the single test that a jitter-only implementation
    // fails. If the output varied with the input's sub-cell position, that position would still be
    // encoded in the output and could be recovered by anyone who read this repo.
    const a = approximatePoint(33.2011, -117.2411, 'seed')!
    const b = approximatePoint(33.2089, -117.2489, 'seed')!
    expect(cell(33.2011, -117.2411)).toBe(cell(33.2089, -117.2489)) // same cell, by construction
    expect(a.lat).toBe(b.lat)
    expect(a.lng).toBe(b.lng)
  })

  it('🔴 never returns the input coordinate', () => {
    const out = approximatePoint(33.2, -117.24, 'seed')!
    expect(out.lat).not.toBe(33.2)
    expect(out.lng).not.toBe(-117.24)
  })

  it('a whole street of addresses collapses to a handful of distinct outputs', () => {
    // 200 doors down one block, all in one or two cells. If the output tracked the input at all,
    // this would produce ~200 distinct dots and the map would redraw the street.
    const outs = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const p = approximatePoint(33.2 + i * 0.00002, -117.24, 'seed')!
      outs.add(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
    }
    expect(outs.size).toBeLessThanOrEqual(2)
  })
})

describe('the bound: within the radius the copy promises', () => {
  const SPOTS: [name: string, lat: number, lng: number][] = [
    ['San Diego county, where the community actually is', 33.2, -117.24],
    ['the equator', 0.0004, 0.0004],
    ['high northern latitude, where longitude degrees are short', 64.14, -21.94],
    ['the southern hemisphere', -33.87, 151.21],
    ['just west of the antimeridian', -17.7, 179.996],
    ['just east of the prime meridian', 51.48, 0.0012],
  ]

  for (const [name, lat, lng] of SPOTS) {
    it(`stays within ${APPROX_MAX_ERROR_M} m at ${name}`, () => {
      for (let i = 0; i < 60; i++) {
        const out = approximatePoint(lat, lng, `row-${i}`)!
        expect(out).not.toBeNull()
        expect(metresBetween(lat, lng, out.lat, out.lng)).toBeLessThanOrEqual(APPROX_MAX_ERROR_M)
      }
    })
  }

  it('always returns a real coordinate, never one off the end of the world', () => {
    for (let i = 0; i < 200; i++) {
      const lat = -89 + (178 * i) / 200
      const out = approximatePoint(lat, -179.999 + (359 * i) / 200, `r-${i}`)!
      expect(Math.abs(out.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(out.lng)).toBeLessThanOrEqual(180)
    }
  })

  it('the jitter cannot push a point out of its own cell', () => {
    // Strictly less than half a cell, or the "cell is the disclosure" claim would be off by one.
    expect(APPROX_JITTER_DEG).toBeLessThan(APPROX_GRID_DEG / 2)
  })
})

describe('stability and spread', () => {
  it('same coordinate and same seed give the same point forever', () => {
    const a = approximatePoint(33.2, -117.24, 'space-1')!
    const b = approximatePoint(33.2, -117.24, 'space-1')!
    expect(a).toEqual(b)
  })

  it('🔴 two rows at the same address land on different dots', () => {
    // Otherwise the coarsening is an equality oracle: identical dots would announce "these two
    // withheld places are at the same address", which is itself a disclosure.
    const a = approximatePoint(33.2, -117.24, 'event-1')!
    const b = approximatePoint(33.2, -117.24, 'event-2')!
    expect(a.lat === b.lat && a.lng === b.lng).toBe(false)
  })

  it('spreads seeds around the cell rather than piling them on one side', () => {
    // A hash that only ever produced one quadrant would satisfy every other test here and still
    // draw a visibly lopsided cluster.
    const quadrants = new Set<string>()
    const centreLat = Math.floor(33.2 / APPROX_GRID_DEG) * APPROX_GRID_DEG + APPROX_GRID_DEG / 2
    const centreLng = Math.floor(-117.24 / APPROX_GRID_DEG) * APPROX_GRID_DEG + APPROX_GRID_DEG / 2
    for (let i = 0; i < 80; i++) {
      const p = approximatePoint(33.2, -117.24, `seed-${i}`)!
      quadrants.add(`${p.lat > centreLat ? 'n' : 's'}${p.lng > centreLng ? 'e' : 'w'}`)
    }
    expect(quadrants.size).toBe(4)
  })
})

describe('a coordinate that is not a coordinate draws nothing', () => {
  const BAD: [why: string, lat: number, lng: number][] = [
    ['NaN latitude', Number.NaN, -117.24],
    ['NaN longitude', 33.2, Number.NaN],
    ['infinite latitude', Number.POSITIVE_INFINITY, -117.24],
    ['latitude past the pole', 91, -117.24],
    ['longitude past the antimeridian', 33.2, 181],
  ]

  for (const [why, lat, lng] of BAD) {
    it(`${why} returns null, so the caller draws no pin`, () => {
      expect(approximatePoint(lat, lng, 'seed')).toBeNull()
    })
  }

  it('🔴 null is the ONLY safe failure, because the alternative is the exact point', () => {
    // Documented here because the tempting `?? { lat, lng }` in a caller would turn every malformed
    // row into a full-precision leak. lib/nearby/map-pins.test.ts holds the caller-side half.
    expect(approximatePoint(Number.NaN, 0, 's')).toBeNull()
  })
})

describe('the copy that ships beside the dot', () => {
  it('tells the member the area is approximate, in both variants', () => {
    expect(APPROX_EVENT_NOTE).toContain('Approximate area')
    expect(APPROX_SPACE_NOTE).toContain('Approximate area')
  })

  it('says how to get the real address for an event, because there is a way', () => {
    expect(APPROX_EVENT_NOTE).toContain('RSVP')
  })

  it('uses no em dashes (docs/CONTENT-VOICE.md §10)', () => {
    expect(APPROX_EVENT_NOTE).not.toContain('—')
    expect(APPROX_SPACE_NOTE).not.toContain('—')
  })
})
