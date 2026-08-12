import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSiteIcons, SITE_ICON_MAX_LIMIT } from './site-icons-client'

// The browser half of the site-icon search. Its contract is the one the Loom picker relies on:
// it never throws, and it clamps what it asks for. The SEARCH itself is covered by site-icons.test.ts;
// the fan-out property that put this seam here is covered by scripts/build-fanout.test.ts.

const jsonRes = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as unknown as Response

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSiteIcons', () => {
  it('asks the route for the query and returns what it sends back', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      jsonRes({ icons: [{ name: 'lucide:zap', label: 'zap', dataUrl: 'data:image/svg+xml,x' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const icons = await fetchSiteIcons('zap', 20)
    expect(icons).toHaveLength(1)
    expect(icons[0].name).toBe('lucide:zap')

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'https://example.test')
    expect(url.pathname).toBe('/api/site-icons')
    expect(url.searchParams.get('q')).toBe('zap')
    expect(url.searchParams.get('limit')).toBe('20')
  })

  it('sends no q at all for the default (house palette) view', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonRes({ icons: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchSiteIcons('   ')
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'https://example.test')
    expect(url.searchParams.has('q')).toBe(false)
  })

  it('clamps the page size so a caller cannot ask for the whole set', async () => {
    const fetchMock = vi.fn(async (_url: string) => jsonRes({ icons: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchSiteIcons('a', 100_000)
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'https://example.test')
    expect(url.searchParams.get('limit')).toBe(String(SITE_ICON_MAX_LIMIT))
  })

  // FAIL-SAFE, all three ways. A picker showing no site icons still lists the caller's uploaded
  // ones; an exception inside the picker's transition would blank the popup instead.
  it('returns [] when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => { throw new Error('offline') }))
    expect(await fetchSiteIcons('zap')).toEqual([])
  })

  it('returns [] on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => jsonRes({}, false)))
    expect(await fetchSiteIcons('zap')).toEqual([])
  })

  it('returns [] when the body is not the shape it promised', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string) => jsonRes({ icons: 'nope' })))
    expect(await fetchSiteIcons('zap')).toEqual([])
  })
})
