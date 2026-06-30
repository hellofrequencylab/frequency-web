/**
 * Nurture cron (ADR-131). Advances due per-persona nurture enrollments — sends the
 * next step (consent-gated, queued) and reschedules or completes. Runs every 15 min
 * via Vercel Cron. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { runDueNurture } from '@/lib/nurture/runner'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // Timed: log.time wraps the due-enrollment advance and emits one structured
    // line carrying duration_ms + ok, queryable by `cron.nurture`. On failure it
    // emits the error line (ok:false) and re-throws, so the catch still returns 500.
    const result = await log.time('cron.nurture', () => runDueNurture())
    log.info('cron.nurture.counts', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: 'nurture run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('nurture', handler)
