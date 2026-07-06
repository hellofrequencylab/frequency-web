/**
 * Per-Space drip RUNNER cron (the FIRE job, ADR-561). Drains DUE drip enrollments (status 'enrolled'
 * AND next_run_at <= now()), sending each contact's CURRENT step exactly once (idempotent claim in
 * lib/spaces/drip-runner.ts) through the Space system send seam, then advancing to the next step or
 * marking 'done'. Runs every 5 min via Vercel Cron (vercel.json). Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { runDueSpaceDrips } from '@/lib/spaces/drip-runner'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // log.time wraps the fire pass and emits one structured line (duration_ms + ok), queryable by
    // `cron.space_drips`. On failure it emits the error line and re-throws (the catch returns 500).
    const result = await log.time('cron.space_drips', () => runDueSpaceDrips())
    log.info('cron.space_drips.counts', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: 'space drip run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('space-drips', handler)
