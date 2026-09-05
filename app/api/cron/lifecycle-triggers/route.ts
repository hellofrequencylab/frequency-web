/**
 * Lifecycle trigger cron. Runs daily at midnight UTC via Vercel Cron.
 * For each active membership that hasn't received a Day 1 / 3 / 7 check-in
 * notification, creates an in-app notification (and optionally an email)
 * at the right interval after joining.
 *
 * 2026-09-05 (scan2 L2-03): two corrections to how a check-in is stamped.
 *   1. A flag is stamped ONLY after the notifications insert came back without an error. Before,
 *      the insert error was logged inside a .then and the memberships update ran regardless, so a
 *      member whose insert failed was marked sent, never received the check-in, and could never be
 *      retried, while the run counted them as sent. A failed insert now counts as `failed`, leaves
 *      the flag alone for the next run, and answers 500 so the heartbeat fail-pings.
 *   2. One check-in per membership per run. The three windows were evaluated independently, so a
 *      membership past day 7 with none stamped (every membership older than the columns, or any
 *      member the cron missed for a week) received Day 1, Day 3 and Day 7 in the same second. Now
 *      the LATEST due window is sent and the earlier due flags are stamped as superseded: they
 *      describe a moment that has passed and would only arrive as three welcomes at once.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

type LifecycleDay = 1 | 3 | 7
const LIFECYCLE_DAYS: LifecycleDay[] = [1, 3, 7]
type FlagColumn = 'lifecycle_day1_sent' | 'lifecycle_day3_sent' | 'lifecycle_day7_sent'
const flagColumn = (day: LifecycleDay): FlagColumn => `lifecycle_day${day}_sent`

/** The check-in copy for each window. Voice canon: a fact plus an invitation. */
function bodyFor(day: LifecycleDay, circleName: string | null): string {
  switch (day) {
    // Day 1. Welcome to circle
    case 1:
      return `Welcome to ${circleName}! Introduce yourself in the circle feed.`
    // Day 3. Check in
    case 3:
      return `You've been in ${circleName} for 3 days. Check out upcoming events and earn some Zaps!`
    // Day 7. Engagement push
    case 7:
      return `One week in ${circleName}! Head to the Crew dashboard to see how you stack up on the leaderboard.`
  }
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const admin = createAdminClient()

  // Fetch all active memberships that may need lifecycle notifications
  const { data: memberships, error } = await admin
    .from('memberships')
    .select(`
      id, profile_id, circle_id, joined_at,
      lifecycle_day1_sent, lifecycle_day3_sent, lifecycle_day7_sent,
      profile:profiles!profile_id ( id, display_name, email:auth_user_id ),
      circle:circles!circle_id ( name )
    `)
    .eq('status', 'active')
    .or('lifecycle_day1_sent.eq.false,lifecycle_day3_sent.eq.false,lifecycle_day7_sent.eq.false')

  if (error) {
    log.error('cron.lifecycle_triggers.fetch_failed', { error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let day1Count = 0
  let day3Count = 0
  let day7Count = 0
  let superseded = 0
  let failed = 0

  // Timed: the per-membership notification loop is the cron's real work and grows
  // with active membership count, so wrap it in log.time to emit one structured
  // line with duration_ms + ok, queryable/alertable by `cron.lifecycle_triggers`.
  await log.time('cron.lifecycle_triggers', async () => {
  for (const m of memberships ?? []) {
    if (!m.joined_at) continue
    const days = daysSince(m.joined_at)
    const profile = m.profile as unknown as { id: string; display_name: string | null; email: string | null } | null
    const circle  = m.circle  as unknown as { name: string | null } | null
    if (!profile || !circle) continue

    // Every window this membership is due for, in order. Only the LAST one is sent (correction 2
    // in the header); the earlier ones are stamped as superseded in the same update.
    const due = LIFECYCLE_DAYS.filter((day) => !m[flagColumn(day)] && days >= day)
    if (due.length === 0) continue
    const sendDay = due[due.length - 1]
    const supersededDays = due.slice(0, -1)

    // Stamp only after the insert returned no error (correction 1 in the header). supabase-js
    // resolves { error } and never throws, so this read is the whole gate.
    const { error: insertError } = await admin.from('notifications').insert({
      recipient_id:   m.profile_id,
      actor_id:       null,
      reference_type: 'membership',
      reference_id:   m.id,
      type:           `lifecycle_day${sendDay}`,
      body:           bodyFor(sendDay, circle.name),
    })
    if (insertError) {
      failed++
      log.error('cron.lifecycle_triggers.notify_failed', {
        day: sendDay,
        membership_id: m.id,
        profile_id: m.profile_id,
        error: insertError.message,
      })
      continue
    }

    // The sent flag plus the superseded flags in one write. A superseded flag is true because the
    // moment it described has passed, not because that check-in went out; the notification the
    // member received is the one for `sendDay`.
    const patch = Object.fromEntries(due.map((day) => [flagColumn(day), true])) as Partial<Record<FlagColumn, boolean>>
    const { error: stampError } = await admin.from('memberships').update(patch).eq('id', m.id)
    if (stampError) {
      // The notification is in the member's inbox but the flag is not down, so the next run will
      // send it again. Loud, because that is the one double-send this route can still produce.
      failed++
      log.error('cron.lifecycle_triggers.stamp_failed', {
        day: sendDay,
        membership_id: m.id,
        profile_id: m.profile_id,
        error: stampError.message,
      })
      continue
    }

    if (sendDay === 1) day1Count++
    else if (sendDay === 3) day3Count++
    else day7Count++
    superseded += supersededDays.length
  }
  })

  const counts = { day1: day1Count, day3: day3Count, day7: day7Count, superseded, failed }
  log.info('cron.lifecycle_triggers.counts', counts)

  // failed > 0 is a job failure the heartbeat must see (withCronHeartbeat fail-pings on a 5xx).
  // Every membership that did stamp is out of the next run's selection, so the retry is safe.
  return NextResponse.json({
    ok: failed === 0,
    processed: memberships?.length ?? 0,
    sent: { day1: day1Count, day3: day3Count, day7: day7Count },
    superseded,
    failed,
  }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('lifecycle-triggers', handler)
