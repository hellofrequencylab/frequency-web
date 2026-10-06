import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageSendResponse, messagesSummaryResponse, roomThreadResponse, threadResponse } from '@/lib/contract'

// /api/v1/messages (LIVE-716): the inbox, a conversation, a room, and sending, all the web's.

let authOk = true
const fetchMessagesSummary = vi.fn()
const loadDockDmThread = vi.fn()
const loadDockRoomThread = vi.fn()
const sendMessage = vi.fn()
const sendRoomMessage = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/app/(main)/messages/popover-actions', () => ({ fetchMessagesSummary, loadDockDmThread, loadDockRoomThread }))
vi.mock('@/app/(main)/messages/actions', () => ({ sendMessage }))
vi.mock('@/app/(main)/messages/rooms/actions', () => ({ sendRoomMessage }))

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const peer = { id: 'a-1', display_name: 'Ana', handle: 'ana', avatar_url: null }
const ctx = () => ({ params: Promise.resolve({ id: ID }) })

beforeEach(() => {
  authOk = true
  fetchMessagesSummary.mockReset().mockResolvedValue({
    totalUnread: 2,
    rooms: [{ id: 'r1', name: 'Lobby', visibility: 'public', last_message_at: null, unread: 1 }],
    conversations: [{ id: ID, name: null, participants: [peer], lastMessage: { body: 'yo', created_at: '2026-10-06T00:00:00Z' }, unread: 1 }],
  })
  loadDockDmThread.mockReset().mockResolvedValue({
    myProfileId: 'p-1',
    participants: [peer],
    messages: [{ id: 'm1', conversation_id: ID, sender_id: 'a-1', body: 'yo', created_at: '2026-10-06T00:00:00Z' }],
    title: 'Ana',
    name: null,
  })
  loadDockRoomThread.mockReset().mockResolvedValue({ myProfileId: 'p-1', messages: [], canPost: false, name: 'Lobby', visibility: 'channel' })
  sendMessage.mockReset().mockResolvedValue(undefined)
  sendRoomMessage.mockReset().mockResolvedValue(undefined)
})

describe('/api/v1/messages', () => {
  it('reads the inbox', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/messages'))).json()
    expect(messagesSummaryResponse.safeParse(json).success).toBe(true)
    expect(json.data.conversations[0].lastMessage).toEqual({ body: 'yo', createdAt: '2026-10-06T00:00:00Z' })
  })

  it('reads a conversation, and not_found when the caller is not in it', async () => {
    const { GET } = await import('./[id]/route')
    expect(threadResponse.safeParse(await (await GET(new Request('https://x/api'), ctx())).json()).success).toBe(true)
    loadDockDmThread.mockResolvedValue(null)
    expect((await GET(new Request('https://x/api'), ctx())).status).toBe(404)
  })

  it('sends, and a blocked send is forbidden', async () => {
    const { POST } = await import('./[id]/route')
    const res = await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ body: ' hi ' }) }), ctx())
    expect(res.status).toBe(201)
    expect(messageSendResponse.safeParse(await res.json()).success).toBe(true)
    expect((sendMessage.mock.calls[0][1] as FormData).get('body')).toBe('hi')
    sendMessage.mockRejectedValue(new Error('You cannot message this member'))
    const blocked = await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ body: 'hi' }) }), ctx())
    expect(blocked.status).toBe(403)
  })

  it('reads a room and refuses a post from someone not tuned in', async () => {
    const { GET, POST } = await import('./rooms/[id]/route')
    expect(roomThreadResponse.safeParse(await (await GET(new Request('https://x/api'), ctx())).json()).success).toBe(true)
    sendRoomMessage.mockRejectedValue(new Error('Tune into this channel to post.'))
    const res = await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ body: 'hi' }) }), ctx())
    expect(res.status).toBe(403)
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { GET } = await import('./route')
    expect((await GET(new Request('https://x/api/v1/messages'))).status).toBe(401)
    expect(fetchMessagesSummary).not.toHaveBeenCalled()
  })
})
