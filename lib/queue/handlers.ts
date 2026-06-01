// Shared queue job handlers — used by the cron drain (/api/cron/process-queue)
// AND by the manual "send now" Studio action, so both run identical send logic.

import type { JobHandler } from '@/lib/queue/outbox'
import { sendPushToProfile } from '@/lib/push'
import { sendRawEmail } from '@/lib/email'

export const queueHandlers: Record<string, JobHandler> = {
  // Durable web push. payload: { profileId, payload: PushPayload }.
  push: async (p) => {
    const profileId = p.profileId as string
    // Throw (don't silently no-op): a malformed job should surface as a
    // dead-letter for inspection, not be marked done as if it succeeded.
    if (!profileId || !p.payload) throw new Error('push job missing profileId or payload')
    await sendPushToProfile(profileId, p.payload as Parameters<typeof sendPushToProfile>[1])
  },
  // Durable email (ADR-026). payload: { to, subject, html, text?, headers? }.
  email: async (p) => {
    if (!p.to || !p.subject) throw new Error('email job missing to or subject')
    await sendRawEmail({
      to: p.to as string,
      subject: p.subject as string,
      html: (p.html as string) ?? '',
      text: typeof p.text === 'string' ? p.text : undefined,
      headers: (p.headers as Record<string, string> | undefined) ?? undefined,
    })
  },
}
