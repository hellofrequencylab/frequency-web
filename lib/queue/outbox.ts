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
  /** When the job was first enqueued. claim_outbox_jobs already returns it (`returning q.*`);
   *  the retry policy needs it as the wall clock that bounds a deferral (see retryDelayFor). */
  created_at?: string | null
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>

export interface ProcessResult {
  processed: number
  done: number
  failed: number
  retried: number
  /** Jobs parked on the TIME axis (quota / rate limit) WITHOUT spending an attempt. Counted
   *  separately from `retried` so "we are waiting on a window" never reads as "we are failing". */
  deferred: number
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

// ── Classify the ERROR before you count the attempt (LIVE-091, ADR-043) ───────────────
//
// The attempt count is the wrong axis for a provider that rejects on a CLOCK. On 2026-07-17
// Resend answered every queued email with 429 daily_quota_exceeded. nextRetry never looked at
// the error, so all five attempts landed inside ~15 minutes against a quota that resets at
// midnight, and 359 emails dead-lettered in 1h43m: a 356-recipient campaign, plus two welcome
// emails and an event-claim invite that were never at fault. A quota is not a failure, it is a
// WAIT — the job is fine, the window is shut. So a quota or rate-limit error moves the job on
// the TIME axis and does NOT spend an attempt, while every other error keeps today's
// exponential-backoff-and-count policy byte for byte.

const DAY_MS = 86_400_000

/** Floor under any deferral: a Retry-After of 0, or a quota discovered one second before
 *  midnight, must not turn into a hot loop against the provider that just refused us. */
const MIN_DEFER_MS = 60_000

/** Ceiling on a delay the PROVIDER asked for. Retry-After is remote input; a wrong one must not
 *  park a welcome email for a month. A day is past every window we honour anyway. */
const MAX_DEFER_MS = DAY_MS

/** A plain rate limit (not a daily cap) clears in minutes, so wait minutes: long enough that five
 *  retries no longer fit inside a quarter of an hour, short enough to still be same-hour mail. */
const RATE_LIMIT_DELAY_MS = 15 * 60_000

/**
 * The bound on free deferrals. Not counting an attempt removes the very thing that used to stop a
 * retry loop, so each deferral class gets a WALL-CLOCK ceiling measured from the job's created_at —
 * the only clock the table already carries, so no new column and no migration. Past its ceiling the
 * same error falls back to the ordinary attempt-counting policy, which means a job whose "quota"
 * never clears still dead-letters onto the operator surface instead of retrying forever.
 *
 *   • A daily quota gets 72h: three full windows, so a Friday-evening cap survives the weekend,
 *     and at roughly one retry per window that is at most three free retries.
 *   • A generic rate limit gets 1h: at a 15-minute deferral, about four free retries. A provider
 *     still throttling us an hour later is not rate-limiting us, it is refusing us.
 */
const QUOTA_DEFER_MAX_AGE_MS = 72 * 60 * 60_000
const RATE_LIMIT_DEFER_MAX_AGE_MS = 60 * 60_000

/** What the drain decided to do with a failed job, and — the part nextRetry could not express —
 *  whether the attempt counts. `countsAsAttempt: false` is the deferral: same job, later clock. */
export interface RetryDecision {
  status: 'failed' | 'pending'
  delayMs: number
  /** false ⇒ leave `attempts` untouched. The job did not fail, it was too early. */
  countsAsAttempt: boolean
  /** Why, for the log line and for the drain's lane logic. */
  reason: 'error' | 'rate_limit' | 'daily_quota'
}

/** Everything about an error a policy can read, flattened to one lowercase haystack. Providers
 *  throw wildly different shapes; ours arrives as `[email] send failed: {"statusCode":429,...}`
 *  (a JSON body stringified into an Error message), so the message alone is not enough. */
function errorText(err: unknown): string {
  const parts: string[] = []
  if (err instanceof Error) parts.push(err.message, err.name)
  else if (typeof err === 'string') parts.push(err)
  if (err && typeof err === 'object') {
    try {
      parts.push(JSON.stringify(err, Object.getOwnPropertyNames(err as object)))
    } catch {
      // A circular / unserializable error still classifies off its message.
    }
  }
  return parts.join(' ').toLowerCase()
}

/** The HTTP status, from a structured field if the thrower kept one, else from the serialized body. */
function statusCodeOf(err: unknown, text: string): number | null {
  if (err && typeof err === 'object') {
    for (const key of ['statusCode', 'status', 'httpStatus'] as const) {
      const v = (err as Record<string, unknown>)[key]
      if (typeof v === 'number' && v >= 100 && v < 600) return v
    }
  }
  const m = /"?(?:statuscode|status)"?\s*[:=]\s*"?(\d{3})/.exec(text)
  return m ? Number(m[1]) : null
}

/** A provider-stated Retry-After, in ms. Accepts the header (seconds or an HTTP date), a
 *  structured `retryAfter`, or the value serialized into the message. Bounded by the caller. */
function retryAfterMsOf(err: unknown, text: string, now: Date): number | null {
  const fromSeconds = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) && n >= 0 ? n * 1000 : null
  }
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    const direct = fromSeconds(o.retryAfter ?? o.retry_after)
    if (direct !== null) return direct
    const headers = o.headers as Record<string, unknown> | undefined
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After']
    const secs = fromSeconds(raw)
    if (secs !== null) return secs
    if (typeof raw === 'string') {
      const at = Date.parse(raw)
      if (Number.isFinite(at)) return Math.max(0, at - now.getTime())
    }
  }
  const m = /retry[-_]?after"?\s*[:=]\s*"?(\d+)/.exec(text)
  return m ? Number(m[1]) * 1000 : null
}

