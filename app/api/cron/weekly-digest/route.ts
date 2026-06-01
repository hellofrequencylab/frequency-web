// Weekly community digest cron — runs Sundays at 14:00 UTC (~7am PT,
// matches when most members are actually awake on their day off).
//
// For each active profile (anyone with a circle membership), assemble a
// per-person digest. Skip people with nothing to surface (no recent
// dispatches AND no upcoming events) so we never send hollow emails.
// Each send gated by shouldSend(*, 'email', 'lifecycle').

import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyDigestEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { assembleDigestForProfile, listProfileIdsForDigest } from '@/lib/digest'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const profileIds = await listProfileIdsForDigest()
  let sent    = 0
  let skipped = 0
  let optOut  = 0

  for (const profileId of profileIds) {
    const payload = await assembleDigestForProfile(profileId)
    if (!payload) {
      skipped++
      continue
    }

    if (!(await shouldSend(profileId, 'email', 'lifecycle'))) {
      optOut++
      continue
    }

    await sendWeeklyDigestEmail({
      to:                 payload.email,
      recipientName:      payload.displayName,
      recipientProfileId: payload.profileId,
      dispatches:         payload.dispatches,
      upcomingEvents:     payload.upcomingEvents,
      topStreak:          payload.topStreak,
      rank:               payload.rank,
    })
    sent++
  }

  log.info('cron.weekly_digest', {
    candidates: profileIds.length,
    sent,
    skipped,
    optOut,
  })

  return NextResponse.json({
    ok:        true,
    candidates: profileIds.length,
    sent,
    skipped,
    optOut,
  })
}
