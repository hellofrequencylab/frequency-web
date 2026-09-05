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
 * 2026-09-05 (scan2 L2-02): the schedule is not idempotency. A dashboard re-fire or a redeploy
 * re-run in the same day inserted a second notifications row per member. The in-app row now
 * carries `dedupe_key = journey-prompt:<profile_id>:<YYYY-MM-DD>`, unique where set (migration
 * 20270345000700), so the second insert is refused by the index and counted as `deduped`. The push
 * already had its date-stamped tag.
 * 2026-09-05 (scan2 L2-04): the loader and the push no longer swallow. A getDailyJourneyPrompt
 * throw and a sendPushToProfile throw are each logged at error level with the member id and
 * counted in `failed`; `failed > 0` answers 500 so the heartbeat fail-pings, and `loaderFailed`
 * reports the loader-throw count on its own so "the loader is down for everyone" reads differently
 * from "nobody was due" (both used to be `ok: true, inapp: 0, push: 0`).
 *
 * Requires CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { sendPushToProfile } from '@/lib/push'
import { getDailyJourneyPrompt, formatJourneyPrompt, type JourneyPrompt } from '@/lib/journey-prompt'
import { listEnrolledMemberIds } from '@/lib/journeys/progress'
import { briefError, log } from '@/lib/log'

export const dynamic = 'force-dynamic'

/** Postgres unique_violation: the day's row for this member already exists. */
const UNIQUE_VIOLATION = '23505'

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const day = new Date().toISOString().slice(0, 10)

  // Every member with at least one active (not-yet-completed) Journey enrollment.
  const memberIds = await listEnrolledMemberIds()

  let inapp = 0
  let push = 0
  let skipped = 0
  let deduped = 0
  let failed = 0
  let loaderFailed = 0
  for (const profileId of memberIds) {
    let prompt: JourneyPrompt | null
    try {
      prompt = await getDailyJourneyPrompt(profileId)
    } catch (err) {
      loaderFailed++
      failed++
      log.error('cron.journey_prompt.loader_failed', { profile_id: profileId, error: briefError(err) })
      continue
    }
    if (!prompt) {
      skipped++
      continue
    }
    const body = formatJourneyPrompt(prompt)

    // In-app notification (defaults on). Best-effort; a failure must not stop the run.
    // 2026-09-05 (scan2 L2-02): best-effort still means counted. The row carries the day's dedupe
    // key; a unique violation is the earlier invocation's row and is a skip, any other error is a
    // failure for this member. dedupe_key is not in the generated types yet (regenerate after
    // applying 20270345000700), hence the cast through the table's Insert type (ADR-246).
    const row = {
      recipient_id: profileId,
      actor_id: null,
      reference_type: 'journey',
      reference_id: prompt.planId,
      type: 'journey_next_step',
      body,
      dedupe_key: `journey-prompt:${profileId}:${day}`,
    } as unknown as Database['public']['Tables']['notifications']['Insert']
    const { error: insertError } = await admin.from('notifications').insert(row)
    if (!insertError) inapp++
    else if (insertError.code === UNIQUE_VIOLATION) deduped++
    else {
      failed++
      log.error('cron.journey_prompt.notify_failed', { profile_id: profileId, error: insertError.message })
    }

    // Push (opt-in; sendPushToProfile re-checks the member's push preference + consent).
    try {
      const sent = await sendPushToProfile(
        profileId,
        {
          title: `Your next step in ${prompt.journeyTitle}`,
          body: prompt.timeNote ? `${prompt.practiceTitle}. ${prompt.timeNote}` : prompt.practiceTitle,
          url: '/crew',
          tag: `journey-prompt-${day}`,
        },
        'lifecycle',
      )
      if (sent > 0) push++
    } catch (err) {
      failed++
      log.error('cron.journey_prompt.push_failed', { profile_id: profileId, error: briefError(err) })
    }
  }

  const counts = { candidates: memberIds.length, inapp, push, skipped, deduped, failed, loaderFailed }
  log.info('cron.journey_prompt', counts)
  // failed > 0 is a job failure the heartbeat must see (withCronHeartbeat fail-pings on a 5xx).
  // Every in-app row that did land carries its dedupe key, so the retry cannot double-send.
  return NextResponse.json({ ok: failed === 0, ...counts }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('journey-prompt', handler)
