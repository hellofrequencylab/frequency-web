import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2350: an email-style save or clear sends only the emailStyle key through set_space_preferences, so a
// key another console saved after the read (a Spotlight publish) is never written back stale, and no
// whole-blob update is made.
const mocks = vi.hoisted(() => ({
  stored: {} as Record<string, unknown>,
  patches: [] as Record<string, unknown>[],
  updates: [] as unknown[],
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'owner' }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', preferences: {} }),
  patchSpacePreferences: async (_id: string, patch: Record<string, unknown>) => {
    mocks.patches.push(patch)
    return true
  },
}))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: async () => ({ canEditProfile: true }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferences: mocks.stored } }) }) }),
      update: (v: unknown) => ({
        eq: async () => {
          mocks.updates.push(v)
          return { error: null }
        },
      }),
    }),
  }),
}))

import { setSpaceEmailStyle } from './email-style-actions'

describe('Space email style writes (LIVE-2350)', () => {
  beforeEach(() => {
    mocks.stored = { spotlight: { published: true }, emailStyle: { primary: '#112233' } }
    mocks.patches = []
    mocks.updates = []
  })

  it('a save patches emailStyle alone', async () => {
    const res = await setSpaceEmailStyle('hearts', { primary: '#445566' })
    expect(res).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ emailStyle: { primary: '#445566' } }])
    expect(mocks.updates).toEqual([])
  })

  it('a clear sends emailStyle as null and nothing else', async () => {
    const res = await setSpaceEmailStyle('hearts', {})
    expect(res).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([{ emailStyle: null }])
    expect(mocks.updates).toEqual([])
  })

  it('an unchanged style writes nothing', async () => {
    const res = await setSpaceEmailStyle('hearts', { primary: '#112233' })
    expect(res).not.toHaveProperty('error')
    expect(mocks.patches).toEqual([])
    expect(mocks.updates).toEqual([])
  })
})
