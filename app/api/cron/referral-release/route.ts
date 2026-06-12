/**
 * Referral-release cron. Pays the referrer (invite_accepted Zaps) once a referred
 * member ACTIVATES — joins a circle, adopts or logs a practice (lib/qr/referral.ts
 * runReferralRelease). Gating the payout on activation is the top anti-fraud move
 * (self/fake signups never activate) and rewards the high-LTV cohort. Idempotent +
 * bounded; safe to run frequently. Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { runReferralRelease } from '@/lib/qr/referral'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  try {
    const result = await runReferralRelease()
    log.info('cron.referral_release', { ...result })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    log.error('cron.referral_release.failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'referral release failed' }, { status: 500 })
  }
}
