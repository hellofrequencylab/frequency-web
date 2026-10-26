import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/spaces/store', () => ({ getSpaceBySlug: vi.fn(), getSpaceVisibility: vi.fn(async () => 'network') }))
vi.mock('@/lib/spaces/tagline', () => ({ readTagline: vi.fn(async () => null) }))
vi.mock('@/lib/sites/site-domain', () => ({ boundSiteDomain: vi.fn(async () => 'chapter.network.example') }))
import { getSpaceBySlug } from '@/lib/spaces/store'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { spaceProfileMetadata } from './profile-metadata'
const chapter = { id: 'chapter', slug: 'chapter', name: 'Chapter', type: 'community', status: 'active', domain: null, parentId: 'network', ownerProfileId: 'owner', preferences: { websitePublished: true, pages: [{ slug: 'home', label: 'Home' }] } }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSpaceBySlug).mockResolvedValue(chapter as never) })
it('emits the inherited hosted chapter canonical and share URL from actual metadata', async () => {
  const metadata = await spaceProfileMetadata('chapter')
  expect(metadata.alternates?.canonical).toBe('https://chapter.network.example/')
  expect(metadata.openGraph?.url).toBe('https://chapter.network.example/')
  expect(boundSiteDomain).toHaveBeenCalledWith(expect.objectContaining({ parentId: 'network', ownerProfileId: 'owner' }))
})
it('keeps an app-only tab self canonical without invoking hosted authority', async () => {
  expect((await spaceProfileMetadata('chapter', { segment: 'calendar', label: 'Calendar' })).alternates?.canonical).toBe('/spaces/chapter/calendar')
  expect(boundSiteDomain).not.toHaveBeenCalled()
})
it('keeps an unpublished chapter profile self canonical', async () => {
  vi.mocked(getSpaceBySlug).mockResolvedValue({ ...chapter, preferences: {} } as never)
  expect((await spaceProfileMetadata('chapter')).alternates?.canonical).toBe('/spaces/chapter')
  expect(boundSiteDomain).not.toHaveBeenCalled()
})
