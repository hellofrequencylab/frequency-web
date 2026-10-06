import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { toPeerView } from '@/lib/contract/views'
import { fetchMessagesSummary } from '@/app/(main)/messages/popover-actions'

// GET /api/v1/messages (LIVE-716): the caller's inbox, rooms and conversations with their unread
// counts, through the same reader as the web's message dock (RLS as the caller).

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'messages')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const s = await asCaller(auth, () => fetchMessagesSummary())
    return ok({
      totalUnread: s.totalUnread,
      rooms: s.rooms.map((r) => ({ id: r.id, name: r.name, visibility: r.visibility, lastMessageAt: r.last_message_at, unread: r.unread })),
      conversations: s.conversations.map((c) => ({
        id: c.id,
        name: c.name,
        participants: c.participants.map(toPeerView),
        lastMessage: c.lastMessage ? { body: c.lastMessage.body, createdAt: c.lastMessage.created_at } : null,
        unread: c.unread,
      })),
    })
  } catch (e) {
    return failFrom(e)
  }
}
