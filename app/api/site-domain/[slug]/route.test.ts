import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSiteSpace = vi.fn()
const liveSiteDomain = vi.fn()
vi.mock('@/lib/sites/site-cache', () => ({ getSiteSpace: (...a: unknown[]) => getSiteSpace(...a) }))
vi.mock('@/lib/sites/site-domain', () => ({ liveSiteDomain: (...a: unknown[]) => liveSiteDomain(...a) }))

const { GET, dynamic, revalidate } = await import('./route')
const call = (slug: string) => GET(new Request('https://frequencylocal.com/api/site-domain/x'), { params: Promise.resolve({ slug }) })

describe('GET /api/site-domain/[slug] (LIVE-SUBDOMAIN-ATTRIBUTION)', () => {
  beforeEach(() => { getSiteSpace.mockReset(); liveSiteDomain.mockReset() })

  it('is cached like a site page', () => {
    expect(dynamic).toBe('force-static')
    expect(revalidate).toBe(3600)
  })

  it('answers the live domain liveSiteDomain decides, and nothing else about the Space', async () => {
    getSiteSpace.mockResolvedValue({ id: 's1', slug: 'danieltyack', domain: 'danieltyack.com', preferences: {} })
    liveSiteDomain.mockResolvedValue('danieltyack.com')
    const res = await call('danieltyack')
    expect(await res.json()).toEqual({ domain: 'danieltyack.com' })
    expect(res.headers.get('cache-control')).toContain('s-maxage=3600')
    expect(liveSiteDomain).toHaveBeenCalledWith(expect.objectContaining({ slug: 'danieltyack' }))
  })

  it('answers null for an unknown Space, a site with no live domain, and a slug that is not a slug', async () => {
    getSiteSpace.mockResolvedValue(null)
    expect(await (await call('nobody')).json()).toEqual({ domain: null })
    getSiteSpace.mockResolvedValue({ id: 's2', slug: 'moflow', domain: null, preferences: {} })
    liveSiteDomain.mockResolvedValue(null)
    expect(await (await call('moflow')).json()).toEqual({ domain: null })
    expect(await (await call('Not A Slug')).json()).toEqual({ domain: null })
    expect(getSiteSpace).toHaveBeenCalledTimes(2)
  })
})
