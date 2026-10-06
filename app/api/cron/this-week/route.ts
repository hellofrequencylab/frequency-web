// LIVE-190 budget (ADR-1252): 2000 members per run across every launch region; the walk stops on the
// clock, and a cut-off run reports the rest as remaining. The clock is CRON_TIME_BUDGET_MS from
// lib/cron/budget.ts; app/api/cron/budget.test.ts checks the declaration is applied.
/**
 * "This week in <region>" cron (LIVE-806, ADR-1720 workstream 9). Thursdays via Vercel Cron.
 *
 * WHAT IT DOES. For each launch region (lib/this-week.ts LAUNCH_REGIONS), it picks the public,
 * published, not-cancelled Events starting in the next seven days in the region's cities. A region
 * with none sends nothing. Otherwise every member whose city is in the region gets one email,
 * through the send gate (events category, suppression, consent).
 *
 * IDEMPOTENT PER WEEK (the SCAN-611 lesson). Each email is enqueued with the dedupe key
 * `this-week:<region>:<iso week>:<profile>`, and the outbox's unique index on dedupe_key drops a
 * second enqueue, so a retried or doubled run sends nobody twice.
 *
 * A DRY RUN UNTIL 3 DECEMBER 2026 (THIS_WEEK_SENDS_FROM). Marketing starts the email that week. Until
 * then the cron reads, counts who would get it, logs the reading, and sends nothing, so merging this
 * emails no one early.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { briefError, errorStack, log } from '@/lib/log'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { sendThisWeekEmail } from '@/lib/email'
import {
  LAUNCH_REGIONS,
  pickThisWeek,
  regionForCity,
  thisWeekDedupeKey,
  thisWeekSendsOpen,
  type ThisWeekEventRow,
} from '@/lib/this-week'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(2000)
  const now = new Date()
  const dryRun = !thisWeekSendsOpen(now)
  const db = createAdminClient()

  const { data: eventRows, error: eventsError } = await db
    .from('events')
    .select('slug, title, city, starts_at, is_cancelled')
    .eq('visibility', 'public')
    .eq('status', 'published')
    .eq('is_cancelled', false)
    .gte('starts_at', now.toISOString())
    .lt('starts_at', new Date(now.getTime() + WEEK_MS).toISOString())
    .order('starts_at', { ascending: true })
    .limit(500)
  if (eventsError) {
    log.error('cron.this_week.events_read_failed', { error: eventsError.message })
    return NextResponse.json({ ok: false, error: 'events read failed' }, { status: 500 })
  }
  const events = (eventRows ?? []) as ThisWeekEventRow[]

  let sent = 0
  let wouldSend = 0
  let optOut = 0
  let noEmail = 0
  let failed = 0
  let visited = 0
  let remaining = 0
  let regionsEmpty = 0

  await log.time('cron.this_week', async () => {
    for (const region of LAUNCH_REGIONS) {
      const picks = pickThisWeek(events, region, now)
      if (!picks.length) {
        regionsEmpty++
        continue
      }
      const cards = picks.map((e) => ({ title: e.title, startsAt: e.starts_at, city: e.city, url: `${APP_URL}/events/${e.slug}` }))

      // Members whose city starts with a region city ("Carlsbad, CA" included), then the exact match.
      const { data: memberRows, error: membersError } = await db
        .from('profiles')
        .select('id, display_name, city')
        .eq('is_demo', false)
        .or(region.cities.map((c) => `city.ilike.${c}%`).join(','))
        .order('id', { ascending: true })
        .limit(5000)
      if (membersError) {
        failed++
        log.error('cron.this_week.members_read_failed', { region: region.slug, error: membersError.message })
        continue
      }
      const members = (memberRows ?? []).filter((m) => regionForCity(m.city)?.slug === region.slug)
      const { batch, remaining: tail } = budget.take(members)
      remaining += tail

      for (const [i, m] of batch.entries()) {
        if (budget.exhausted()) {
          remaining += batch.length - i
          break
        }
        visited++
        try {
          const email = await profileAccountEmail(m.id)
          if (!email) {
            noEmail++
            continue
          }
          if (!(await resolveSendGate(m.id, 'email', 'events', { email })).allowed) {
            optOut++
            continue
          }
          if (dryRun) {
            wouldSend++
            continue
          }
          await sendThisWeekEmail({
            to: email,
            recipientName: m.display_name || 'there',
            recipientProfileId: m.id,
            regionName: region.name,
            events: cards,
            dedupeKey: thisWeekDedupeKey(region.slug, m.id, now),
          })
          sent++
        } catch (err) {
          failed++
          log.error('cron.this_week.member_failed', { profile_id: m.id, error: briefError(err), stack: errorStack(err) })
        }
      }
    }
  })

  const counts = {
    dryRun,
    events: events.length,
    regionsEmpty,
    sent,
    wouldSend,
    optOut,
    noEmail,
    failed,
    ...budget.summary(visited, remaining),
  }
  log.info('cron.this_week.counts', counts)
  return NextResponse.json({ ok: failed === 0, ...counts }, { status: failed === 0 ? 200 : 500 })
}

export const GET = withCronHeartbeat('this-week', handler)
