// EMAIL-070: a transactional email Resend ACCEPTED and then dropped for the daily limit goes back on
// the outbox for the next UTC day, once.
//
// Resend takes a send over the account's daily limit with a 200 and an id, and only later reports
// email.failed with reason reached_daily_quota. By then the outbox has settled the job as accepted
// (email_provider_attempts.state = 'accepted'), so without this the message is simply lost: 25 of
// them from Nov 12 to Nov 18, mostly event reminders. The Resend webhook calls this on that failure.
//
// Rules:
//   • Only a send the acceptance ledger knows (email_provider_attempts by provider_id). A legacy send
//     with no ledger row has no frozen payload to resend, so it stays dropped and is logged.
//   • Bulk stays dropped. A campaign already counts the send as failed, and requeueing a list fan-out
//     would spend tomorrow's quota on the very mail that caused the overflow.
//   • Once. The new job carries REQUEUE_OF_KEY, and a quota failure on a job that carries it is not
//     requeued again. The enqueue is keyed on the ORIGINAL queue job, so a redelivered webhook (or a
//     retry after a 503) can never queue the same message twice.

import { enqueue, laneFor, msUntilNextUtcMidnight } from '@/lib/queue/outbox'

/** The email.failed reason Resend reports for a send it accepted over the daily limit. */
export const DAILY_QUOTA_REASON = 'reached_daily_quota'

/** Stamped on the requeued job's payload: the queue job it replaces. The email handler ignores it. */
export const REQUEUE_OF_KEY = '__quotaRequeueOf'

/** True when an email.failed payload says the daily quota dropped it. Fail-soft: anything else is false. */
export function failedForDailyQuota(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as { failed?: { reason?: unknown } | null; reason?: unknown }
  return d.failed?.reason === DAILY_QUOTA_REASON || d.reason === DAILY_QUOTA_REASON
}

/** One recipient, as the email job handler expects. A frozen payload to several addresses is not ours. */
function singleRecipient(to: unknown): string | null {
  if (typeof to === 'string' && to.trim()) return to
  if (Array.isArray(to) && to.length === 1 && typeof to[0] === 'string' && to[0].trim()) return to[0]
  return null
}

/**
 * The `email` job payload that resends a frozen provider payload. Pure. `original` is the queue row's
 * own payload when it still exists, so the delivery provenance (deliveryContext) rides along. Returns
 * null when the frozen payload cannot be a single email (no recipient or no subject).
 */
export function requeuePayloadFrom(
  frozen: unknown,
  queueJobId: string,
  original?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!frozen || typeof frozen !== 'object' || Array.isArray(frozen)) return null
  const f = frozen as Record<string, unknown>
  const to = singleRecipient(f.to)
  if (!to || typeof f.subject !== 'string' || !f.subject) return null
  const out: Record<string, unknown> = { to, subject: f.subject, html: typeof f.html === 'string' ? f.html : '' }
  if (typeof f.text === 'string') out.text = f.text
  if (f.headers && typeof f.headers === 'object' && !Array.isArray(f.headers)) out.headers = f.headers
  if (typeof f.from === 'string') out.from = f.from
  if (typeof f.replyTo === 'string' || Array.isArray(f.replyTo)) out.replyTo = f.replyTo
  if (Array.isArray(f.tags)) out.tags = f.tags
  if (Array.isArray(f.attachments)) out.attachments = f.attachments
  if (original && original.deliveryContext !== undefined) out.deliveryContext = original.deliveryContext
  out[REQUEUE_OF_KEY] = queueJobId
  return out
}

export type QuotaRequeueOutcome =
  | 'requeued'          // back on the outbox for the next UTC day
  | 'duplicate'         // an earlier delivery of this webhook already requeued it
  | 'no-attempt'        // no acceptance-ledger row for this provider id (legacy send)
  | 'bulk'              // a list fan-out: stays dropped
  | 'already-requeued'  // this send was itself a requeue: once only
  | 'unsendable'        // the frozen payload is not one email to one person

/** One row lookup: `.from(t).select(cols).eq(col, v).maybeSingle()`. */
type RowLookup = {
  select: (cols: string) => {
    eq: (col: string, v: string) => {
      maybeSingle: () => PromiseLike<{ data: unknown; error: { message: string } | null }>
    }
  }
}

/**
 * The database the requeue reads, typed to the two lookups it makes. The caller passes its own
 * client (the Resend webhook's service-role client); this module never opens one itself, so the
 * RLS-bypassing client stays at the route that already holds it.
 */
export interface QuotaRequeueDb {
  from: (table: 'email_provider_attempts' | 'notification_queue') => RowLookup
}

/**
 * Requeue the transactional email behind `providerId` for the next UTC day. Throws on a database
 * error so the webhook answers 503 and Resend redelivers; the dedupe key makes that retry safe.
 */
export async function requeueQuotaFailedEmail(
  client: QuotaRequeueDb,
  providerId: string,
  now: Date = new Date(),
): Promise<QuotaRequeueOutcome> {
  const { data: attemptRow, error } = await client
    .from('email_provider_attempts')
    .select('queue_job_id, frozen_payload')
    .eq('provider_id', providerId)
    .maybeSingle()
  if (error) throw new Error(`quota requeue: attempt lookup failed: ${error.message}`)
  const attempt = attemptRow as { queue_job_id: string; frozen_payload: unknown } | null
  if (!attempt) return 'no-attempt'

  const queueJobId = attempt.queue_job_id
  const { data: jobRow, error: jobError } = await client
    .from('notification_queue')
    .select('kind, payload')
    .eq('id', queueJobId)
    .maybeSingle()
  if (jobError) throw new Error(`quota requeue: queue job lookup failed: ${jobError.message}`)
  const job = jobRow as { kind: string; payload: unknown } | null

  const jobPayload = job?.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
    ? (job.payload as Record<string, unknown>)
    : null
  const frozen = attempt.frozen_payload as Record<string, unknown> | null
  if (job?.kind === 'space-campaign-email' || laneFor(jobPayload) === 'bulk' || laneFor(frozen) === 'bulk') return 'bulk'
  if (jobPayload && typeof jobPayload[REQUEUE_OF_KEY] === 'string') return 'already-requeued'

  const payload = requeuePayloadFrom(frozen, queueJobId, jobPayload)
  if (!payload) return 'unsendable'

  const { enqueued } = await enqueue('email', payload, {
    runAfter: new Date(now.getTime() + msUntilNextUtcMidnight(now)),
    dedupeKey: `quota-requeue:${queueJobId}`,
  })
  return enqueued ? 'requeued' : 'duplicate'
}
