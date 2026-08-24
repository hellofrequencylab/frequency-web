import { describe, it, expect, beforeEach, vi } from 'vitest'

// sendFriendRequest's BLOCKING gate (LIVE-092, ADR-036).
//
// This path was the one contact-initiating action in the app that never consulted the block
// list, while six siblings did. What made the omission repeatable rather than a one-off is the
// pair of DELETEs on either side of it: blockUser drops the friendship row, and
// declineFriendRequest drops it again "so the requester can try again later". So the loop
// block → request → notification → decline → repeat ran indefinitely, and each turn wrote a
// notifications row addressed to the very person who blocked them.
//
// Both assertions below matter, and the notifications one matters most: the harm here is the
// notification reaching the blocker, not the friendships row itself.

const { getUser, profilesMaybeSingle, isBlockedBetween, friendshipsInsert, notificationsInsert } = vi.hoisted(
  () => ({
    getUser: vi.fn(),
    profilesMaybeSingle: vi.fn(),
    isBlockedBetween: vi.fn(),
    friendshipsInsert: vi.fn(),
    notificationsInsert: vi.fn(),
  }),
)

vi.mock('@/lib/blocking', () => ({ isBlockedBetween }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: profilesMaybeSingle }) }),
      insert: (row: unknown) => {
        if (table === 'friendships') return friendshipsInsert(row)
        if (table === 'notifications') return notificationsInsert(row)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { sendFriendRequest } from './friend-actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'me-1', display_name: 'Ada', handle: 'ada' } })
  isBlockedBetween.mockResolvedValue(false)
  friendshipsInsert.mockResolvedValue({ error: null })
  notificationsInsert.mockResolvedValue({ error: null })
})

describe('sendFriendRequest - blocking gate (LIVE-092)', () => {
  it('writes NO friendship row and NO notification when either party has blocked the other', async () => {
    isBlockedBetween.mockResolvedValue(true)
    const res = await sendFriendRequest('them-1')
    expect(res).toEqual({ error: 'You cannot connect with this member.' })
    expect(friendshipsInsert).not.toHaveBeenCalled()
    // THE GUARANTEE: nothing reaches the person who blocked them.
    expect(notificationsInsert).not.toHaveBeenCalled()
  })

  it('is bidirectional — it refuses whichever way the block runs', async () => {
    // isBlockedBetween is symmetric by construction (is_blocked_between RPC), so the gate must
    // consult it rather than a one-directional hasBlocked(). The profile page's own guard asks
    // only "did I block them", which is why the BLOCKED viewer still saw a live button.
    isBlockedBetween.mockResolvedValue(true)
    await sendFriendRequest('them-1')
    expect(isBlockedBetween).toHaveBeenCalledWith('me-1', 'them-1')
  })

  it('still sends the request and notifies when nobody is blocked', async () => {
    const res = await sendFriendRequest('them-1')
    expect(res).toEqual({ data: undefined })
    expect(friendshipsInsert).toHaveBeenCalledTimes(1)
    expect(friendshipsInsert.mock.calls[0][0]).toMatchObject({ requested_by: 'me-1', status: 'pending' })
    expect(notificationsInsert).toHaveBeenCalledTimes(1)
    expect(notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'them-1',
      actor_id: 'me-1',
      type: 'friend_request',
    })
  })

  it('refuses to friend yourself before it reaches the block check', async () => {
    const res = await sendFriendRequest('me-1')
    expect(res).toEqual({ error: 'Cannot friend yourself' })
    expect(isBlockedBetween).not.toHaveBeenCalled()
    expect(friendshipsInsert).not.toHaveBeenCalled()
  })
})
