// The post-gathering follow-up cron (LIVE-802, ADR-1720). Hourly via Vercel Cron.
// Budget: 200 events per run, and the clock is CRON_TIME_BUDGET_MS from lib/cron/budget.ts.
//
// THE INVITE LOOP, FIRST HALF. A guest who RSVPd or bought a ticket without an account is the
// launch's warmest lead: they showed up for something real. Nothing followed up with them,
// because signup recovery excludes event_rsvp leads (lib/crm/lead-sources.ts). This cron emails
// each guest once, the day after the gathering, with one button that turns the seat into a
// Member account.
//
// THE WINDOW. An event is due when its end (ends_at, else starts_at plus two hours) fell between
// 2 and 26 hours ago, read through the event's own zone (eventInstant). Hourly runs re-enter the
// window about a day's worth of times; the queue's dedupe key, one per address per event, keeps
// it to one send. Cancelled events and pending approvals are never read.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventInstant } from '@/lib/time/zone'
import { sendGuestFollowUpEmail } from '@/lib/email'
import { isSuppressed } from '@/lib/suppression'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { withCronHeartbeat } from '@/lib/observability/cron-heartbeat'
import { cronBudget } from '@/lib/cron/budget'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

const HOUR = 60 * 60 * 1000
/** Assumed length of an event with no ends_at. */
const DEFAULT_LENGTH_MS = 2 * HOUR
/** The follow-up goes out between these two ages of the event's end. */
const AFTER_END_MIN_MS = 2 * HOUR
const AFTER_END_MAX_MS = 26 * HOUR

type EventRow = {
  id: string
  title: string
  slug: string
  starts_at: string
  ends_at: string | null
  time_zone: string | null
  is_cancelled: boolean
}

/** Pure: is this event's end inside the follow-up window at `now`? */
export function followUpDue(ev: Pick<EventRow, 'starts_at' | 'ends_at' | 'time_zone'>, now: Date): boolean {
  const end = ev.ends_at
    ? eventInstant(ev.ends_at, ev.time_zone)
    : (() => {
        const start = eventInstant(ev.starts_at, ev.time_zone)
        return start ? new Date(start.getTime() + DEFAULT_LENGTH_MS) : null
      })()
  if (!end) return false
  const age = now.getTime() - end.getTime()
  return age >= AFTER_END_MIN_MS && age <= AFTER_END_MAX_MS
}

/** The one dedupe key per address per event. */
export function guestFollowUpKey(eventId: string, email: string): string {
  return `guest-followup:${eventId}:${email.trim().toLowerCase()}`
}

async function handler(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const budget = cronBudget(200)
  const admin = createAdminClient()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  // Stored starts_at is wall-clock as UTC parts, so the raw value can sit up to 14h off the real
  // instant. Read a band wide enough for any zone, then decide precisely with followUpDue.
  const from = new Date(now.getTime() - AFTER_END_MAX_MS - 3 * 24 * HOUR).toISOString()
  const to = new Date(now.getTime() + 14 * HOUR).toISOString()
  const { data: evRaw } = await admin
    .from('events')
    .select('id, title, slug, starts_at, ends_at, time_zone, is_cancelled')
    .eq('is_cancelled', false)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })
    .limit(budget.items)
  const events = ((evRaw ?? []) as unknown as EventRow[]).filter((ev) => followUpDue(ev, now))

  let sent = 0
  let processed = 0
  let stoppedOnBudget = false
  for (const ev of events) {
    if (budget.exhausted()) {
      stoppedOnBudget = true
      break
    }
    processed += 1
    const guests = new Map<string, string | null>()

    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('guest_email, guest_name, approval_status')
      .eq('event_id', ev.id)
      .eq('status', 'going')
      .is('profile_id', null)
      .not('guest_email', 'is', null)
    for (const r of (rsvps ?? []) as { guest_email: string | null; guest_name: string | null; approval_status: string | null }[]) {
      if (!r.guest_email || r.approval_status === 'pending') continue
      guests.set(r.guest_email.trim().toLowerCase(), r.guest_name)
    }

    const { data: tickets } = await admin
      .from('event_tickets')
      .select('guest_email')
      .eq('event_id', ev.id)
      .eq('status', 'succeeded')
      .is('buyer_profile_id', null)
      .not('guest_email', 'is', null)
    for (const t of (tickets ?? []) as { guest_email: string | null }[]) {
      const email = t.guest_email?.trim().toLowerCase()
      if (email && !guests.has(email)) guests.set(email, null)
    }

    const eventUrl = `${appUrl}/events/${ev.slug}`
    for (const [email, guestName] of guests) {
      if (await isSuppressed(email)) continue
      try {
        await sendGuestFollowUpEmail({
          to: email,
          guestName,
          eventTitle: ev.title,
          eventUrl,
          joinUrl: `${appUrl}/sign-in?next=${encodeURIComponent(`/events/${ev.slug}`)}&email=${encodeURIComponent(email)}`,
          dedupeKey: guestFollowUpKey(ev.id, email),
        })
        sent += 1
      } catch (err) {
        log.error('cron.event_followups.send_failed', { eventId: ev.id, err: String(err) })
      }
    }
  }

  const summary = budget.summary(processed, events.length - processed)
  log.info('cron.event_followups', { events: events.length, sent, stoppedOnBudget, ...summary })
  return NextResponse.json({ ok: true, events: processed, sent, budget: summary })
}

export const GET = withCronHeartbeat('event-followups', handler)
