// Event reminder cron — runs every 15 minutes via Vercel Cron.
//
// Two-pass: fires T-24h reminders for events starting between 24h and
// 24h+30min from now, and T-2h reminders for events starting between
// 2h and 2h+30min from now. The 30-minute slack absorbs cron latency
// without needing tight scheduler precision.
//
// Idempotency: event_rsvps.reminder_{24h,2h}_sent_at stamps per attendee
// so re-running creates no duplicates. Notification preferences gate each
// send (email_events). Welcome to the embodied-practice retention loop.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { sendEventReminderEmail } from '@/lib/email'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

const SLACK_MS = 30 * 60 * 1000   // tolerate up to 30 min cron drift

type ReminderLead = '24h' | '2h'

type EventRow = {
  id:          string
  title:       string
  starts_at:   string
  location:    string | null
  slug:        string
  is_cancelled: boolean
}

type RsvpRow = {
  id:          string
  event_id:    string
  profile_id:  string
}

function leadOffsetMs(lead: ReminderLead): number {
  return lead === '24h' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
}

function formatAbsolute(iso: string): string {
  // Render in UTC since we don't know the recipient's timezone yet (P2.13
  // attendance refinement may add per-profile timezone). Format reads as
  // "Wed, Jul 22 · 7:00 AM UTC" which is unambiguous.
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  }).replace(',', '').replace(' at ', ' · ')
}

function formatRelative(lead: ReminderLead): string {
  return lead === '24h' ? 'tomorrow' : 'in about 2 hours'
}

async function processLead(lead: ReminderLead): Promise<{ events: number; sent: number }> {
  const admin = createAdminClient()
  const now = Date.now()
  const windowStart = new Date(now + leadOffsetMs(lead))
  const windowEnd   = new Date(now + leadOffsetMs(lead) + SLACK_MS)

  const { data: events } = await admin
    .from('events')
    .select('id, title, starts_at, location, slug, is_cancelled')
    .gte('starts_at', windowStart.toISOString())
    .lt('starts_at', windowEnd.toISOString())
    .eq('is_cancelled', false)

  const eventRows = (events ?? []) as EventRow[]
  if (!eventRows.length) return { events: 0, sent: 0 }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const sentColumn = lead === '24h' ? 'reminder_24h_sent_at' : 'reminder_2h_sent_at'

  let sent = 0

  for (const ev of eventRows) {
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('id, event_id, profile_id')
      .eq('event_id', ev.id)
      .eq('status', 'going')
      .is(sentColumn, null)

    const rsvpRows = (rsvps ?? []) as RsvpRow[]
    if (!rsvpRows.length) continue

    const profileIds = rsvpRows.map((r) => r.profile_id)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name, auth_user_id')
      .in('id', profileIds)

    type ProfileRow = {
      id: string
      display_name: string
      auth_user_id: string | null
    }
    const profileMap = new Map<string, ProfileRow>()
    for (const p of (profiles ?? []) as ProfileRow[]) profileMap.set(p.id, p)

    for (const rsvp of rsvpRows) {
      const profile = profileMap.get(rsvp.profile_id)
      if (!profile || !profile.auth_user_id) continue

      const wantsEmail = await shouldSend(profile.id, 'email', 'events')
      const wantsPush  = await shouldSend(profile.id, 'push',  'events')

      if (!wantsEmail && !wantsPush) {
        // Fully opted out — stamp so we don't re-evaluate next run.
        await admin
          .from('event_rsvps')
          .update({ [sentColumn]: new Date().toISOString() } as Database['public']['Tables']['event_rsvps']['Update'])
          .eq('id', rsvp.id)
        continue
      }

      if (wantsEmail) {
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        if (user?.email) {
          await sendEventReminderEmail({
            to:                 user.email,
            recipientName:      profile.display_name,
            recipientProfileId: profile.id,
            eventTitle:         ev.title,
            whenLabel:          formatRelative(lead),
            whenAbsolute:       formatAbsolute(ev.starts_at),
            location:           ev.location,
            eventUrl:           `${appUrl}/events/${ev.slug}`,
            lead,
          })
        }
      }

      if (wantsPush) {
        await sendPushToProfile(profile.id, {
          title: lead === '24h' ? `🗓️ Tomorrow: ${ev.title}` : `⏰ Starting soon: ${ev.title}`,
          body:  ev.location ? `${formatRelative(lead)} · ${ev.location}` : formatRelative(lead),
          url:   `/events/${ev.slug}`,
          tag:   `event-${ev.id}-${lead}`,
        })
      }

      await admin
        .from('event_rsvps')
        .update({ [sentColumn]: new Date().toISOString() } as Database['public']['Tables']['event_rsvps']['Update'])
        .eq('id', rsvp.id)

      sent++
    }
  }

  return { events: eventRows.length, sent }
}

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const t24 = await processLead('24h')
  const t2  = await processLead('2h')

  log.info('cron.event_reminders', {
    sent24h:   t24.sent,
    events24h: t24.events,
    sent2h:    t2.sent,
    events2h:  t2.events,
  })

  return NextResponse.json({
    ok: true,
    '24h': t24,
    '2h':  t2,
  })
}
