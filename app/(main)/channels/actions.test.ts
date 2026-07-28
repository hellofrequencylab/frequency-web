import { describe, it, expect, beforeEach, vi } from 'vitest'

// startChapterAction gate (Programs on Channels, ADR-864; tightened by ADR-891).
// The contract under test: the gate mirrors remixTemplateAction EXACTLY — a
// signed-in REAL member WITH the circle.create capability (ADR-414: paid tier,
// Crew role, or staff; Crew is free during the beta) may start a Chapter. Demo
// profiles, anonymous visitors, and members without the capability may not —
// a Chapter IS a Circle the caller hosts, so it takes the creation gate. The
// heavy lifting is delegated to lib/channels/programs.startChapter.

const { getUser, profilesMaybeSingle, startChapter, assertCanCreate } = vi.hoisted(() => ({
  getUser: vi.fn(),
  profilesMaybeSingle: vi.fn(),
  startChapter: vi.fn(),
  assertCanCreate: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/channels/programs', () => ({ startChapter }))
vi.mock('@/lib/core/load-capabilities', () => ({ assertCanCreate }))
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
  assertCanCreate.mockResolvedValue(undefined)
  startChapter.mockResolvedValue({ circleId: 'circle-1', slug: 'breathwork-basics-oakland' })
})

describe('startChapterAction — the Remix gate, mirrored', () => {
  it('lets a real member with circle.create start a Chapter and returns the draft handle', async () => {
    const res = await startChapterAction('channel-1')
    expect(assertCanCreate).toHaveBeenCalledWith('circle.create')
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

  it('rejects a member without circle.create — a Chapter is a Circle (ADR-891)', async () => {
    assertCanCreate.mockRejectedValue(new Error('Crew is free during the beta.'))
    await expect(startChapterAction('channel-1')).rejects.toThrow('Crew is free during the beta.')
    expect(startChapter).not.toHaveBeenCalled()
  })
})
