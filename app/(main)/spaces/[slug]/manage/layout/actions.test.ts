import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2347: every Page panel preferences write sends only the top-level keys it changes through
// set_space_preferences (patchSpacePreferences), never the whole blob, so a key another console saved
// after this request's snapshot (a just-published Spotlight) is not turned back. A change to two keys
// (a page and its doc) lands in one call.
const mocks = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  updates: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', name: 'Hearts', plan: null, domain: null, preferences: mocks.snapshot }),
  stageSpaceDomain: vi.fn(),
  activateSpaceDomain: vi.fn(),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return true
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: true }),
  spaceCanUseFullWebsite: () => true,
  spaceHasEntitlement: () => false,
}))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: vi.fn() }))
vi.mock('@/lib/spaces/space-events', () => ({ scheduleSpaceEvent: vi.fn() }))
vi.mock('@/lib/sites/vercel-domains', () => ({
  addSiteDomain: vi.fn(),
  addSiteSubdomain: async () => ({ ok: true }),
  removeSiteDomain: vi.fn(),
  siteDomainStatus: vi.fn(),
  vercelDomainsConfigured: () => false,
}))
vi.mock('@/lib/sites/chapter-hosts', () => ({ attachChapterHostFor: vi.fn(), attachChapterHosts: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (v: unknown) => ({
        eq: async () => {
          mocks.updates.push(v)
          return { error: null }
        },
      }),
    }),
  }),
}))

import { deleteSpacePage, setSpaceCoverFocus, setWebsitePublished } from './actions'

const doc = { root: { props: {} }, content: [{ type: 'Text', props: { id: 'b' } }], zones: {} }

describe('Page panel preferences writes (LIVE-2347)', () => {
  beforeEach(() => {
    mocks.snapshot = {
      spotlight: { published: false },
      websitePublished: false,
      pages: [{ slug: 'home', label: 'Home' }, { slug: 'about', label: 'About' }],
      pageDocs: { about: doc },
    }
    mocks.patches = []
    mocks.updates = []
  })

  it('the website switch patches websitePublished alone', async () => {
    expect(await setWebsitePublished('hearts', true)).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ websitePublished: true }])
    expect(mocks.updates).toEqual([])
  })

  it('a single-key setting sends only its key, never a stale spotlight', async () => {
    expect(await setSpaceCoverFocus('hearts', '20% 80%')).not.toHaveProperty('error')
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0])).toEqual(['coverFocus'])
    expect(mocks.updates).toEqual([])
  })

  it('deleting a page patches the nav and its doc together, in one call', async () => {
    expect(await deleteSpacePage('hearts', 'about')).not.toHaveProperty('error')
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0]).sort()).toEqual(['pageDocs', 'pages'])
    expect(mocks.patches[0].pageDocs).toEqual({})
    expect(mocks.updates).toEqual([])
  })
})
