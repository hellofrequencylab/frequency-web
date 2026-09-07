/**
 * Daily Journey-prompt cron (docs/JOURNEYS.md §15 P6). Runs once daily via Vercel Cron. For
 * every member enrolled in a Journey with a not-yet-done next lesson, sends the one prompt naming
 * the next thing to do: an in-app notification (defaults on) plus a push for members who opted in
 * (gated by their preferences, lifecycle category). Voice canon: a fact plus an invitation, never
 * guilt. (v2; ADR-253 — candidates come from journey_enrollments, not the retired adoptions clock.)
 *
 * Once-per-day idempotency is the dedupe key below (never the schedule); the push tag is
 * date-stamped so a device shows at most one per day.
 *
 * 2026-09-07 (LIVE-193, ADR-1225): THE PROMPT LANDS AT THE MEMBER'S LOCAL MORNING. This header
 * used to say a timezone-aware morning was a follow-up because profiles carried no timezone. They
 * do — `profiles.home_timezone`, read by the SMS quiet-hours gate, the practice day, and Vera's
 * dispatch — so the schedule is now HOURLY (`0 * * * *` in vercel.json) and each run sends only
 * to the members for whom it is LOCAL_MORNING_HOUR (lib/journeys/prompt-morning.ts) right now in
 * their own zone. The dedupe key
 * and the push tag carry the member's LOCAL day, so one member gets one prompt per local day and
 * the 23 other runs each find nothing to do for them (`notDue`, cheap: the timezone gate runs
 * BEFORE the per-member loader). A member with no timezone on file, or an unparseable one, keeps
 * the previous behaviour exactly: the run at LEGACY_UTC_HOUR (13:00 UTC, the old schedule) is
 * their morning.
 *
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
import { isValidTimeZone } from '@/lib/time/zone'
import { morningFor } from '@/lib/journeys/prompt-morning'

export const dynamic = 'force-dynamic'

/** Postgres unique_violation: the day's row for this member already exists. */
const UNIQUE_VIOLATION = '23505'

/** Chunk size for the `.in('id', …)` timezone read; PostgREST URLs have a length ceiling. */
const TZ_READ_CHUNK = 500

/** `profiles.home_timezone` for the candidates, batched. Best-effort: a member missing from the
 *  result, or whose value is not a real IANA zone, is treated as having none (the legacy hour). */
async function readHomeTimezones(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += TZ_READ_CHUNK) {
    const chunk = ids.slice(i, i + TZ_READ_CHUNK)
    const { data, error } = await admin.from('profiles').select('id, home_timezone').in('id', chunk)
    if (error) {
      // A failed read must not silence the run: everyone in the chunk falls back to the legacy hour.
      log.warn('cron.journey_prompt.tz_read_failed', { error: error.message, size: chunk.length })
      continue
    }
    for (const p of (data ?? []) as { id: string; home_timezone: string | null }[]) {
      if (isValidTimeZone(p.home_timezone)) out.set(p.id, p.home_timezone)
    }
  }
  return out
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date()

  // Every member with at least one active (not-yet-completed) Journey enrollment.
  const memberIds = await listEnrolledMemberIds()
  const tzByProfile = memberIds.length ? await readHomeTimezones(admin, memberIds) : new Map<string, string>()

  let inapp = 0
  let push = 0
  let skipped = 0
  let notDue = 0
  let deduped = 0
  let failed = 0
  let loaderFailed = 0
  for (const profileId of memberIds) {
    // The timezone gate runs FIRST: on 23 of 24 runs a member is simply not in their morning, and
    // that answer must not cost a loader call.
    const { due, day } = morningFor(now, tzByProfile.get(profileId))
    if (!due) {
      notDue++
      continue
    }

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

  const counts = { candidates: memberIds.length, inapp, push, skipped, notDue, deduped, failed, loaderFailed }
  log.info('cron.journey_prompt', counts)
  // failed > 0 is a job failure the heartbeat must see (withCronHeartbeat fail-pings on a 5xx).
  // Every in-app row that did land carries its dedupe key, so the retry cannot double-send.
  return NextResponse.json({ ok: failed === 0, ...counts }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('journey-prompt', handler)
