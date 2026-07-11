// Drop the Nominatim politeness delay to zero so the cascade's sequential passes
// don't make the suite wait real seconds (read per-call inside lib/events/nominatim).
process.env.NOMINATIM_MIN_INTERVAL_MS = '0'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchVenues } from './venue-search'

// A minimal Nominatim jsonv2 place (addressdetails=1).
function place(
  name: string | null,
  lon: number,
  lat: number,
  address: Record<string, string> = {},
) {
  return {
    lat: String(lat),
    lon: String(lon),
    name: name ?? '',
    display_name: `${name ?? 'Somewhere'}, Testville, CA, United States`,
    address: { city: 'Testville', state: 'CA', country: 'United States', ...address },
  }
}

// Mock global fetch; the handler sees the request URL and returns a Nominatim array.
// Also records which pass each call was (by its params) so we can assert the cascade.
function mockNominatim(handler: (url: URL) => unknown[]) {
  const calls: Array<{ viewbox: string | null; bounded: string | null; cc: string | null }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string) => {
      const url = input instanceof URL ? input : new URL(input)
      calls.push({
        viewbox: url.searchParams.get('viewbox'),
        bounded: url.searchParams.get('bounded'),
        cc: url.searchParams.get('countrycodes'),
      })
      return { ok: true, json: async () => handler(url) } as Response
    }),
  )
  return calls
}

// Carlsbad, CA — the bias from the bug report.
const CARLSBAD = { lat: 33.1581, lng: -117.3506 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchVenues cascade', () => {
  it('LOCAL pass wins: a nearby address leads and a global fuzzy match never appears', async () => {
    const calls = mockNominatim((url) => {
      // Only the bounded local pass is exercised here. It returns two local Carlsbad
      // rows (in the WRONG order) plus a stray France row that must be dropped.
      if (url.searchParams.get('bounded') === '1') {
        return [
          place('Embarcadère', 5.37, 43.29, { country: 'France' }), // ~9,000 km away
          place('Farther Carlsbad Cafe', -117.2, 33.1), // ~13 km east
          place('6882 Embarcadero Ln', -117.35, 33.16, { house_number: '6882', road: 'Embarcadero Ln', city: 'Carlsbad' }), // ~right here
        ]
      }
      return []
    })

    const out = await searchVenues('6882 Embarcadero Ln, Carlsbad', CARLSBAD)

    // Only one pass ran (local found results), and it was the hard bounded one.
    expect(calls).toHaveLength(1)
    expect(calls[0].bounded).toBe('1')
    expect(calls[0].viewbox).not.toBeNull()

    // The France match is gone (distance-guarded); the nearest local address leads.
    expect(out.some((r) => r.country === 'France')).toBe(false)
    expect(out[0].street).toBe('6882 Embarcadero Ln')
    expect(out.map((r) => r.name)).toEqual(['6882 Embarcadero Ln', 'Farther Carlsbad Cafe'])
  })

  it('NATIONAL fallback: empty local → a country-scoped pass', async () => {
    const calls = mockNominatim((url) => {
      if (url.searchParams.get('bounded') === '1') return [] // local finds nothing
      if (url.searchParams.get('countrycodes') === 'us') return [place('Austin Venue', -97.74, 30.27)]
      return []
    })

    const out = await searchVenues('austin venue', CARLSBAD)

    expect(calls).toHaveLength(2)
    expect(calls[0].bounded).toBe('1') // local first
    expect(calls[1].cc).toBe('us') // then national
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Austin Venue')
  })

  it('WORLDWIDE last resort: empty local + national → unbounded pass', async () => {
    const calls = mockNominatim((url) => {
      if (url.searchParams.get('bounded') === '1') return []
      if (url.searchParams.get('countrycodes')) return []
      return [place('Sydney Opera House', 151.21, -33.86, { country: 'Australia' })]
    })

    const out = await searchVenues('opera', CARLSBAD)

    expect(calls).toHaveLength(3)
    expect(calls[2].viewbox).toBeNull()
    expect(calls[2].cc).toBeNull()
    expect(out[0].name).toBe('Sydney Opera House')
  })

  it('a clearly non-US bias skips the national pass and goes straight to worldwide', async () => {
    const calls = mockNominatim((url) => {
      if (url.searchParams.get('bounded') === '1') return [] // empty local
      return [place('Louvre', 2.33, 48.86, { country: 'France' })]
    })

    // Paris bias — outside the US box, so no countrycodes pass.
    const out = await searchVenues('louvre', { lat: 48.86, lng: 2.34 })

    expect(calls).toHaveLength(2)
    expect(calls[0].bounded).toBe('1')
    expect(calls[1].cc).toBeNull() // national skipped; this is the worldwide pass
    expect(out[0].name).toBe('Louvre')
  })

  it('no bias → a US national pass, then a worldwide pass, in provider order', async () => {
    const calls = mockNominatim((url) => {
      // With no bias the country is "unknown", so the cascade tries a US national pass
      // first (Frequency is US-first); only when that's empty does it go worldwide.
      if (url.searchParams.get('countrycodes') === 'us') return []
      return [
        place('Paris', 2.35, 48.85, { country: 'France' }),
        place('London', -0.12, 51.5, { country: 'United Kingdom' }),
      ]
    })

    const out = await searchVenues('museum')

    expect(calls).toHaveLength(2)
    expect(calls[0].viewbox).toBeNull() // no local pass without a bias
    expect(calls[0].cc).toBe('us') // national US pass
    expect(calls[1].cc).toBeNull() // worldwide fallback
    // No bias → provider order is preserved (no proximity re-sort).
    expect(out.map((r) => r.name)).toEqual(['Paris', 'London'])
  })

  it('maps businesses (POIs) and plain street addresses into PlaceResult fields', async () => {
    mockNominatim((url) => {
      if (url.searchParams.get('bounded') === '1') {
        return [
          // A POI: carries its own name.
          place("Joe's Coffee", -117.35, 33.16, { road: 'State St', city: 'Carlsbad' }),
          // A plain address: no name and no `city` (only `town`) → street becomes the name,
          // town fills city. Built inline so the helper's default `city` doesn't mask it.
          {
            lat: '33.17',
            lon: '-117.34',
            name: '',
            display_name: '8950 Villa La Jolla Dr, San Diego, California, United States',
            address: {
              house_number: '8950',
              road: 'Villa La Jolla Dr',
              town: 'San Diego',
              state: 'California',
              country: 'United States',
              postcode: '92037',
            },
          },
        ]
      }
      return []
    })

    const out = await searchVenues('coffee', CARLSBAD)
    const poi = out.find((r) => r.name === "Joe's Coffee")
    const addr = out.find((r) => r.street === '8950 Villa La Jolla Dr')

    expect(poi).toBeTruthy()
    expect(addr).toBeTruthy()
    expect(addr!.name).toBe('8950 Villa La Jolla Dr') // no POI name → street is the head
    expect(addr!.city).toBe('San Diego') // from address.town
    expect(addr!.region).toBe('California') // from address.state
    expect(addr!.postalCode).toBe('92037')
  })

  it('is a no-op for queries shorter than two characters', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchVenues('a', CARLSBAD)).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails safe to [] when the provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    expect(await searchVenues('anything', CARLSBAD)).toEqual([])
  })
})
