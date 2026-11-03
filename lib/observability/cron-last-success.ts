// A free second pager for the crons the Healthchecks.io free tier cannot hold (SEC-022).
//
// Healthchecks' free plan holds 20 checks and vercel.json declares about 40 jobs, so the jobs in
// CRON_UNMONITORED had no alert at all. Instead of paying for a bigger plan, each of those jobs
// stamps its last success into `cron_run_markers` (key `cron-ok:<job>`, created_at = now), and
// `/api/status/cron-freshness` compares every stamp with the job's freshness window. The
// queue-watch GitHub workflow reads that route every 20 minutes, so a stale job is a red run and
// GitHub emails the owner. No new table, no env var, no paid plan.
//
// Best effort on the write side: a failed stamp never changes a cron's outcome.

import { createAdminClient } from '@/lib/supabase/admin'
import { CRON_UNMONITORED, cronFreshnessMinutes } from '@/lib/observability/slos'
import { log } from '@/lib/log'

export const CRON_OK_KEY_PREFIX = 'cron-ok:'

/** Is this job one the repo says has no Healthchecks check (so it needs the free stamp)? */
export function isStampedCron(jobName: string): boolean {
  return CRON_UNMONITORED.some((c) => c.job === jobName)
}

type MarkerTable = {
  upsert: (row: { key: string; created_at: string }, opts: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>
  select: (cols: string) => {
    in: (col: string, keys: string[]) => PromiseLike<{ data: { key: string; created_at: string }[] | null; error: { message: string } | null }>
  }
}

// cron_run_markers is not in the generated types (ADR-246); reach it through a narrow handle.
// `.bind(client)` is load-bearing (LIVE-053): a bare `client.from` loses `this`.
function table(): MarkerTable {
  const client = createAdminClient() as unknown as { from: (t: 'cron_run_markers') => MarkerTable }
  return client.from.bind(client)('cron_run_markers')
}

/** Stamp a successful run. Never throws. */
export async function recordCronSuccess(jobName: string, now: Date = new Date()): Promise<void> {
  try {
    const { error } = await table().upsert(
      { key: `${CRON_OK_KEY_PREFIX}${jobName}`, created_at: now.toISOString() },
      { onConflict: 'key' },
    )
    if (error) log.warn('cron.last_success.write_failed', { job: jobName, error: error.message })
  } catch (err) {
    log.warn('cron.last_success.write_failed', { job: jobName, error: err instanceof Error ? err.message : String(err) })
  }
}

type CronStamp = { job: string; ageMin: number | null; windowMin: number | null; state: 'fresh' | 'stale' | 'unreported' }

/** Pure: turn stored stamps into a verdict per stamped job. A job with no stamp yet is
 *  `unreported` (a new deploy, or a weekly job that has not fired); it is listed, not failed. */
export function judgeStamps(rows: { key: string; created_at: string }[], nowMs: number = Date.now()): CronStamp[] {
  const byJob = new Map(rows.map((r) => [r.key.slice(CRON_OK_KEY_PREFIX.length), Date.parse(r.created_at)]))
  return CRON_UNMONITORED.map(({ job }) => {
    const windowMin = cronFreshnessMinutes(job)
    const at = byJob.get(job)
    if (at == null || Number.isNaN(at)) return { job, ageMin: null, windowMin, state: 'unreported' as const }
    const ageMin = Math.round((nowMs - at) / 60_000)
    const fresh = windowMin != null && ageMin <= windowMin
    return { job, ageMin, windowMin, state: fresh ? ('fresh' as const) : ('stale' as const) }
  })
}

/** Read every stamp. `measured:false` means the read failed, which the route treats as a failure. */
export async function readCronStamps(): Promise<{ measured: boolean; stamps: CronStamp[] }> {
  try {
    const keys = CRON_UNMONITORED.map((c) => `${CRON_OK_KEY_PREFIX}${c.job}`)
    const { data, error } = await table().select('key, created_at').in('key', keys)
    if (error || !data) return { measured: false, stamps: [] }
    return { measured: true, stamps: judgeStamps(data) }
  } catch {
    return { measured: false, stamps: [] }
  }
}
