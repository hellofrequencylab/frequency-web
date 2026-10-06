import { z } from 'zod'
import { messageSendInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toPeerView } from '@/lib/contract/views'
import { loadDockRoomThread } from '@/app/(main)/messages/popover-actions'
import { sendRoomMessage } from '@/app/(main)/messages/rooms/actions'

// /api/v1/messages/rooms/{roomId} (LIVE-716): GET reads a room (the newest 100, oldest first) with
// whether the caller may post; POST { body } posts. The web's functions: the read gate under RLS,
// and the post gate (membership, or tuned in for a Channel room).

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'messages-room')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const room = await asCaller(auth, () => loadDockRoomThread(id))
    if (!room) return fail('not_found', 'That room could not be found.')
    return ok({
      id,
      name: room.name,
      visibility: room.visibility,
      canPost: room.canPost,
      messages: room.messages.map((m) => ({
        id: m.id,
        authorId: m.author_id,
        body: m.body,
        createdAt: m.created_at,
        author: m.author ? toPeerView(m.author) : null,
      })),
    })
  } catch (e) {
    return failFrom(e)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'messages-room-send', { limit: 60, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const { body } = readInput(messageSendInput, await request.json().catch(() => null))
    try {
      await asCaller(auth, () => sendRoomMessage(id, body))
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (message === 'Room not found') return fail('not_found', 'That room could not be found.')
      if (/^(Tune into|You must join)/.test(message)) return fail('forbidden', message)
      throw e
    }
    return ok({ sent: true as const }, { status: 201 })
  } catch (e) {
    return failFrom(e)
  }
}
