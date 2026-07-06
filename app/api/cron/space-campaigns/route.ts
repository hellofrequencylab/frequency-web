/**
 * Scheduled Space-campaign send cron (R4, business-accounts Automation). Fires per-Space campaigns
 * whose send time has arrived (status 'scheduled' AND scheduled_for <= now()), sending each exactly
 * once (idempotent claim in lib/spaces/campaigns-send-due.ts). Runs every 5 min via Vercel Cron
 * (vercel.json). Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { sendDueCampaigns } from '@/lib/spaces/campaigns-send-due'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    // log.time wraps the send pass and emits one structured line (duration_ms + ok), queryable by
    // `cron.space_campaigns`. On failure it emits the error line and re-throws (the catch returns 500).
    const result = await log.time('cron.space_campaigns', () => sendDueCampaigns())
    log.info('cron.space_campaigns.counts', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch {
    return NextResponse.json({ error: 'space campaign send failed' }, { status: 500 })
  }
}

export const GET = withCronHeartbeat('space-campaigns', handler)