/** Milliseconds until the next UTC midnight. A DAILY cap is stated in the provider's day, and UTC
 *  is the honest reading of "daily" when we do not know their reset timezone: worst case we wake a
 *  few hours late, never early into the same closed window. Exported for the test + the drain. */
export function msUntilNextUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  return next - now.getTime()
}

/**
 * THE retry decision: how long to wait after `err`, and whether this counts as an attempt.
 * Pure and total — same inputs, same answer, no clock of its own (pass `now`).
 *
 * `attempts` is the count this failure WOULD take the job to; `ageMs` is how long the job has
 * existed (the bound on free deferrals, see above). Anything unrecognized is the old policy.
 */
export function retryDelayFor(
  err: unknown,
  ctx: { attempts: number; maxAttempts: number; ageMs: number; now?: Date },
): RetryDecision {
  const now = ctx.now ?? new Date()
  const text = errorText(err)
  const status = statusCodeOf(err, text)
  const askedMs = retryAfterMsOf(err, text, now)
  const clamp = (ms: number) => Math.min(Math.max(ms, MIN_DEFER_MS), MAX_DEFER_MS)

  // A DAILY cap: the window is a calendar day, so no amount of backing off inside the hour can
  // clear it. Wait past midnight, and do not charge the job for the provider's calendar.
  const dailyQuota =
    /daily_quota_exceeded/.test(text) ||
    (/daily/.test(text) && /(quota|sending limit|send limit)/.test(text))
  if (dailyQuota && ctx.ageMs < QUOTA_DEFER_MAX_AGE_MS) {
    // Honour Retry-After when the provider gave one (it knows its own reset), else next UTC midnight.
    return {
      status: 'pending',
      delayMs: clamp(askedMs ?? msUntilNextUtcMidnight(now)),
      countsAsAttempt: false,
      reason: 'daily_quota',
    }
  }

  // A generic throttle: real, but short. Back off well past the 1m base so five retries cannot all
  // land inside a quarter hour, and do not burn the attempt budget on a wait the provider imposed.
  const rateLimited = status === 429 || /rate[ _-]?limit/.test(text) || /too many requests/.test(text)
  if (rateLimited && ctx.ageMs < RATE_LIMIT_DEFER_MAX_AGE_MS) {
    return {
      status: 'pending',
      delayMs: clamp(askedMs ?? RATE_LIMIT_DELAY_MS),
      countsAsAttempt: false,
      reason: 'rate_limit',
    }
  }

  // Everything else — including a "quota" that outlived its ceiling, which is no longer a window
  // we are waiting on but a failure we should surface. Unchanged policy, unchanged dead-letter.
  return { ...nextRetry(ctx.attempts, ctx.maxAttempts), countsAsAttempt: true, reason: 'error' }
}

