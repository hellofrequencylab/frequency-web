import { createAdminClient } from '@/lib/supabase/admin'
import type { JobHandler } from '@/lib/queue/outbox'

// The 'inapp' outbox handler: writes ONE `notifications` row, the table the bell and
// /notifications read. The router (./router.ts) enqueues it after the member's own
// `inapp_<category>` switch, suppression and per-subject mute have passed the send-gate, so this
// stays a plain write. It throws on a failed insert so the drain retries and, past the cap,
// dead-letters, instead of marking a missing bell row as sent.
//
// authz-delegated: this handler is caller-trusted (ADR-274). It is reachable only from the outbox
// drain, never from a request, and a job exists only because routeNotification enqueued it after the
// recipient's own send-gate passed. The gate lives at the enqueue site, not here.

export const INAPP_JOB_KIND = 'inapp'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export const runInappNotification: JobHandler = async (payload) => {
  const profileId = text(payload.profileId)
  const type = text(payload.type)
  const body = text(payload.body)
  if (!profileId || !type || !body) throw new Error('inapp job missing profileId, type or body')

  const { error } = await createAdminClient()
    .from('notifications')
    .insert({
      recipient_id: profileId,
      actor_id: text(payload.actorId),
      type,
      reference_type: text(payload.referenceType),
      reference_id: text(payload.referenceId),
      body,
    })
  if (error) throw new Error(`inapp insert failed: ${error.message}`)
}
