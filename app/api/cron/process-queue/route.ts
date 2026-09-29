// LIVE-190 budget (ADR-1252): 25 outbox jobs per invocation; claim_outbox_jobs flips them to processing under SKIP LOCKED; the queue itself is the cursor.
// The clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts; app/api/cron/budget.test.ts checks the
// declaration is applied, not merely written down.
// Drains the durable job queue (lib/queue/outbox) with retries + backoff.
// Register a handler per job `kind` below as flows migrate onto the queue.
//
// After every drain, whatever it processed, the route reads the queue's health (lib/queue/outbox
// queueHealth) and emits ONE `queue.health` line with the three numbers, the same discipline as
// `cron.run`. When the reading breaches (a dead-letter exists, or the oldest due job is older than the
// queue-lag SLO in lib/observability/slos.ts) the run reports it on the two paths that already page:
// a Sentry capture tagged by job (H0-4) and the heartbeat /fail ping (H0-5), which the wrapper sends
// when it sees CRON_SLO_BREACH_HEADER on the 200. The drain is never failed for it: a 500 would make
// the next cron redo work that was fine (LIVE-547, ADR-1571).

import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { CRON_SLO_BREACH_HEADER, withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'
import { processQueue, queueHealth, queueHealthBreaches, QUEUE_LAG_SLO_ID } from '@/lib/queue/outbox'
import { queueHandlers } from '@/lib/queue/handlers'

export const dynamic = 'force-dynamic'

const JOB = 'process-queue'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const budget = cronBudget(25)
    const result = await processQueue(queueHandlers, budget.items)
    const summary = budget.summary(result.processed)
    // Surface dead-letters in the cron's own logs so a backlog of dropped
    // side-effects is visible without inspecting the table by hand (ADR-043).
    if (result.failed > 0) {
      console.error(`[process-queue] ${result.failed} job(s) dead-lettered this drain`)
    }

    // The health reading, on every drain. `queueHealth` never throws, so a failed read still lets the
    // drain report what it processed; it arrives as `measured: false`, which is itself a breach.
    const health = await queueHealth()
    const breaches = queueHealthBreaches(health)
    log.info('queue.health', {
      job: JOB,
      pending: health.pending,
      dead_lettered: health.deadLettered,
      lag_min: health.lagMin,
      oldest_due_age_min: health.oldestDueAgeMin,
      measured: health.measured,
      breach: breaches.length > 0,
    })

    const headers: Record<string, string> = {}
    if (breaches.length > 0) {
      const reason = breaches.join('; ')
      // Stable message + fingerprint, numbers in `extra`: a breach that lasts an hour is one Sentry
      // issue with thirty events, not thirty issues. `cron_job` is the tag the throw path already uses.
      Sentry.captureMessage(`[${JOB}] queue health breached: ${reason}`, {
        level: 'error',
        tags: { route: `cron.${JOB}`, cron_job: JOB, slo: QUEUE_LAG_SLO_ID },
        fingerprint: ['cron-slo-breach', JOB, ...breaches],
        extra: { ...health, breaches, drain: result },
      })
      headers[CRON_SLO_BREACH_HEADER] = reason
    }
    return NextResponse.json({ ok: true, ...result, budget: summary, health, breaches }, { headers })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[process-queue] drain failed: ${msg}`)
    // 500 so the failure is recorded; the next scheduled cron retries the drain.
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// The literal, not JOB: scripts/cron-freshness.mjs reads the job name out of this call.
export const GET = withCronHeartbeat('process-queue', handler)