// ── Lanes: a campaign must never spend the quota a welcome email is waiting for ───────
//
// Bulk = a fan-out to a list (a campaign, a drip). Valuable, but nobody is sitting at an inbox
// waiting for it. Transactional = one message one person is waiting for right now (a welcome, an
// invite, a booking confirmation). On 2026-07-17 both shared one undifferentiated queue, so a
// 356-recipient campaign reached the daily cap first and two welcomes died behind it.

export type JobLane = 'transactional' | 'bulk'

/** Where the lane rides. `notification_queue` has no lane column and this change adds no migration,
 *  so the lane lives in the payload jsonb the table already stores. Underscore-prefixed so it can
 *  never collide with a handler's own field (handlers read named fields; an extra key is inert). */
export const LANE_KEY = '__lane'

/** Transactional unless the job says otherwise. The asymmetry is deliberate: a bulk job misread as
 *  transactional would re-create the starvation this exists to stop, while a transactional job
 *  misread as bulk only loses priority. Pure, so the drain and the tests agree. */
export function laneFor(payload: Record<string, unknown> | null | undefined): JobLane {
  if (!payload || typeof payload !== 'object') return 'transactional'
  if (payload[LANE_KEY] === 'bulk') return 'bulk'
  // Belt and braces for rows queued before the lane existed: the campaign fan-out has always
  // stamped a campaign_id tag for Resend attribution (lib/email-studio/send.ts), so the 356 rows
  // from the incident, and anything already in flight at deploy, still classify correctly.
  const tags = payload.tags
  if (Array.isArray(tags) && tags.some((t) => (t as { name?: unknown } | null)?.name === 'campaign_id')) {
    return 'bulk'
  }
  return 'transactional'
}

/**
 * How fast a bulk fan-out is allowed to become DUE, in jobs per minute.
 *
 * The claim (claim_outbox_jobs) is `order by run_after asc` and lane-blind, so the only way to keep
 * a campaign from sitting in front of a welcome is to stop the campaign from being due all at once.
 * The drain runs every 2 minutes and claims 25, i.e. ~12.5 jobs/min of capacity; letting bulk become
 * due at 10/min keeps the bulk backlog draining, so a transactional job enqueued now is claimed on
 * the next drain (≤2 min) instead of queueing behind 356 older-due campaign rows. A 356-recipient
 * campaign now spreads over ~36 minutes rather than landing in a single second.
 */
export const BULK_DUE_RATE_PER_MIN = 10

/** run_after for the Nth job of a bulk fan-out, dripping BULK_DUE_RATE_PER_MIN per minute. Pure. */
export function bulkRunAfter(index: number, startedAt: Date = new Date()): Date {
  const minute = Math.floor(Math.max(0, index) / BULK_DUE_RATE_PER_MIN)
  return new Date(startedAt.getTime() + minute * 60_000)
}

function db() {
  return createAdminClient()
}

/** Enqueue a job. `runAfter` delays first execution; `maxAttempts` defaults to 5; `lane` marks a
 *  fan-out as bulk so it can never take the quota a transactional message is waiting for. */
