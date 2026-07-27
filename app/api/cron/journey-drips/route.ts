/**
 * Journey drip-send cron (ADR-840). Delivers each enrollee's phase-unlock notice when the
 * derived drip schedule (started_at + drip_interval_days, ADR-252) opens a new phase:
 * in-app notification + opt-in push through the existing seams. Idempotent via the
 * journey_drip_sends ledger claim (lib/journeys/drip-sends.ts, mirroring the space-drips
 * claim model) — DORMANT until that DRAFT migration is applied (the runner fails safe to
 * zeros on the missing table). Runs every 30 min via Vercel Cron. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { runDueJourneyDripSends } from '@/lib/journeys/drip-sends'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // log.time wraps the fire pass and emits one structured line (duration_ms + ok), queryable
    // by `cron.journey_drips`. On failure it emits the error line and re-throws (the catch
    // returns 500).
    const result = await log.time('cron.journey_drips', () => runDueJourneyDripSends())
    log.info('cron.journey_drips.counts', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: 'journey drip run failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('journey-drips', handler)
