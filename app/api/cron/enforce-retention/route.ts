// Nightly cron — purges expired member data (ADR-069 Phase 5b). Called by Vercel
// Cron (see vercel.json). Requires CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server'
import { enforceRetention } from '@/lib/consent/retention'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await enforceRetention()
  log.info('cron.enforce_retention', result)

  return NextResponse.json({ ok: true, ...result })
}

export const GET = withCronHeartbeat('enforce-retention', handler)
