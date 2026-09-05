import { describe, it, expect, vi, beforeEach } from 'vitest'

// The owner's grid / theme / background writers (scan2 L6-09): each writes ONLY its own key
// (`entityGrid`, or the `spotlight` sub-object) through merge_profile_meta on the session client.
// An empty grid layout REMOVES entityGrid rather than writing a blob without it.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  me: {} as Record<string, unknown>,
  updates: [] as unknown[],
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
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/spotlight/top-friends', () => ({
  normalizeTopFriendIds: vi.fn(),
  keepAcceptedFriends: vi.fn(),
  toTopFriendRows: vi.fn(),
  rewriteTopFriends: vi.fn(),
  deleteOneTopFriend: vi.fn(),
  getOwnerTopFriendIds: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { saveMemberGridLayout, setSpotlightTheme, setSpotlightBackground } from './spotlight-actions'

type RpcCall = [string, { p_profile_id: string; p_patch?: Record<string, unknown>; p_keys?: string[] }]
const rpcCalls = () => mocks.rpc.mock.calls as unknown as RpcCall[]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.me = {
    id: 'p1',
    handle: 'sam',
    meta: { practiceStreak: { current: 4 }, spotlight: { enabled: true, published: true } },
  }
})

describe('saveMemberGridLayout', () => {
  it('merges only entityGrid for a real layout', async () => {
    const res = await saveMemberGridLayout({ rows: [{ id: 'r0', columns: 1, cells: [['links']] }] })
    expect(res).toEqual({})
    expect(mocks.updates).toEqual([])
    expect(rpcCalls()).toHaveLength(1)
    expect(rpcCalls()[0][0]).toBe('merge_profile_meta')
    expect(rpcCalls()[0][1].p_profile_id).toBe('p1')
    expect(Object.keys(rpcCalls()[0][1].p_patch!)).toEqual(['entityGrid'])
  })

  it('removes entityGrid for an empty layout, and returns the merge error verbatim', async () => {
    await saveMemberGridLayout(null)
    expect(rpcCalls()).toEqual([['remove_profile_meta_keys', { p_profile_id: 'p1', p_keys: ['entityGrid'] }]])
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await saveMemberGridLayout(null)).toEqual({ error: 'boom' })
  })
})

describe('setSpotlightTheme / setSpotlightBackground', () => {
  it('each merges only the spotlight key, keeping enabled + published beside the new node', async () => {
    await setSpotlightTheme({})
    const theme = rpcCalls()[0][1].p_patch!
    expect(Object.keys(theme)).toEqual(['spotlight'])
    expect(theme.spotlight).toMatchObject({ enabled: true, published: true })
    expect((theme.spotlight as { theme: unknown }).theme).toBeTruthy()

    await setSpotlightBackground(null)
    const bg = rpcCalls()[1][1].p_patch!
    expect(Object.keys(bg)).toEqual(['spotlight'])
    expect(bg.spotlight).toMatchObject({ enabled: true, published: true })
    expect(mocks.updates).toEqual([])
  })

  it('refuses when Spotlight is off, before any write', async () => {
    mocks.me = { id: 'p1', handle: 'sam', meta: {} }
    expect(await setSpotlightTheme({})).toEqual({ error: 'Your Spotlight page is not turned on yet.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns the merge error and does not revalidate', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await setSpotlightBackground(null)).toEqual({ error: 'boom' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
