import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { toNotificationView } from '@/lib/contract/views'
import { getMyNotifications, getUnreadCount } from '@/app/(main)/notifications/actions'
import { UNREAD_COUNT_UNAVAILABLE } from '@/lib/notifications-map'

// GET /api/v1/notifications (LIVE-716): the caller's newest 30 notifications and the unread count,
// through the web's readers (the my_notifications RPCs, RLS as the caller). A failed list is
// `internal`, never an empty list; a failed count is `unread: null`, never a false zero.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'notifications')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const [list, unread] = await asCaller(auth, () => Promise.all([getMyNotifications(), getUnreadCount()]))
    if (list.kind === 'error') return fail('internal', 'Notifications did not load. Try again.')
    return ok({
      items: list.items.map(toNotificationView),
      nextCursor: null,
      unread: unread === UNREAD_COUNT_UNAVAILABLE ? null : unread,
    })
  } catch (e) {
    return failFrom(e)
  }
}
