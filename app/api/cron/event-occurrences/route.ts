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

  const result = await generateAllOccurrences()
  log.info('cron.event_occurrences', {
    anchors:            result.anchorCount,
    occurrencesCreated: result.occurrencesCreated,
  })

  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('event-occurrences', handler)
