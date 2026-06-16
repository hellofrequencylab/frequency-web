/**
 * Daily Journey-prompt cron (docs/JOURNEYS.md §15 P6). Runs once daily via Vercel Cron. For
 * every member enrolled in a Journey with a not-yet-done next lesson, sends the one prompt naming
 * the next thing to do: an in-app notification (defaults on) plus a push for members who opted in
 * (gated by their preferences, lifecycle category). Voice canon: a fact plus an invitation, never
 * guilt. (v2; ADR-253 — candidates come from journey_enrollments, not the retired adoptions clock.)
 *
 * Once-per-day idempotency rides the daily schedule (the cron fires once a day); the push tag is
 * date-stamped so a device shows at most one per day. Timezone-aware local morning is a follow-up
 * (the codebase has no per-profile timezone yet — see app/api/cron/event-reminders).
 *
 * Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { sendPushToProfile } from '@/lib/push'
import { getDailyJourneyPrompt, formatJourneyPrompt } from '@/lib/journey-prompt'
import { listEnrolledMemberIds } from '@/lib/journeys/progress'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const day = new Date().toISOString().slice(0, 10)

  // Every member with at least one active (not-yet-completed) Journey enrollment.
  const memberIds = await listEnrolledMemberIds()

  let inapp = 0
  let push = 0
  for (const profileId of memberIds) {
    const prompt = await getDailyJourneyPrompt(profileId).catch(() => null)
    if (!prompt) continue
    const body = formatJourneyPrompt(prompt)

    // In-app notification (defaults on). Best-effort; a failure must not stop the run.
    await admin
      .from('notifications')
      .insert({
        recipient_id: profileId,
        actor_id: null,
        reference_type: 'journey',
        reference_id: prompt.planId,
        type: 'journey_next_step',
        body,
      })
      .then(({ error }) => {
        if (!error) inapp++
        else log.error('cron.journey_prompt.notify_failed', { error: error.message })
      })

    // Push (opt-in; sendPushToProfile re-checks the member's push preference + consent).
    const sent = await sendPushToProfile(
      profileId,
      {
        title: `Your next step in ${prompt.journeyTitle}`,
        body: prompt.timeNote ? `${prompt.practiceTitle}. ${prompt.timeNote}` : prompt.practiceTitle,
        url: '/crew',
        tag: `journey-prompt-${day}`,
      },
      'lifecycle',
    ).catch(() => 0)
    if (sent > 0) push++
  }

  log.info('cron.journey_prompt', { candidates: memberIds.length, inapp, push })
  return NextResponse.json({ ok: true, candidates: memberIds.length, inapp, push })
}
