import 'server-only'
import { enqueue } from '@/lib/queue/outbox'
import { log } from '@/lib/log'
import { routeNotification } from './router'
import type { NotificationContexts, NotificationRecipient } from './registry'
import { HUB_LADDER_KIND, LADDER_DELAY_MS, ladderKey, type LadderRung } from './ladder'

// SENDING A HUB NOTICE UP THE LADDER (EMAIL-091). The bell goes at once through the router; the push
// and (for a tag) the email are delayed 'hub-ladder' jobs that look again before they send, so a
// notice read in the meantime goes no further. See lib/notifications/ladder.ts for the rules and
// lib/notifications/inapp.ts runHubLadder for the job.

type LadderEvent = 'item.mention' | 'item.comment'

export async function routeLadder<E extends LadderEvent>(event: E, recipient: NotificationRecipient, ctx: NotificationContexts[E]): Promise<void> {
  const { profileId } = recipient
  await routeNotification(event, { profileId, subject: recipient.subject }, ctx, { only: ['inapp'] })
  const now = Date.now()
  const thread = `${ctx.referenceType}:${ctx.referenceId}`
  const rungs: LadderRung[] = event === 'item.mention' ? ['push', 'email'] : ['push']
  for (const rung of rungs) {
    try {
      await enqueue(
        HUB_LADDER_KIND,
        { rung, event, profileId, subject: recipient.subject ?? null, ctx, since: new Date(now).toISOString() },
        { runAfter: new Date(now + LADDER_DELAY_MS[rung]), dedupeKey: ladderKey(rung, profileId, thread, now), maxAttempts: 3 },
      )
    } catch (err) {
      log.warn('notifications.ladder_enqueue_failed', { rung, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
