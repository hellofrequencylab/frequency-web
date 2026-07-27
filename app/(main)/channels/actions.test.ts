import { describe, it, expect, beforeEach, vi } from 'vitest'

// startChapterAction gate (Programs on Channels, ADR-864). The contract under
// test: the gate mirrors remixTemplateAction EXACTLY — any signed-in REAL
// member may start a Chapter, demo profiles and anonymous visitors may not —
// and the heavy lifting is delegated to lib/channels/programs.startChapter.

const { getUser, profilesMaybeSingle, startChapter } = vi.hoisted(() => ({
  getUser: vi.fn(),
  profilesMaybeSingle: vi.fn(),
  startChapter: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/channels/programs', () => ({ startChapter }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: profilesMaybeSingle }) }),
    }),
  }),
}))

import { startChapterAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1', is_demo: false } })
  startChapter.mockResolvedValue({ circleId: 'circle-1', slug: 'breathwork-basics-oakland' })
})

describe('startChapterAction — the Remix gate, mirrored', () => {
  it('lets a signed-in real member start a Chapter and returns the draft handle', async () => {
    const res = await startChapterAction('channel-1')
    expect(startChapter).toHaveBeenCalledWith({ channelId: 'channel-1', profileId: 'profile-1' })
    expect(res).toEqual({ circleId: 'circle-1', slug: 'breathwork-basics-oakland' })
  })

  it('rejects anonymous visitors without touching the data layer', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Please sign in to start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })

  it('rejects demo profiles (same as remix)', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-demo', is_demo: true } })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Only real members can start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })

  it('rejects a user with no profile row', async () => {
    profilesMaybeSingle.mockResolvedValue({ data: null })
    await expect(startChapterAction('channel-1')).rejects.toThrow('Only real members can start a Chapter.')
    expect(startChapter).not.toHaveBeenCalled()
  })
})
