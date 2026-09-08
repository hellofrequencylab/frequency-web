import { describe, it, expect, beforeEach, vi } from 'vitest'

// setSpotlightStickers (ADR-1275): the owner-only writer for the sticker layer. Shaped exactly like
// setSpotlightBackground: SESSION-DERIVED (the row is found by the authed user's auth_user_id, never a
// caller-supplied owner id), requires Spotlight enabled, VALIDATES the layer before persist (unknown
// ids drop whole, coordinates clamp, the cap applies), and merges ONLY `stickers` inside the
// `spotlight` key through merge_profile_meta_path, so no sibling field is read back stale.

const { getUser, maybeSingle, update, rpc, eq } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          eq(col, val)
          return { maybeSingle }
        },
      }),
      update: (patch: unknown) => {
        update(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { setSpotlightStickers } from './spotlight-actions'
import { MAX_STICKERS } from '@/lib/spotlight/blocks/schema'

type Sent = { p_profile_id: string; p_path: string[]; p_patch: { stickers: { items: { id: string; x: number; y: number }[] } } }
function sent(): Sent {
  const [name, args] = rpc.mock.calls[0] as [string, Sent]
  expect(name).toBe('merge_profile_meta_path')
  expect(args.p_path).toEqual(['spotlight'])
  return args
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  rpc.mockResolvedValue({ data: {}, error: null })
  maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: { spotlight: { enabled: true } } } })
})

describe('setSpotlightStickers', () => {
  it('persists the validated layer under meta.spotlight.stickers, bound to the session owner', async () => {
    const res = await setSpotlightStickers({ items: [{ id: 'star', x: 10, y: 20 }] })
    expect(res).toEqual({})
    expect(update).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    const args = sent()
    expect(args.p_patch).toEqual({ stickers: { items: [{ id: 'star', x: 10, y: 20 }] } })
    // Session-derived: the row is looked up by the AUTHED user's id, and the write targets that row.
    expect(eq).toHaveBeenCalledWith('auth_user_id', 'auth-1')
    expect(args.p_profile_id).toBe('prof-1')
  })

  it('ignores any owner id the caller smuggles in: the target is always the session row', async () => {
    await setSpotlightStickers({ ownerProfileId: 'prof-victim', profileId: 'prof-victim', items: [{ id: 'star', x: 1, y: 1 }] })
    expect(sent().p_profile_id).toBe('prof-1')
    expect(eq).not.toHaveBeenCalledWith(expect.anything(), 'prof-victim')
  })

  it('validates before persist: unknown ids drop whole, coordinates clamp, the cap applies', async () => {
    const items = [
      { id: 'star', x: -5, y: 500 },
      { id: 'skull', x: 50, y: 50 },
      ...Array.from({ length: MAX_STICKERS + 4 }, () => ({ id: 'heart', x: 50, y: 50 })),
    ]
    await setSpotlightStickers({ items })
    const stored = sent().p_patch.stickers.items
    // The cap slices the RAW list first (validate.test.ts locks that), so one unknown id inside the
    // first MAX_STICKERS costs the layer a slot rather than smuggling an extra entry past the cap.
    expect(stored.length).toBe(MAX_STICKERS - 1)
    expect(stored[0]).toEqual({ id: 'star', x: 0, y: 100 })
    expect(stored.some((s) => s.id === 'skull')).toBe(false)
    expect(stored.slice(1).every((s) => s.id === 'heart')).toBe(true)
  })

  it('sends ONLY stickers, so the enabled / published flags it read are never carried back stale', async () => {
    await setSpotlightStickers({ items: [] })
    expect(Object.keys(sent().p_patch)).toEqual(['stickers'])
    expect(sent().p_patch.stickers).toEqual({ items: [] })
  })

  it('never throws on garbage input; an unusable layer clears to empty', async () => {
    expect(await setSpotlightStickers('nonsense')).toEqual({})
    expect(sent().p_patch.stickers).toEqual({ items: [] })
  })

  it('rejects a signed-out caller', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await setSpotlightStickers({ items: [] })).toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses when the session has no profile row', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    expect(await setSpotlightStickers({ items: [] })).toEqual({ error: 'Profile not found' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses when Spotlight is not enabled', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: {} } })
    expect(await setSpotlightStickers({ items: [] })).toEqual({ error: 'Your Spotlight page is not turned on yet.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('surfaces a write error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await setSpotlightStickers({ items: [] })).toEqual({ error: 'boom' })
  })
})