export async function enqueue(
  kind: string,
  payload: Record<string, unknown>,
  opts?: { runAfter?: Date; maxAttempts?: number; lane?: JobLane },
): Promise<void> {
  // Callers treat enqueue as durable (the whole point of the outbox is that a
  // provider outage can't drop the side-effect). supabase-js returns { error }
  // rather than throwing, so an unchecked failure would silently lose the job with
  // no log, no retry, no dead-letter. Throw so the caller sees the failure.
  const { error } = await db()
    .from('notification_queue')
    .insert({
      kind,
      // The lane rides in the payload (no lane column, no migration). Only stamped for bulk:
      // transactional is the default everywhere, so an unstamped row reads correctly.
      payload: (opts?.lane === 'bulk' ? { ...payload, [LANE_KEY]: 'bulk' } : payload) as Json,
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
 *
 * Two rules protect the batch from the 2026-07-17 failure (LIVE-091):
 *   • Transactional jobs run FIRST within a claimed batch, so if the account has one send left
 *     in its quota it is spent on the welcome email, not on recipient 212 of a campaign.
 *   • The first quota refusal TRIPS THE LANE: every remaining bulk job in the batch is parked
 *     past the window without calling the provider and without spending an attempt. That is
 *     what turns "356 jobs each burn five attempts against a dead quota" into "one job finds
 *     the closed window, the rest wait for it to open".
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

  const claimed = (jobs ?? []) as QueueJob[]
  // Transactional first, bulk after, original order preserved inside each lane (the claim already
  // sorted by run_after, and this must not reshuffle a lane's own fairness).
  const list = [
    ...claimed.filter((j) => laneFor(j.payload) === 'transactional'),
    ...claimed.filter((j) => laneFor(j.payload) !== 'transactional'),
  ]
  let done = 0
  let failed = 0
  let retried = 0
  let deferred = 0

  // Set the moment this drain learns the account's send quota is spent. A quota is account-wide, so
  // every later bulk job in this batch is already answered: park it, do not ask again. Transactional
  // jobs still ask — they are few, a quota can lift between two calls, and a welcome email is worth
  // one refused request. Either way the refusal costs them nothing: it spends no attempt.
  let quotaClosedForMs: number | null = null

  for (const job of list) {
    const attempts = job.attempts + 1
    const lane = laneFor(job.payload)
    const createdMs = job.created_at ? Date.parse(job.created_at) : NaN
    const ageMs = Number.isFinite(createdMs) ? Math.max(0, Date.now() - createdMs) : 0

    // The lane trip: a bulk job behind a known-closed quota never touches the provider. It keeps
    // its attempts, keeps its place, and comes back when the window does.
    if (quotaClosedForMs !== null && lane === 'bulk') {
      await client
        .from('notification_queue')
        .update({
          status: 'pending',
          run_after: new Date(Date.now() + quotaClosedForMs).toISOString(),
          last_error: '[outbox] deferred: send quota closed earlier in this drain',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      deferred++
      continue
    }

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
      // Ask the ERROR, not just the counter. A closed window is a wait, not a failure.
      const retry = retryDelayFor(err, { attempts, maxAttempts: job.max_attempts, ageMs })
      if (retry.reason === 'daily_quota') quotaClosedForMs = retry.delayMs

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
      } else if (!retry.countsAsAttempt) {
        // Deferral: the provider told us WHEN, not no. Leave `attempts` alone — writing it here is
        // precisely how five retries against a daily cap dead-lettered 359 emails inside two hours.
        console.warn(
          `[outbox] deferring job ${job.id} kind=${job.kind} lane=${lane} (${retry.reason}) by ${retry.delayMs}ms, attempt ${job.attempts}/${job.max_attempts} unspent: ${msg}`,
        )
        await client
          .from('notification_queue')
          .update({
            status: 'pending',
            last_error: msg,
            run_after: new Date(Date.now() + retry.delayMs).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)
        deferred++
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

  return { processed: list.length, done, failed, retried, deferred }
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
  // Log the count only, never the caller-supplied `kind` (a client-reachable value → log-injection
  // sink, CodeQL). The scoped kind is already reflected in the returned count + the deliverability UI.
  console.warn(`[outbox] requeued ${ids.length} dead-lettered job(s)`)
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
  // Count only, never the caller-supplied `kind` (log-injection sink, CodeQL).
  console.warn(`[outbox] discarded ${ids.length} dead-lettered job(s)`)
  return ids.length
}
