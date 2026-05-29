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
  await db()
    .from('notification_queue')
    .insert({
      kind,
      payload: payload as Json,
      run_after: (opts?.runAfter ?? new Date()).toISOString(),
      max_attempts: opts?.maxAttempts ?? 5,
    })
}

/**
 * Claim due pending jobs, run their handler, and mark done / failed / retried
 * (with exponential backoff). Unknown kinds fail the job. Returns counts.
 *
 * NOTE: simple claim (no row-locking). For high concurrency, move the claim to a
 * `SELECT … FOR UPDATE SKIP LOCKED` RPC; fine for a single periodic cron.
 */
export async function processQueue(
  handlers: Record<string, JobHandler>,
  limit = 25,
): Promise<ProcessResult> {
  const client = db()
  const nowIso = new Date().toISOString()

  const { data: jobs } = await client
    .from('notification_queue')
    .select('id, kind, payload, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('run_after', nowIso)
    .order('run_after', { ascending: true })
    .limit(limit)

  const list = (jobs ?? []) as unknown as QueueJob[]
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
        await client
          .from('notification_queue')
          .update({ status: 'failed', attempts, last_error: msg, updated_at: new Date().toISOString() })
          .eq('id', job.id)
        failed++
      } else {
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
