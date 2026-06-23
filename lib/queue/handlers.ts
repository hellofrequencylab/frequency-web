// Shared queue job handlers — used by the cron drain (/api/cron/process-queue)
// AND by the manual "send now" Studio action, so both run identical send logic.

import type { JobHandler } from '@/lib/queue/outbox'
import { sendPushToProfile, type PushPayload } from '@/lib/push'
import { sendRawEmail } from '@/lib/email'
import type { SendCategory } from '@/lib/comms/send-gate'

export const queueHandlers: Record<string, JobHandler> = {
  // Durable web push. payload: { profileId, payload: PushPayload, category: SendCategory }.
  push: async (p) => {
    const profileId = p.profileId as string
    // Throw (don't silently no-op): a malformed job should surface as a
    // dead-letter for inspection, not be marked done as if it succeeded.
    if (!profileId || !p.payload) throw new Error('push job missing profileId or payload')
    await sendPushToProfile(profileId, p.payload as PushPayload, (p.category as SendCategory) ?? 'dispatches')
  },
  // Durable email (ADR-026). payload: { to, subject, html, text?, headers?, from?, replyTo? }.
  // `from`/`replyTo` carry the per-Space sender identity enqueueEmail serialized
  // (lib/email.ts EmailPayload); dropping them here sent Space outreach from the platform
  // default and routed replies to noreply, so pass them straight through.
  email: async (p) => {
    if (!p.to || !p.subject) throw new Error('email job missing to or subject')
    await sendRawEmail({
      to: p.to as string,
      subject: p.subject as string,
      html: (p.html as string) ?? '',
      text: typeof p.text === 'string' ? p.text : undefined,
      headers: (p.headers as Record<string, string> | undefined) ?? undefined,
      from: typeof p.from === 'string' ? p.from : undefined,
      replyTo:
        typeof p.replyTo === 'string' || Array.isArray(p.replyTo)
          ? (p.replyTo as string | string[])
          : undefined,
    })
  },
}
