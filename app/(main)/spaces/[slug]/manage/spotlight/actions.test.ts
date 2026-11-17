import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2334: a Spotlight console save writes only its own preference key. The publish switch and the
// layout autosave send `spotlight` alone through set_space_preferences (patchSpacePreferences), built from
// a fresh read, so a save never writes back a stale copy of any other key such as websitePublished.
const mocks = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  fresh: {} as Record<string, unknown> | null,
  patches: [] as Record<string, unknown>[],
  patchOk: true,
  updates: [] as Record<string, unknown>[],
  canManage: true,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner', webRole: 'member' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', about: '', plan: null, preferences: mocks.snapshot }),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return mocks.patchOk
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({ resolveSpaceManageAccess: async () => ({ canManage: mocks.canManage }) }))
vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: async () => false }))
vi.mock('@/lib/pricing/payments-gate', () => ({ spaceCanTakePayments: async () => false }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: vi.fn() }))
vi.mock('@/lib/sites/site-domain', () => ({ boundSiteDomain: async () => null }))
vi.mock('@/lib/sites/vercel-domains', () => ({ addSiteSubdomain: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.fresh === null ? null : { preferences: mocks.fresh }, error: null }) }) }),
      update: (v: Record<string, unknown>) => ({
        eq: async () => {
          mocks.updates.push(v)
          return { error: null }
        },
      }),
    }),
  }),
}))

import { setSpaceSpotlightLook, setSpaceSpotlightPublished } from './actions'

describe('Spotlight console saves (LIVE-2334)', () => {
  beforeEach(() => {
    mocks.snapshot = { websitePublished: false, spotlight: { published: false } }
    mocks.fresh = { websitePublished: true, theme: 'classic', spotlight: { published: false, look: 'story' } }
    mocks.patches = []
    mocks.patchOk = true
    mocks.updates = []
    mocks.canManage = true
  })

  it('the publish switch patches only the spotlight key and never a whole-blob update', async () => {
    expect(await setSpaceSpotlightPublished('hearts', true)).toEqual({})
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0])).toEqual(['spotlight'])
    expect(mocks.updates).toEqual([])
  })

  it('builds the spotlight node from the fresh read, keeping a look saved after the request began', async () => {
    await setSpaceSpotlightPublished('hearts', true)
    expect(mocks.patches[0].spotlight).toEqual({ published: true, look: 'story' })
  })

  it('falls back to the request snapshot when the fresh read finds nothing', async () => {
    mocks.fresh = null
    mocks.snapshot = { spotlight: { published: true, look: 'stack' } }
    await setSpaceSpotlightLook('hearts', null)
    expect(mocks.patches[0]).toEqual({ spotlight: { published: true } })
  })

  it('reports a failed patch to the owner', async () => {
    mocks.patchOk = false
    expect(await setSpaceSpotlightPublished('hearts', false)).toEqual({ error: 'Could not save your Spotlight. Try again.' })
  })

  it('writes nothing when the caller cannot manage the Space', async () => {
    mocks.canManage = false
    expect(await setSpaceSpotlightPublished('hearts', true)).toEqual({ error: 'You do not have permission to edit this space.' })
    expect(mocks.patches).toEqual([])
  })
})
