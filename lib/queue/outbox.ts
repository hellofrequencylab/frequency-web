// Durable async job queue — the "async lane" (ENGAGEMENT-ARCHITECTURE §5; ROADMAP
// P7.29). Enqueue side-effects (push/email fan-out, fraud scoring, leaderboard
// recompute) instead of running them inline where a provider outage would drop
// them. A cron drains the queue with retries + exponential backoff. Server-only.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

export interface QueueJob {
  id: string
  kind: string
  payload: Record<string, unknown>
  attempts: number
  max_attempts: number
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

export interface ProcessResult {
  processed: number
  done: number
  failed: number
  retried: number
}

const BACKOFF_BASE_MS = 60_000 // 1m → 2m → 4m → 8m …

/**
 * Terminal "dead-letter" state. A job lands here once it exhausts max_attempts;
 * it is never retried automatically. Operators recover dead-lettered jobs with
 * requeueDeadLettered() (e.g. after a provider outage) and watch the backlog
 * with countDeadLettered(). See ADR-043.
 */
export const DEAD_LETTER_STATUS = 'failed' as const

/** Pure retry policy: given the next attempt count, fail past the cap, else retry with exponential backoff. */
export function nextRetry(
  attempts: number,
  maxAttempts: number,
): { status: 'failed' | 'pending'; delayMs: number } {
  if (attempts >= maxAttempts) return { status: 'failed', delayMs: 0 }
  return { status: 'pending', delayMs: BACKOFF_BASE_MS * 2 ** (attempts - 1) }
}

function db() {
  return createAdminClient()
}

/** Enqueue a job. `runAfter` delays first execution; `maxAttempts` defaults to 5. */
export async function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  opts?: { runAfter?: Date; maxAttempts?: number },
): Promise<void> {
  // Callers treat enqueue as durable (the whole point of the outbox is that a
  // provider outage can't drop the side-effect). supabase-js returns { error }
  // rather than throwing, so an unchecked failure would silently lose the job with
  // no log, no retry, no dead-letter. Throw so the caller sees the failure.
  const { error } = await db()
    .from('notification_queue')
    .insert({
      kind,
      payload: payload as Json,
      run_after: (opts?.runAfter ?? new Date()).toISOString(),
      max_attempts: opts?.maxAttempts ?? 5,
    })
  if (error) throw new Error(`enqueue(${kind}) failed: ${error.message}`)
}

/**
 * Claim due jobs, run their handler, and mark done / failed / retried (with
 * exponential backoff). Unknown kinds fail the job. Returns counts.
 *
 * The claim is atomic: claim_outbox_jobs (UPDATE ... FOR UPDATE SKIP LOCKED) flips each
 * due job to 'processing' so overlapping drains (cron overlap, or a manual "send now"
 * racing the cron) never process the same job twice -> no double-send. The terminal
 * updates below move the row out of 'processing' (done, or back to pending/failed on
 * handler error). Jobs stranded in 'processing' by a crashed drain self-heal: the RPC
 * reclaims any 'processing' row older than 5 min on a later drain.
 */
export async function processQueue(
  handlers: Record<string, JobHandler>,
  limit = 25,
): Promise<ProcessResult> {
  const client = db()

  // Atomic claim: flip up to `limit` due jobs to 'processing' under FOR UPDATE SKIP LOCKED so
  // two overlapping drains never grab the same job -> no double-send (also reclaims jobs stranded
  // in 'processing' by a crashed drain). Not in the generated types yet, so call it through the
  // untyped rpc surface (repo convention for not-yet-typed DB objects).
  const { data: jobs, error: claimError } = await (client as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: QueueJob[] | null; error: { message: string } | null }>
  }).rpc('claim_outbox_jobs', { _limit: limit })

  // A failed claim is not an empty queue — surface it instead of silently
  // reporting "0 processed" while the backlog grows unworked.
  if (claimError) {
    console.error(`[outbox] claim RPC failed: ${claimError.message}`)
    throw new Error(`[outbox] claim RPC failed: ${claimError.message}`)
  }

  const list = (jobs ?? []) as QueueJob[]
  let done = 0
  let failed = 0
  let retried = 0

  for (const job of list) {
    const attempts = job.attempts + 1
    try {
      const handler = handlers[job.kind]
      if (!handler) throw new Error(`no handler for kind '${job.kind}'`)
      await handler(job.payload)
      await client
        .from('notification_queue')
        .update({ status: 'done', attempts, last_error: null, updated_at: new Date().toISOString() })
        .eq('id', job.id)
      done++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const retry = nextRetry(attempts, job.max_attempts)
      if (retry.status === 'failed') {
        // Dead-letter: exhausted all attempts. Log loudly — this is a dropped
        // side-effect (e.g. an email Resend never accepted) that no longer
        // retries on its own and needs operator attention (ADR-043).
        console.error(
          `[outbox] dead-lettered job ${job.id} kind=${job.kind} after ${attempts} attempts: ${msg}`,
        )
        await client
          .from('notification_queue')
          .update({ status: DEAD_LETTER_STATUS, attempts, last_error: msg, updated_at: new Date().toISOString() })
          .eq('id', job.id)
        failed++
      } else {
        console.warn(
          `[outbox] retrying job ${job.id} kind=${job.kind} attempt ${attempts}/${job.max_attempts} in ${retry.delayMs}ms: ${msg}`,
        )
        await client
          .from('notification_queue')
          .update({
            status: 'pending',
            attempts,
            last_error: msg,
            run_after: new Date(Date.now() + retry.delayMs).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        retried++
      }
    }
  }

  return { processed: list.length, done, failed, retried }
}

/** A dead-lettered job, as the operator DLQ surface shows it. */
export interface DeadLetteredJob {
  id: string
  kind: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  updatedAt: string
}

/** Group of dead-letters per kind — the at-a-glance health summary. */
export interface DeadLetterSummary {
  kind: string
  count: number
}

/**
 * The most recent dead-lettered jobs (newest first), for the operator recovery view.
 * Read-only; recovery happens through requeueDeadLettered (gated in the server action).
 */
export async function listDeadLettered(limit = 100): Promise<DeadLetteredJob[]> {
  const { data, error } = await db()
    .from('notification_queue')
    .select('id, kind, attempts, max_attempts, last_error, updated_at')
    .eq('status', DEAD_LETTER_STATUS)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error(`[outbox] listDeadLettered failed: ${error.message}`)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    attempts: (r.attempts as number) ?? 0,
    maxAttempts: (r.max_attempts as number) ?? 0,
    lastError: (r.last_error as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }))
}

