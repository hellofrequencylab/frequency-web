import { beforeEach, describe, expect, it, vi } from 'vitest'
import { profileResponse, publicProfileResponse } from '@/lib/contract'

// /api/v1/profile (LIVE-716): my profile, editing it through the web's updateProfile, and a
// member's public profile.

let authOk = true
let own: Record<string, string | null> = {}
const updateProfile = vi.fn()
const getPublicProfileByHandle = vi.fn()
const hasBlocked = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/app/(main)/settings/profile/actions', () => ({ updateProfile }))
vi.mock('@/lib/profiles/public-profile', () => ({ getPublicProfileByHandle }))
vi.mock('@/lib/blocking', () => ({ hasBlocked }))
vi.mock('@/lib/supabase/server', () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: own, error: null }) }
  return { createClient: async () => ({ from: () => q, auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } }) }
})

beforeEach(() => {
  authOk = true
  own = {
    id: 'p-1',
    handle: 'ana',
    display_name: 'Ana',
    avatar_url: null,
    header_image_url: null,
    bio: 'hi',
    website: null,
    city: 'Austin',
    phone: '555',
    community_role: 'member',
    membership_tier: 'free',
    created_at: '2026-01-01T00:00:00Z',
  }
  updateProfile.mockReset().mockResolvedValue(undefined)
  getPublicProfileByHandle.mockReset().mockResolvedValue({ ...own, id: 'p-2', handle: 'ben', city: undefined, phone: undefined })
  hasBlocked.mockReset().mockResolvedValue(true)
})

describe('/api/v1/profile', () => {
  it('reads my profile', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/profile'))).json()
    expect(profileResponse.safeParse(json).success).toBe(true)
    expect(json.data).toMatchObject({ handle: 'ana', city: 'Austin' })
  })

  it('edits only the fields sent, keeping the rest (phone included) as stored', async () => {
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('https://x/api', { method: 'PATCH', body: JSON.stringify({ bio: 'new' }) }))
    expect(res.status).toBe(200)
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Ana',
      handle: 'ana',
      bio: 'new',
      website: '',
      city: 'Austin',
      phone: '555',
      avatarUrl: '',
    })
  })

  it('answers a taken handle with conflict', async () => {
    updateProfile.mockRejectedValue(new Error('That handle is already taken.'))
    const { PATCH } = await import('./route')
    const res = await PATCH(new Request('https://x/api', { method: 'PATCH', body: JSON.stringify({ handle: 'ben' }) }))
    expect(res.status).toBe(409)
  })

  it('reads a public profile without private fields', async () => {
    const { GET } = await import('./[handle]/route')
    const json = await (await GET(new Request('https://x/api'), { params: Promise.resolve({ handle: 'Ben' }) })).json()
    expect(publicProfileResponse.safeParse(json).success).toBe(true)
    expect(json.data).not.toHaveProperty('city')
    expect(json.data.blockedByMe).toBe(true)
    expect(getPublicProfileByHandle).toHaveBeenCalledWith('ben')
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { PATCH } = await import('./route')
    expect((await PATCH(new Request('https://x/api', { method: 'PATCH', body: '{}' }))).status).toBe(401)
    expect(updateProfile).not.toHaveBeenCalled()
  })
})
