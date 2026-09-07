// The per-invocation WORK budget every cron route declares and applies (LIVE-190, ADR-1252).
//
// A Vercel cron is killed at 300 s, and with the claim-then-send discipline of ADR-1212 its
// unfinished tail is retried next run, so a cron whose window grows faster than its budget falls
// further behind every invocation and reads as a 500 each time. The heartbeat seam
// (`lib/observability/cron-heartbeat.ts`, ADR-1229) already STATES an expected duration and says
// when it is crossed; that is a reading, and nothing there bounds the work. This module is the
// other half: the number of items one invocation takes, and the wall-clock after which it stops
// and reports what it left, in the campaign-runner shape (`lib/spaces/campaigns-send-due.ts`):
//
//   1. `.limit(budget.items)` on the driving query, ordered so the oldest work goes first, or
//      `budget.take(rows)` where the rows are already in memory;
//   2. a claim, stamp or status flip on each processed row so the next run resumes where this one
//      stopped instead of re-doing the head;
//   3. `budget.exhausted()` checked inside the per-item loop, so a slow tail returns early instead
//      of running into the ceiling;
//   4. one `budget.summary(processed, remaining)` on the route's counts line.
//
// PURE AND DEPENDENCY-FREE on purpose: a lib runner that wants the time half takes a plain
// `() => boolean` (`budget.exhausted`) rather than importing this module, so nothing under lib/
// learns what a cron is. `app/api/cron/budget.test.ts` walks every route and fails one that does
// not import `cronBudget` AND call it AND apply it; a route that is bounded by its own shape
// (one promotion per run, four bulk statements) is named there with its reason.
//
// ⚠️ CREATE THE BUDGET INSIDE THE HANDLER, never at module scope. The clock starts at creation,
// and a warm function reuses its module for many invocations, so a module-scope budget would be
// exhausted before the second invocation did any work.

/** The platform ceiling on one invocation. Mirrors `CRON_CEILING_MS` in the heartbeat seam; the
 *  test pins the two equal so this module stays import-free. */
export const CRON_CEILING_MS = 300_000

/** The wall-clock a cron may spend on work before it returns early with its remaining count:
 *  four fifths of the ceiling, leaving a fifth for the response, the heartbeat ping and cold-start
 *  skew. A route with a genuinely shorter unit of work passes a smaller `timeMs`. */
export const CRON_TIME_BUDGET_MS = 240_000

export interface CronBudgetSummary {
  /** Items this invocation actually processed. */
  processed: number
  /** Items known to be left for the next run, or null when the caller cannot count them. */
  remaining: number | null
  /** Whether a next run has (or likely has) work waiting: a counted remainder, or a full batch
   *  when the remainder is not countable. */
  more: boolean
  budget_items: number
  budget_ms: number
  elapsed_ms: number
  /** True once `exhausted()` has answered true: the route stopped on the clock, not on the batch. */
  stopped_on_time: boolean
}

export interface CronBudget {
  /** The most items one invocation takes: the `.limit(N)` on the driving query. */
  readonly items: number
  /** The wall-clock allowance for the invocation's work. */
  readonly timeMs: number
  /** Milliseconds since the budget was created. */
  elapsedMs(): number
  /** True once the wall-clock allowance is spent. Latches: a route that has stopped on the clock
   *  reports `stopped_on_time` even if it asks again. */
  exhausted(): boolean
  /** Split in-memory rows into the batch this run takes and the count it leaves. The rows should
   *  already be ordered oldest-first by the caller. */
  take<T>(rows: readonly T[]): { batch: T[]; remaining: number }
  /** The one line every route logs beside its counts. */
  summary(processed: number, remaining?: number | null): CronBudgetSummary
}

export interface CronBudgetOptions {
  /** Override the wall-clock allowance (default `CRON_TIME_BUDGET_MS`). */
  timeMs?: number
  /** Injectable clock for tests. */
  now?: () => number
}

/**
 * Declare a per-invocation budget. `items` is the batch size the route's header records; it is
 * applied to the driving query or to `take`, never merely logged.
 */
export function cronBudget(items: number, opts: CronBudgetOptions = {}): CronBudget {
  if (!Number.isInteger(items) || items < 1) {
    throw new Error(`cronBudget: items must be a positive integer, got ${String(items)}`)
  }
  const timeMs = opts.timeMs ?? CRON_TIME_BUDGET_MS
  if (!(timeMs > 0) || timeMs >= CRON_CEILING_MS) {
    throw new Error(`cronBudget: timeMs must be between 1 and ${CRON_CEILING_MS - 1}, got ${String(timeMs)}`)
  }
  const now = opts.now ?? Date.now
  const startedAt = now()
  let tripped = false

  const elapsedMs = () => Math.max(0, now() - startedAt)
  const exhausted = () => {
    if (!tripped && elapsedMs() >= timeMs) tripped = true
    return tripped
  }

  return {
    items,
    timeMs,
    elapsedMs,
    exhausted,
    take<T>(rows: readonly T[]) {
      const batch = rows.slice(0, items)
      return { batch, remaining: Math.max(0, rows.length - batch.length) }
    },
    summary(processed: number, remaining: number | null = null) {
      const known = typeof remaining === 'number' ? Math.max(0, remaining) : null
      return {
        processed,
        remaining: known,
        more: known === null ? processed >= items : known > 0,
        budget_items: items,
        budget_ms: timeMs,
        elapsed_ms: elapsedMs(),
        stopped_on_time: tripped,
      }
    },
  }
}
