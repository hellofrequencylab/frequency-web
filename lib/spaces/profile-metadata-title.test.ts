import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/spaces/store', () => ({ getSpaceBySlug: vi.fn(), getSpaceVisibility: vi.fn(async () => 'network') }))
vi.mock('@/lib/spaces/tagline', () => ({ readTagline: vi.fn(async () => null) }))
vi.mock('@/lib/sites/site-domain', () => ({ boundSiteDomain: vi.fn(async () => null) }))
import { getSpaceBySlug } from '@/lib/spaces/store'
import { SITE_NAME } from '@/lib/site'
import { spaceProfileMetadata } from './profile-metadata'

// SCAN-1302: the platform's own root Space is branded with the site name, and the root layout's title
// template appends the site name, so its pages read "Frequency · Frequency". Such a Space's titles are
// absolute; every other Space keeps the template.
const base = { type: 'community', status: 'active', domain: null, parentId: null, ownerProfileId: 'o', preferences: {}, city: null }
beforeEach(() => vi.clearAllMocks())

it('does not double the site name on the platform Space', async () => {
  vi.mocked(getSpaceBySlug).mockResolvedValue({ ...base, id: 'hq', slug: 'hq', name: SITE_NAME, type: 'root' } as never)
  expect((await spaceProfileMetadata('hq')).title).toEqual({ absolute: SITE_NAME })
  const tab = await spaceProfileMetadata('hq', { segment: 'calendar', label: 'Calendar' })
  expect(tab.title).toEqual({ absolute: `Calendar · ${SITE_NAME}` })
  expect(tab.openGraph?.title).toBe(`Calendar · ${SITE_NAME}`)
})

it('keeps the site suffix template for every other Space', async () => {
  vi.mocked(getSpaceBySlug).mockResolvedValue({ ...base, id: 'loft', slug: 'loft', name: 'Yoga Loft' } as never)
  expect((await spaceProfileMetadata('loft')).title).toBe('Yoga Loft')
  const tab = await spaceProfileMetadata('loft', { segment: 'calendar', label: 'Calendar' })
  expect(tab.title).toBe('Calendar · Yoga Loft')
  expect(tab.openGraph?.title).toBe(`Calendar · Yoga Loft · ${SITE_NAME}`)
})
