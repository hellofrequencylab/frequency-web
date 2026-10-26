/**
 * Person-to-person event notices (a share, a placement, a host transfer, a co-host invite)
 * on the notification router. One seam for the four event action files: it drops the actor
 * and duplicates, then routes the `event.notice` registry row to each person, so each
 * recipient's own inapp_events switch, suppression and the outbox retry apply.
 * Best-effort: a notice never fails the action that raised it.
 */
import { routeNotification } from '@/lib/notifications/router'

export async function notifyEventPeople(
  recipientIds: string[],
  actorId: string | null,
  type: string,
  eventId: string,
  body: string,
): Promise<void> {
  const recipients = [...new Set(recipientIds)].filter((id) => id && id !== actorId)
  for (const profileId of recipients) {
    try {
      await routeNotification('event.notice', { profileId }, { type, actorId, eventId, body })
    } catch {
      /* best-effort */
    }
  }
}
