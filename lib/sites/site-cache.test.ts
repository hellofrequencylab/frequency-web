import { describe, expect, it, vi, beforeEach } from 'vitest'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'

// PROG-E10 phase 5 (LIVE-784): the Space website is cached per Space and its owner's writes expire it.

const revalidatePath = vi.fn()
const updateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  updateTag: (...a: unknown[]) => updateTag(...a),
  revalidateTag: vi.fn(),
  unstable_cache: undefined,
}))
const getPublicSpaceBySlugOrThrow = vi.fn()
vi.mock('@/lib/spaces/store', () => ({
  getPublicSpaceBySlugOrThrow: (...a: unknown[]) => getPublicSpaceBySlugOrThrow(...a),
}))

const { getSiteSpace, refreshSite } = await import('./site-cache')
const { siteCacheTag } = await import('@/lib/cross-request-cache')

const ROOT = path.join(import.meta.dirname, '..', '..')
const src = (rel: string) => sourceWithoutComments(path.join(ROOT, rel))

beforeEach(() => {
  revalidatePath.mockReset()
  updateTag.mockReset()
  getPublicSpaceBySlugOrThrow.mockReset()
})

describe('the site cache seam', () => {
  it('tags each Space website by its normalized slug', () => {
    expect(siteCacheTag(' DanielTyack ')).toBe('site:danieltyack')
  })

  it('reads the Space with the normalized slug (raw read where there is no cache)', async () => {
    getPublicSpaceBySlugOrThrow.mockResolvedValue({ id: 's1', slug: 'danieltyack' })
    await expect(getSiteSpace('DanielTyack')).resolves.toEqual({ id: 's1', slug: 'danieltyack' })
    expect(getPublicSpaceBySlugOrThrow).toHaveBeenCalledWith('danieltyack')
    await expect(getSiteSpace('  ')).resolves.toBeNull()
  })

  it('refreshSite expires the site tag and the /sites tree', () => {
    refreshSite('DanielTyack')
    expect(updateTag).toHaveBeenCalledWith('site:danieltyack')
    expect(revalidatePath).toHaveBeenCalledWith('/sites/danieltyack', 'layout')
  })
})

describe('the site routes are cached, not rendered per visit', () => {
  const ROUTES = [
    'app/sites/[slug]/page.tsx',
    'app/sites/[slug]/[page]/page.tsx',
    'app/hosted/[host]/page.tsx',
    'app/hosted/[host]/[page]/page.tsx',
  ]
  it.each(ROUTES)('%s is ISR with an anonymous render', (route) => {
    const s = src(route)
    expect(s).not.toMatch(/force-dynamic/)
    expect(s).toMatch(/export const revalidate = \d+/)
    expect(s).toMatch(/export function generateStaticParams\(\)/)
    expect(s).toMatch(/\{\n\s*markAnonymousRender\(\)/)
  })

  it('the site render reads its Space through the cached seam and never reads the Host header', () => {
    expect(src('components/sites/site-page.tsx')).toMatch(/getSiteSpace\(slug\)/)
    expect(src('components/sites/site-page.tsx')).not.toMatch(/getVisibleSpaceBySlug/)
    expect(src('lib/sites/hosted.ts')).not.toMatch(/headers\(/)
  })
})

describe("the owner's writes expire the site", () => {
  it('saving and resetting a page doc refresh the site', () => {
    const s = src('app/(main)/spaces/[slug]/edit-page/actions.ts')
    expect((s.match(/\brefreshSite\(slug\)/g) ?? []).length).toBe(2)
  })

  it('publishing, the domain and every profile-wide Page panel write refresh the site', () => {
    const s = src('app/(main)/spaces/[slug]/manage/layout/actions.ts')
    const body = (name: string) => {
      const a = s.indexOf(`export async function ${name}(`)
      return s.slice(a, s.indexOf('\n}', a))
    }
    for (const name of ['setWebsitePublished', 'connectSiteDomain', 'removeSiteDomain', 'setSpaceImages', 'setSpaceAccent']) {
      expect(body(name), name).toMatch(/refreshSite\(slug\)/)
    }
    // Every write that refreshes the whole profile refreshes the site with it.
    const profileWide = (s.match(/revalidatePath\(`\/spaces\/\$\{slug\}`(?:, 'layout')?\)/g) ?? []).length
    expect((s.match(/\brefreshSite\(slug\)/g) ?? []).length).toBeGreaterThanOrEqual(profileWide)
  })
})
