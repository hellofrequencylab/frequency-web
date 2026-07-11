import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchVenues } from './geocode'

// The browser-side searchVenues is a thin fetch to /api/geocode/venues (the local-first
// Nominatim cascade lives server-side in lib/events/venue-search, tested separately).
// Here we pin the URL it builds and its fail-quiet contract.

function mockRoute(handler: (url: URL) => { ok?: boolean; body: unknown }) {
  const seen: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input, 'https://app.test')
      seen.push(url)
      const { ok = true, body } = handler(url)
      return { ok, json: async () => body } as Response
    }),
  )
  return seen
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchVenues (client)', () => {
  it('calls the venues route with the query and forwards the bias as lat/lng', async () => {
    const seen = mockRoute(() => ({ body: [{ label: 'A', name: 'A', lat: 33, lng: -117 }] }))
    const out = await searchVenues('carlsbad hall', undefined, { lat: 33.16, lng: -117.35 })

    expect(seen).toHaveLength(1)
    expect(seen[0].pathname).toBe('/api/geocode/venues')
    expect(seen[0].searchParams.get('q')).toBe('carlsbad hall')
    expect(seen[0].searchParams.get('lat')).toBe('33.16')
    expect(seen[0].searchParams.get('lng')).toBe('-117.35')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('A')
  })

  it('omits lat/lng when there is no valid bias', async () => {
    const seen = mockRoute(() => ({ body: [] }))
    await searchVenues('museum')
    expect(seen[0].searchParams.has('lat')).toBe(false)
    expect(seen[0].searchParams.has('lng')).toBe(false)
  })

  it('is a no-op for queries shorter than two characters', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchVenues('a')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails safe to [] on a non-OK response, a throw, or a non-array body', async () => {
    mockRoute(() => ({ ok: false, body: [] }))
    expect(await searchVenues('boom')).toEqual([])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect(await searchVenues('offline')).toEqual([])

    mockRoute(() => ({ body: { not: 'an array' } }))
    expect(await searchVenues('weird')).toEqual([])
  })
})
