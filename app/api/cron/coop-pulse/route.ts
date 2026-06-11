// Nightly cron — Co-op Pulse (Rewards Economy v2): +3⚡ to every circle trio+
// that logged the same adopted Journey the previous day, plus the Carrier Wave
// and Co-op Synchrony follow-ons. Called by Vercel Cron (see vercel.json).

import { NextRequest, NextResponse } from 'next/server'
import { runCoopPulse } from '@/lib/coop-pulse'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const result = await runCoopPulse()
  log.info('cron.coop_pulse', { ...result })

  return NextResponse.json({ ok: true, ...result })
}
