import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2348: a Storefront settings save sends only the preferences key it changes (storefront) through
// set_space_preferences, so a key another console saved after the snapshot (a Spotlight publish) is never
// written back stale, and no whole-blob update is made.
const mocks = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  updates: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner', webRole: 'member' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', type: 'business', preferences: mocks.snapshot }),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return true
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({
  resolveSpaceManageAccess: async () => ({ canManage: true }),
  getSpaceCapabilities: async () => ({ role: 'owner' }),
}))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: () => true }))
vi.mock('@/lib/spaces/types', () => ({ isConsoleSpaceType: () => true }))
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

import { saveStorefrontSettingsAction } from './shop-actions'

function form(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('Space Shop storefront settings write (LIVE-2348)', () => {
  beforeEach(() => {
    mocks.snapshot = {
      spotlight: { published: true },
      websitePublished: true,
      storefront: { tabLabel: 'Shop', published: false, bannerUrl: null, bannerFocus: '50% 50%' },
    }
    mocks.patches = []
    mocks.updates = []
  })

  it('patches storefront alone', async () => {
    await saveStorefrontSettingsAction('hearts', form({ tabLabel: 'Market', published: 'on' }))
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0])).toEqual(['storefront'])
    expect(mocks.patches[0].storefront).toMatchObject({ tabLabel: 'Market', published: true })
    expect(mocks.updates).toEqual([])
  })

  it('sends nothing when the settings did not change', async () => {
    await saveStorefrontSettingsAction('hearts', form({ tabLabel: 'Shop' }))
    expect(mocks.patches).toEqual([])
    expect(mocks.updates).toEqual([])
  })
})
