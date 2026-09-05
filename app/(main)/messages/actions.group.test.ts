import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-07 (2026-09-05): creating a group chat inserts the room, then the members (creator
// included), and reads the members insert's error. On a refused members write the room row is
// removed and the action fails instead of returning an id the creator cannot open.

const { getMyProfileId, roomsInsert, membersInsert, roomsDelete, friendships, revalidatePath } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  roomsInsert: vi.fn(),
  membersInsert: vi.fn(),
  roomsDelete: vi.fn(),
  friendships: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireProfileId: getMyProfileId }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: async () => false }))
vi.mock('@/lib/messages/direct-conversation', () => ({ findOrCreateDirectConversation: vi.fn() }))
vi.mock('@/lib/messages/dm-destination', () => ({ dmThreadHref: (id: string) => `/messages/${id}` }))
vi.mock('@/lib/crm/interactions', () => ({ recordContactInteraction: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        or: () => ({ eq: friendships }),
      }),
      insert: (rows: unknown) => {
        if (table === 'rooms') {
          return { select: () => ({ single: async () => roomsInsert(rows) }) }
        }
        return membersInsert(rows)
      },
      delete: () => ({ eq: async (col: string, val: string) => roomsDelete(table, col, val) }),
    }),
  }),
}))

import { startGroupConversation } from './actions'

const ME = 'aaaaaaaa-0000-0000-0000-000000000001'
const FRIEND = 'bbbbbbbb-0000-0000-0000-000000000002'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getMyProfileId.mockResolvedValue(ME)
  friendships.mockResolvedValue({ data: [{ user_a_id: ME, user_b_id: FRIEND }], error: null })
  roomsInsert.mockResolvedValue({ data: { id: 'room-1' }, error: null })
  membersInsert.mockResolvedValue({ error: null })
  roomsDelete.mockResolvedValue({ error: null })
})

describe('startGroupConversation', () => {
  it('inserts the room, then the members with the creator as admin, and returns the id', async () => {
    const res = await startGroupConversation([FRIEND], 'Trail crew')
    expect(res).toEqual({ id: 'room-1' })
    expect(membersInsert).toHaveBeenCalledWith([
      { room_id: 'room-1', profile_id: ME, is_admin: true },
      { room_id: 'room-1', profile_id: FRIEND, is_admin: false },
    ])
    expect(roomsDelete).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/messages')
  })

  it('fails and removes the room when the members insert is refused (no redirect into an empty room)', async () => {
    membersInsert.mockResolvedValue({ error: { message: 'permission denied', code: '42501' } })
    await expect(startGroupConversation([FRIEND], 'Trail crew')).rejects.toThrow(
      'Could not create the group chat. Try again.',
    )
    expect(roomsDelete).toHaveBeenCalledWith('rooms', 'id', 'room-1')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('still fails, and logs the room it could not remove, when the delete is refused too', async () => {
    membersInsert.mockResolvedValue({ error: { message: 'permission denied', code: '42501' } })
    roomsDelete.mockResolvedValue({ error: { message: 'refused', code: '42501' } })
    await expect(startGroupConversation([FRIEND], null)).rejects.toThrow('Could not create the group chat. Try again.')
    expect(console.error).toHaveBeenCalledWith(
      '[startGroupConversation] empty room could not be removed',
      expect.objectContaining({ roomId: 'room-1' }),
    )
  })
})
