import { describe, it, expect, vi, beforeEach } from 'vitest'

// The owner's own meta writers in settings/profile (scan2 L6-09). Every one used to spread the whole
// meta read back over the row through the session client. Now each writes ONLY its own key(s)
// through merge_profile_meta / remove_profile_meta_keys on the SAME session client (the RPC checks
// auth.uid() owns the row, so the self-scoping holds), and the top-level columns it also touches
// (avatar_url, the identity columns) go in a separate, checked update.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  getProfileCapabilities: vi.fn(),
  me: {} as Record<string, unknown>,
  updates: [] as unknown[],
  adminTaken: null as { id: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.me, error: null }) }) }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ neq: () => ({ maybeSingle: async () => ({ data: mocks.adminTaken, error: null }) }) }) }),
    }),
  }),
}))
vi.mock('@/lib/storage/profile-images', () => ({ uploadProfileImage: vi.fn() }))
vi.mock('@/lib/core/load-capabilities', () => ({ getProfileCapabilities: mocks.getProfileCapabilities }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  setSpotlightPublished,
  setMySpotlightEnabled,
  setProfileHeaderFocus,
  setProfileAvatarFocus,
  updateProfile,
} from './actions'

type RpcCall = [string, { p_profile_id: string; p_patch?: Record<string, unknown>; p_keys?: string[] }]
const rpcCalls = () => mocks.rpc.mock.calls as unknown as RpcCall[]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.adminTaken = null
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.getProfileCapabilities.mockResolvedValue(new Set(['spotlight.enable']))
  mocks.me = {
    id: 'p1',
    handle: 'sam',
    avatar_url: 'https://cdn.test/a.png',
    meta: { practiceStreak: { current: 4 }, spotlight: { enabled: true, published: false }, headerFocal: '10% 10%' },
  }
})

describe('Spotlight switches', () => {
  it('setSpotlightPublished merges only the spotlight key through the session client', async () => {
    await setSpotlightPublished(true)
    expect(mocks.updates).toEqual([])
    expect(rpcCalls()).toEqual([['merge_profile_meta', { p_profile_id: 'p1', p_patch: { spotlight: { enabled: true, published: true } } }]])
  })

  it('setMySpotlightEnabled(false) also unpublishes, inside the one spotlight key', async () => {
    await setMySpotlightEnabled(false)
    expect(rpcCalls()[0][1].p_patch).toEqual({ spotlight: { enabled: false, published: false } })
  })

  it('throws and does not revalidate when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(setSpotlightPublished(true)).rejects.toThrow('boom')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('header focus', () => {
  it('merges only headerFocal for a non-default focus', async () => {
    await setProfileHeaderFocus('30% 40%')
    expect(mocks.updates).toEqual([])
    expect(rpcCalls()).toEqual([['merge_profile_meta', { p_profile_id: 'p1', p_patch: { headerFocal: '30% 40%' } }]])
  })

  it('REMOVES headerFocal for the centered default (the stored meta stays sparse)', async () => {
    await setProfileHeaderFocus('50% 50%')
    expect(rpcCalls()).toEqual([['remove_profile_meta_keys', { p_profile_id: 'p1', p_keys: ['headerFocal'] }]])
  })
})

describe('avatar focus', () => {
  it('merges only avatarFocal, then mirrors the #fp fragment into avatar_url in a second checked update', async () => {
    await setProfileAvatarFocus('30% 40%')
    expect(rpcCalls()).toEqual([['merge_profile_meta', { p_profile_id: 'p1', p_patch: { avatarFocal: '30% 40%' } }]])
    expect(mocks.updates).toHaveLength(1)
    const u = mocks.updates[0] as { avatar_url: string; meta?: unknown }
    expect(u.avatar_url).toContain('https://cdn.test/a.png#fp=')
    expect('meta' in u).toBe(false)
  })

  it('leaves avatar_url alone when the meta write did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(setProfileAvatarFocus('30% 40%')).rejects.toThrow('boom')
    expect(mocks.updates).toEqual([])
  })
})

describe('updateProfile', () => {
  const base = { displayName: 'Sam', handle: 'sam', bio: '', avatarUrl: '' }

  it('writes the columns without meta, then merges the set keys and removes the defaulted ones', async () => {
    await updateProfile({ ...base, headerFocal: '30% 40%', headerOverlayStyle: 'none' })
    expect(mocks.updates).toHaveLength(1)
    expect('meta' in (mocks.updates[0] as object)).toBe(false)
    expect(rpcCalls()).toEqual([
      ['merge_profile_meta', { p_profile_id: 'p1', p_patch: { headerFocal: '30% 40%' } }],
      ['remove_profile_meta_keys', { p_profile_id: 'p1', p_keys: ['headerOverlayStyle', 'headerOverlayColor'] }],
    ])
  })

  it('touches no meta key it was not asked about', async () => {
    await updateProfile({ ...base, headerOverlayStyle: 'shadow', headerOverlayColor: '#112233' })
    expect(rpcCalls()).toEqual([
      ['merge_profile_meta', { p_profile_id: 'p1', p_patch: { headerOverlayStyle: 'shadow', headerOverlayColor: '#112233' } }],
    ])
  })

  it('makes no meta call at all when no meta field was sent', async () => {
    await updateProfile(base)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.updates).toHaveLength(1)
  })

  it('does not revalidate when the meta merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(updateProfile({ ...base, headerFocal: '30% 40%' })).rejects.toThrow('boom')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
