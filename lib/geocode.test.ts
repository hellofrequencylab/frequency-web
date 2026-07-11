import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAddresses } from './geocode'

// A minimal Photon GeoJSON feature. `distanceDeg` places it that many degrees east of the bias
// (roughly N * 69 mi at the equator) so we can reason about proximity ordering directly.
function feature(name: string, lng: number, lat: number, extra: Record<string, string> = {}) {
  return {
    geometry: { coordinates: [lng, lat] as [number, number] },
    properties: { name, city: 'Testville', state: 'CA', country: 'United States', ...extra },
  }
}

function mockFetch(handler: (url: URL) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      return { ok: true, json: async () => handler(url) } as Response
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchAddresses', () => {
  it('sorts results closest-first when a bias is present', async () => {
    const bias = { lat: 33.0, lng: -117.0 }
    // Photon returns them in a deliberately WRONG order (far one first) — proximity sort must fix it.
    mockFetch(() => ({
      features: [
        feature('Far Cafe', -117.5, 33.0), // ~0.5° west of bias
        feature('Near Cafe', -117.05, 33.0), // ~0.05° west of bias
        feature('Mid Cafe', -117.2, 33.0), // ~0.2° west of bias
      ],
    }))
    const out = await searchAddresses('cafe', undefined, bias)
    expect(out.map((r) => r.name)).toEqual(['Near Cafe', 'Mid Cafe', 'Far Cafe'])
  })

  it('falls back to a worldwide pass when the local bbox pass is empty', async () => {
    const bias = { lat: 33.0, lng: -117.0 }
    const calls: Array<string | null> = []
    mockFetch((url) => {
      calls.push(url.searchParams.get('bbox'))
      // Local (bbox) pass finds nothing; the worldwide (no bbox) pass finds the venue.
      if (url.searchParams.get('bbox')) return { features: [] }
      return { features: [feature('Only Match', -80.0, 40.0)] }
    })
    const out = await searchAddresses('somewhere', undefined, bias)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Only Match')
    // Two passes ran: a bounded local one, then the unbounded fallback.
    expect(calls[0]).not.toBeNull()
    expect(calls[1]).toBeNull()
  })

  it('returns Photon order and never crashes with no bias', async () => {
    mockFetch(() => ({
      features: [feature('First', 2.0, 48.0), feature('Second', -0.1, 51.5)],
    }))
    const out = await searchAddresses('museum')
    expect(out.map((r) => r.name)).toEqual(['First', 'Second'])
  })

  it('returns both businesses (POIs) and plain street addresses', async () => {
    mockFetch(() => ({
      features: [
        feature("Joe's Coffee", -117.05, 33.0, { osm_key: 'amenity', osm_value: 'cafe' }),
        // A bare address with no name — the street line becomes the label head.
        {
          geometry: { coordinates: [-117.06, 33.01] as [number, number] },
          properties: { housenumber: '8950', street: 'Villa La Jolla Dr', city: 'San Diego', state: 'CA', country: 'United States' },
        },
      ],
    }))
    const out = await searchAddresses('villa', undefined, { lat: 33.0, lng: -117.0 })
    expect(out.some((r) => r.name === "Joe's Coffee")).toBe(true)
    expect(out.some((r) => r.street === '8950 Villa La Jolla Dr')).toBe(true)
  })

  it('is a no-op for queries shorter than two characters', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchAddresses('a')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
