import { describe, it, expect, beforeEach, vi } from 'vitest'

// getAppearanceRailData (ADR-525) — the read-gated bundle behind the Spotlight appearance rail module. It
// RE-GATES on the authed viewer (reads only the caller's own row + only their accepted friends) and returns
// null when signed out. The stored theme/background are VALIDATED here (the read-side security boundary), so
// the module always seeds from a safe subset.

const { getUser, maybeSingle, capsHas, getTopFriendsForOwner, getAcceptedFriendsForPicker } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    maybeSingle: vi.fn(),
    capsHas: vi.fn(),
    getTopFriendsForOwner: vi.fn(),
    getAcceptedFriendsForPicker: vi.fn(),
  }),
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))
vi.mock('@/lib/core/load-capabilities', () => ({
  getProfileCapabilities: async () => ({ has: capsHas }),
}))
vi.mock('@/lib/spotlight/top-friends', () => ({
  getTopFriendsForOwner,
  getAcceptedFriendsForPicker,
}))

import { getAppearanceRailData } from './rail-getters'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  maybeSingle.mockResolvedValue({
    data: {
      id: 'p1',
      handle: 'ada',
      profile_theme: 'midnight',
      meta: {
        spotlight: {
          enabled: true,
          theme: { header: { show: true, height: 5000, focusY: 40 } }, // height clamped to 360
          background: { assetPath: 'auth-1/spotlight/x.png', dim: 30 },
        },
      },
    },
  })
  capsHas.mockReturnValue(true)
  getTopFriendsForOwner.mockResolvedValue([{ profileId: 'f1', handle: 'bo', displayName: 'Bo', avatarUrl: null }])
  getAcceptedFriendsForPicker.mockResolvedValue([
    { profileId: 'f1', handle: 'bo', displayName: 'Bo', avatarUrl: null },
    { profileId: 'f2', handle: 'cy', displayName: 'Cy', avatarUrl: null },
  ])
})

describe('getAppearanceRailData', () => {
  it('returns the validated appearance bundle for the authed owner', async () => {
    const data = await getAppearanceRailData()
    expect(data).not.toBeNull()
    expect(data!.handle).toBe('ada')
    expect(data!.profileTheme).toBe('midnight')
    expect(data!.spotlightEnabled).toBe(true)
    expect(data!.canEnableSpotlight).toBe(true)
    // Validated on read: the tampered height is clamped, the pinned asset path survives.
    expect(data!.theme.header.height).toBe(360)
    expect(data!.background.assetPath).toBe('auth-1/spotlight/x.png')
    expect(data!.background.dim).toBe(30)
    expect(data!.topFriends).toHaveLength(1)
    expect(data!.friendOptions).toHaveLength(2)
  })

  it('returns null when signed out (fail-safe)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getAppearanceRailData()).toBeNull()
  })

  it('returns null when the profile is missing', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    expect(await getAppearanceRailData()).toBeNull()
  })
})
