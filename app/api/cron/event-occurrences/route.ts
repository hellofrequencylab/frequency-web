// Daily cron — rolls the recurring-event materialisation window forward.
// Called by Vercel Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { generateAllOccurrences } from '@/lib/event-recurrence'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  // Timed: log.time wraps the materialisation roll and emits one structured line
  // carrying duration_ms + ok, so a slow run is queryable by `cron.event_occurrences`.
  const result = await log.time('cron.event_occurrences', () => generateAllOccurrences())
  log.info('cron.event_occurrences.counts', {
    anchors:            result.anchorCount,
    occurrencesCreated: result.occurrencesCreated,
  })

  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('event-occurrences', handler)
