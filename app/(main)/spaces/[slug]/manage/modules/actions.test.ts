import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2349: the Module Manager's preferences writes (the menu save and the starting-setup niche save) send
// only the top-level keys they change through set_space_preferences (patchSpacePreferences), never the whole
// blob, so a key another console saved after this request's snapshot (a just-published Spotlight) is not
// turned back. Clearing the menu sends moduleMenu as null.
const mocks = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  updates: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({
    id: 'space-1',
    slug: 'hearts',
    preferences: mocks.snapshot,
    entitlements: {},
    featureRoles: {},
  }),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return true
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canManageMembers: true }) }))
vi.mock('@/lib/spaces/niche-defaults', () => ({ isUntouchedSetup: () => false, nicheBundle: () => null }))
vi.mock('@/lib/spaces/niche-start', () => ({ startSpaceFromNiche: vi.fn(async () => false) }))
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

import { chooseSpaceNiche, saveSpaceModuleMenu } from './actions'

describe('Module Manager preferences writes (LIVE-2349)', () => {
  beforeEach(() => {
    mocks.snapshot = {
      spotlight: { published: false },
      websitePublished: false,
      moduleMenu: { order: ['space.layout'] },
    }
    mocks.patches = []
    mocks.updates = []
  })

  it('a menu save patches moduleMenu alone, never a stale spotlight', async () => {
    expect(await saveSpaceModuleMenu('hearts', { order: ['space.people', 'space.layout'] })).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ moduleMenu: { order: ['space.people', 'space.layout'] } }])
    expect(mocks.updates).toEqual([])
  })

  it('clearing the menu sends moduleMenu as null', async () => {
    expect(await saveSpaceModuleMenu('hearts', { order: [], hidden: [], activated: [] })).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ moduleMenu: null }])
    expect(mocks.updates).toEqual([])
  })

  it('choosing a niche patches megaTheme alone', async () => {
    expect(await chooseSpaceNiche('hearts', 'general')).not.toHaveProperty('error')
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0])).toEqual(['megaTheme'])
    expect(mocks.patches[0].megaTheme).toMatchObject({ niche: 'general' })
    expect(mocks.updates).toEqual([])
  })
})
