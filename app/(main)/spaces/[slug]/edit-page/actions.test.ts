import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2347: a page publish or reset sends only the preferences keys it changes (pageDocs, and for a
// Home reset the legacy `puck` doc) through set_space_preferences, so a key another console saved after
// the snapshot (a Spotlight publish) is never written back stale, and no whole-blob update is made.
const mocks = vi.hoisted(() => ({
  snapshot: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  updates: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'owner' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', preferences: mocks.snapshot }),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return true
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: true }) }))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: vi.fn() }))
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

import { publishSpaceLanding, resetSpaceLanding } from './actions'

const doc = { root: { props: {} }, content: [{ type: 'Text', props: { id: 'b' } }], zones: {} }

describe('Space page editor writes (LIVE-2347)', () => {
  beforeEach(() => {
    mocks.snapshot = {
      spotlight: { published: false },
      websitePublished: false,
      puck: doc,
      pageDocs: { home: { ...doc, content: [{ type: 'Heading', props: { id: 'a' } }] } },
    }
    mocks.patches = []
    mocks.updates = []
  })

  it('publish patches pageDocs alone', async () => {
    const res = await publishSpaceLanding('hearts', doc as never)
    expect(res).not.toHaveProperty('error')
    expect(mocks.patches).toHaveLength(1)
    expect(Object.keys(mocks.patches[0])).toEqual(['pageDocs'])
    expect(mocks.updates).toEqual([])
  })

  it('a Home reset patches pageDocs and drops the legacy doc in one call', async () => {
    const res = await resetSpaceLanding('hearts')
    expect(res).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ pageDocs: {}, puck: null }])
    expect(mocks.updates).toEqual([])
  })
})
