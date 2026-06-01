/**
 * Lifecycle trigger cron. Runs daily at midnight UTC via Vercel Cron.
 * For each active membership that hasn't received a Day 1 / 3 / 7 check-in
 * notification, creates an in-app notification (and optionally an email)
 * at the right interval after joining.
 *
 * Requires CRON_SECRET env var for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/email'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET(req: NextRequest) {
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

  for (const m of memberships ?? []) {
    if (!m.joined_at) continue
    const days = daysSince(m.joined_at)
    const profile = m.profile as any
    const circle  = m.circle  as any
    if (!profile || !circle) continue

    const notifBase = {
      recipient_id:   m.profile_id,
      actor_id:       null,
      reference_type: 'membership',
      reference_id:   m.id,
    }

    // Day 1. Welcome to circle
    if (!m.lifecycle_day1_sent && days >= 1) {
      await admin.from('notifications').insert({
        ...notifBase,
        type: 'lifecycle_day1',
        body: `Welcome to ${circle.name}! Introduce yourself in the circle feed.`,
      }).then(({ error: e }) => e && log.error('cron.lifecycle_triggers.notify_failed', { day: 1, error: e.message }))

      await admin
        .from('memberships')
        .update({ lifecycle_day1_sent: true })
        .eq('id', m.id)

      day1Count++
    }

    // Day 3. Check in
    if (!m.lifecycle_day3_sent && days >= 3) {
      await admin.from('notifications').insert({
        ...notifBase,
        type: 'lifecycle_day3',
        body: `You've been in ${circle.name} for 3 days. Check out upcoming events and earn some Zaps!`,
      }).then(({ error: e }) => e && log.error('cron.lifecycle_triggers.notify_failed', { day: 3, error: e.message }))

      await admin
        .from('memberships')
        .update({ lifecycle_day3_sent: true })
        .eq('id', m.id)

      day3Count++
    }

    // Day 7. Engagement push
    if (!m.lifecycle_day7_sent && days >= 7) {
      await admin.from('notifications').insert({
        ...notifBase,
        type: 'lifecycle_day7',
        body: `One week in ${circle.name}! Head to the Crew dashboard to see how you stack up on the leaderboard.`,
      }).then(({ error: e }) => e && log.error('cron.lifecycle_triggers.notify_failed', { day: 7, error: e.message }))

      await admin
        .from('memberships')
        .update({ lifecycle_day7_sent: true })
        .eq('id', m.id)

      day7Count++
    }
  }

  log.info('cron.lifecycle_triggers', { day1: day1Count, day3: day3Count, day7: day7Count })

  return NextResponse.json({
    ok: true,
    processed: memberships?.length ?? 0,
    sent: { day1: day1Count, day3: day3Count, day7: day7Count },
  })
}
