/**
 * Nurture cron (ADR-131). Advances due per-persona nurture enrollments — sends the
 * next step (consent-gated, queued) and reschedules or completes. Runs every 15 min
 * via Vercel Cron. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { runDueNurture } from '@/lib/nurture/runner'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await runDueNurture()
    log.info('cron.nurture', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    log.error('cron.nurture.failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'nurture run failed' }, { status: 500 })
  }
}
