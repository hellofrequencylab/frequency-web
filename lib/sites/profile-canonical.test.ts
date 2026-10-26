import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./site-domain', () => ({ boundSiteDomain: vi.fn() }))
import { boundSiteDomain } from './site-domain'
import { profileCanonicalSite, resolveProfileSiteCanonical } from './profile-canonical'
const chapter = { id: 'chapter', slug: 'network-chapter', domain: null, parentId: 'network', ownerProfileId: 'owner', preferences: { websitePublished: true, pages: [{ slug: 'home', label: 'Home' }] } }
beforeEach(() => vi.clearAllMocks())
describe('one canonical rule for profile metadata and sitemap', () => {
  it('resolves a published chapter through the Network bound-domain authority without a direct domain', async () => {
    vi.mocked(boundSiteDomain).mockResolvedValue('chapter.network.example')
    expect(await resolveProfileSiteCanonical(profileCanonicalSite(chapter))).toBe('https://chapter.network.example/')
    expect(boundSiteDomain).toHaveBeenCalledWith(expect.objectContaining({ id: 'chapter', parentId: 'network', ownerProfileId: 'owner' }))
  })
  it('keeps unpublished and unbound profiles on Frequency', async () => {
    expect(profileCanonicalSite({ ...chapter, preferences: {} })).toBeNull()
    expect(await resolveProfileSiteCanonical(null)).toBeNull()
    expect(boundSiteDomain).not.toHaveBeenCalled()
    vi.mocked(boundSiteDomain).mockResolvedValue(null)
    expect(await resolveProfileSiteCanonical(profileCanonicalSite(chapter))).toBeNull()
  })
  it('does not canonicalize app-only tabs to nonexistent website twins', async () => {
    expect(await resolveProfileSiteCanonical(profileCanonicalSite(chapter), 'calendar')).toBeNull()
    expect(boundSiteDomain).not.toHaveBeenCalled()
  })
})