/** Dead-letter counts grouped by job kind — the summary row on the health surface. */
export async function summarizeDeadLettered(): Promise<DeadLetterSummary[]> {
  const { data, error } = await db()
    .from('notification_queue')
    .select('kind')
    .eq('status', DEAD_LETTER_STATUS)
  if (error) {
    console.error(`[outbox] summarizeDeadLettered failed: ${error.message}`)
    return []
  }
  const counts = new Map<string, number>()
  for (const r of data ?? []) {
    const k = r.kind as string
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count)
}

/** Count pending (not-yet-drained) jobs — the live backlog signal beside the DLQ. */
export async function countPending(): Promise<number> {
  const { count, error } = await db()
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) {
    console.error(`[outbox] countPending failed: ${error.message}`)
    return 0
  }
  return count ?? 0
}

/** Count dead-lettered jobs (optionally for one kind) — a health/alerting signal. */
export async function countDeadLettered(kind?: string): Promise<number> {
  let query = db()
    .from('notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', DEAD_LETTER_STATUS)
  if (kind) query = query.eq('kind', kind)
  const { count, error } = await query
  if (error) {
    console.error(`[outbox] countDeadLettered failed: ${error.message}`)
    return 0
  }
  return count ?? 0
}

/**
 * Reset dead-lettered jobs back to pending so the next drain retries them.
 * Use after a resolved provider outage to recover side-effects that exhausted
 * their attempts while the provider was down. Returns the number revived.
 */
export async function requeueDeadLettered(
  opts?: { kind?: string; limit?: number },
): Promise<number> {
  const client = db()
  let select = client
    .from('notification_queue')
    .select('id')
    .eq('status', DEAD_LETTER_STATUS)
  if (opts?.kind) select = select.eq('kind', opts.kind)
  select = select.order('updated_at', { ascending: true }).limit(opts?.limit ?? 100)

  const { data: rows, error: selErr } = await select
  if (selErr) {
    console.error(`[outbox] requeueDeadLettered select failed: ${selErr.message}`)
    return 0
  }
  const ids = (rows ?? []).map((r) => (r as { id: string }).id)
  if (ids.length === 0) return 0

  const { error: updErr } = await client
    .from('notification_queue')
    .update({
      status: 'pending',
      attempts: 0,
      last_error: null,
      run_after: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (updErr) {
    console.error(`[outbox] requeueDeadLettered update failed: ${updErr.message}`)
    return 0
  }
  console.warn(`[outbox] requeued ${ids.length} dead-lettered job(s)${opts?.kind ? ` kind=${opts.kind}` : ''}`)
  return ids.length
}

/** A terminal status for a dead-letter an operator has consciously abandoned. Distinct from 'failed'
 *  (the recoverable dead-letter) so a poison job stops re-dead-lettering forever: requeueDeadLettered
 *  resets attempts=0, so a permanently-bad payload would loop failed → requeued → failed. Discarding it
 *  moves it OUT of the dead-letter view (which filters status='failed') and out of the drain (which only
 *  claims 'pending'), while keeping the row + last_error for the record instead of deleting it. */
export const DISCARDED_STATUS = 'discarded' as const

/**
 * Discard dead-lettered jobs (mark terminal). For a poison job that will never succeed on retry (a
 * malformed payload, a deleted recipient) so it stops cluttering the recovery queue. Gated in the
 * server action, exactly like requeueDeadLettered. Returns the number discarded.
 */
export async function discardDeadLettered(opts?: { kind?: string; limit?: number }): Promise<number> {
  const client = db()
  let select = client.from('notification_queue').select('id').eq('status', DEAD_LETTER_STATUS)
  if (opts?.kind) select = select.eq('kind', opts.kind)
  select = select.order('updated_at', { ascending: true }).limit(opts?.limit ?? 500)

  const { data: rows, error: selErr } = await select
  if (selErr) {
    console.error(`[outbox] discardDeadLettered select failed: ${selErr.message}`)
    return 0
  }
  const ids = (rows ?? []).map((r) => (r as { id: string }).id)
  if (ids.length === 0) return 0

  const { error: updErr } = await client
    .from('notification_queue')
    .update({ status: DISCARDED_STATUS, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (updErr) {
    console.error(`[outbox] discardDeadLettered update failed: ${updErr.message}`)
    return 0
  }
  console.warn(`[outbox] discarded ${ids.length} dead-lettered job(s)${opts?.kind ? ` kind=${opts.kind}` : ''}`)
  return ids.length
}
