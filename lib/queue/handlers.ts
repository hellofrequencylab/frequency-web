// Shared queue job handlers — used by the cron drain (/api/cron/process-queue)
// AND by the manual "send now" Studio action, so both run identical send logic.

import type { JobHandler } from '@/lib/queue/outbox'
import { sendPushToProfile, type PushPayload } from '@/lib/push'
import { sendRawEmail } from '@/lib/email'
import { sendRawSms } from '@/lib/comms/sms-send'
import { recordContactInteraction } from '@/lib/crm/interactions'
import type { SendCategory } from '@/lib/comms/send-gate'
import { RESEARCH_JOB_KIND, researchHandler } from '@/lib/importer/queue'

export const queueHandlers: Record<string, JobHandler> = {
  // Smart Business Importer research run (harvest -> extract -> verify), a durable
  // background job (docs/BUSINESS-IMPORTER.md §6.2). Lands the intake in 'review' with a
  // verified, ledgered draft; a soft failure is recorded on the row's status.
  [RESEARCH_JOB_KIND]: researchHandler,
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
  // Durable SMS (ADR-256). payload: { to, body, profileId? }. sendRawSms is itself
  // fail-closed (no-op + null when SMS is not provisioned), so a job drained before
  // the legal track is live simply marks done without touching the provider. On a
  // real send it records an outbound 'sms' touch on the contact timeline (the
  // recipient as the subject). The interaction write is best-effort — a logging
  // failure must never re-send the text — so it never throws back into the drain.
  sms: async (p) => {
    if (!p.to || !p.body) throw new Error('sms job missing to or body')
    const to = p.to as string
    const sid = await sendRawSms({ to, body: p.body as string })
    // Only log a touch when something was actually sent (sid present). When SMS is
    // gated, sid is null and there is nothing to record.
    if (sid) {
      const profileId = typeof p.profileId === 'string' ? p.profileId : null
      if (profileId) {
        await recordContactInteraction({
          ownerProfileId: profileId,
          subjectKind: 'profile',
          subjectId: profileId,
          channel: 'sms',
          direction: 'outbound',
          summary: typeof p.body === 'string' ? p.body : null,
          source: 'engagement',
          metadata: { provider: 'twilio', message_sid: sid, to },
        })
      }
    }
  },
}
