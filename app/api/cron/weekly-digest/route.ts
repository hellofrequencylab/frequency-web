// Weekly community digest cron — runs Sundays at 14:00 UTC (~7am PT,
// matches when most members are actually awake on their day off).
//
// For each active profile (anyone with a circle membership), assemble a
// per-person digest. Skip people with nothing to surface (no recent
// dispatches AND no upcoming events) so we never send hollow emails.
// Each send gated by the unified send-gate for ('email', 'lifecycle') — preference + lifecycle
// consent + suppression in one decision (ADR-169), not the bare preference read it used to be.

import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyDigestEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { assembleDigestForProfile, listProfileIdsForDigest } from '@/lib/digest'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const profileIds = await listProfileIdsForDigest()
  let sent    = 0
  let skipped = 0
  let optOut  = 0

  // Timed: assembling + sending every per-person digest is the cron's whole cost
  // and scales with member count, so wrap it in log.time to emit one structured
  // line carrying duration_ms + ok, queryable/alertable by `cron.weekly_digest`.
  await log.time('cron.weekly_digest', async () => {
    for (const profileId of profileIds) {
      const payload = await assembleDigestForProfile(profileId)
      if (!payload) {
        skipped++
        continue
      }

      // The ONE seam (ADR-169). The bare preference read it replaced skipped suppression and the
      // lifecycle consent scope (meta-scan B9 H6), so a bounced or revoked address still got the
      // digest. Strictly safer: email_lifecycle consent defaults to granted (lib/consent/scopes.ts).
      if (!(await resolveSendGate(profileId, 'email', 'lifecycle', { email: payload.email })).allowed) {
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
        goAgain:            payload.goAgain,
      })
      sent++
    }
  })

  log.info('cron.weekly_digest.counts', {
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

export const GET = withCronHeartbeat('weekly-digest', handler)
