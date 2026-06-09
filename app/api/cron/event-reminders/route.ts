// Event reminder cron — runs every 15 minutes via Vercel Cron.
//
// Three-pass (completing the research-backed 3-touch cadence, EVENTS-SYSTEM
// §5.4): a warm ~1-week-out touch, then T-24h, then T-2h.
//   • T-24h / T-2h: events starting between {24h,2h} and +30min from now.
//     The 30-minute slack absorbs cron latency without tight scheduler precision.
//   • ~7-day: events starting in a ±12h band around +7d (now+6.5d … now+7.5d).
//     The band is one day wide so the every-15-min cron fires it exactly once
//     per attendee — the per-attendee reminder_7d_sent_at stamp guarantees that
//     even though the band is re-entered many times across the day.
//
// Idempotency: event_rsvps.reminder_{7d,24h,2h}_sent_at stamps per attendee
// so re-running creates no duplicates. Notification preferences gate each
// send (email_events). Welcome to the embodied-practice retention loop.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sendEventReminderEmail,
  enqueueEmail,
  listUnsubscribeHeaders,
} from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { shouldSend } from '@/lib/notification-preferences'
import { sendPushToProfile } from '@/lib/push'
import { rejectUnauthorizedCron } from '@/lib/cron-auth'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

const SLACK_MS = 30 * 60 * 1000   // tolerate up to 30 min cron drift

// ~7-day touch: events whose start falls in a one-day band centred on +7d.
// Wide enough that the every-15-min cron always catches it; the per-attendee
// reminder_7d_sent_at stamp keeps it to exactly one send (EVENTS-SYSTEM §5.4).
const WEEK_LEAD_MIN_MS = 6.5 * 24 * 60 * 60 * 1000   // now + 6.5d
const WEEK_LEAD_MAX_MS = 7.5 * 24 * 60 * 60 * 1000   // now + 7.5d

type ReminderLead = '7d' | '24h' | '2h'

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

function leadOffsetMs(lead: '24h' | '2h'): number {
  return lead === '24h' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
}

// The reminder_*_sent_at idempotency column for each touch.
function sentColumnFor(lead: ReminderLead): string {
  if (lead === '7d')  return 'reminder_7d_sent_at'
  if (lead === '24h') return 'reminder_24h_sent_at'
  return 'reminder_2h_sent_at'
}

// reminder_7d_sent_at is newer than the generated DB types, so the typed client
// rejects it in an Update payload. Stamp through an untyped client — the
// `as unknown as SupabaseClient` convention from lib/billing/* — so any of the
// three reminder columns (including the new one) is accepted. The same now()
// stamp closes idempotency for all three touches identically.
async function stampReminder(rsvpId: string, sentColumn: string): Promise<void> {
  const db = createAdminClient() as unknown as SupabaseClient
  await db
    .from('event_rsvps')
    .update({ [sentColumn]: new Date().toISOString() })
    .eq('id', rsvpId)
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
  if (lead === '7d')  return 'in about a week'
  if (lead === '24h') return 'tomorrow'
  return 'in about 2 hours'
}

async function processLead(lead: ReminderLead): Promise<{ events: number; sent: number }> {
  const admin = createAdminClient()
  const now = Date.now()

  // The ~7-day touch uses a one-day-wide band (now+6.5d … now+7.5d) so the
  // 15-min cron fires it once per attendee; the near-term touches use the
  // tight {offset, offset+30min} slack window. Predicate matches the existing
  // style: starts_at >= windowStart AND < windowEnd.
  const windowStart = lead === '7d'
    ? new Date(now + WEEK_LEAD_MIN_MS)
    : new Date(now + leadOffsetMs(lead))
  const windowEnd = lead === '7d'
    ? new Date(now + WEEK_LEAD_MAX_MS)
    : new Date(now + leadOffsetMs(lead) + SLACK_MS)

  const { data: events } = await admin
    .from('events')
    .select('id, title, starts_at, location, slug, is_cancelled')
    .gte('starts_at', windowStart.toISOString())
    .lt('starts_at', windowEnd.toISOString())
    .eq('is_cancelled', false)

  const eventRows = (events ?? []) as EventRow[]
  if (!eventRows.length) return { events: 0, sent: 0 }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const sentColumn = sentColumnFor(lead)

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

    // Warm proof for the ~1-week touch: how many are going (Law 1, EVENTS-SYSTEM
    // §4 — warm proof, never low/negative counts). We only surface this when it's
    // a *growing* number (>= 2), never "you're the only one going" or "1 going".
    let goingCount = 0
    if (lead === '7d') {
      const { count } = await admin
        .from('event_rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', ev.id)
        .eq('status', 'going')
      goingCount = count ?? 0
    }
    const warmProof = goingCount >= 2 ? `${goingCount} going` : null

    for (const rsvp of rsvpRows) {
      const profile = profileMap.get(rsvp.profile_id)
      if (!profile || !profile.auth_user_id) continue

      const wantsEmail = await shouldSend(profile.id, 'email', 'events')
      const wantsPush  = await shouldSend(profile.id, 'push',  'events')

      if (!wantsEmail && !wantsPush) {
        // Fully opted out — stamp so we don't re-evaluate next run.
        await stampReminder(rsvp.id, sentColumn)
        continue
      }

      if (wantsEmail) {
        const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
        if (user?.email) {
          const eventUrl = `${appUrl}/events/${ev.slug}`
          if (lead === '7d') {
            // The ~1-week touch needs gentle, non-urgent copy. sendEventReminderEmail
            // hard-codes the subject/eyebrow off lead ('Tomorrow' / 'Starting soon'),
            // both of which are wrong + time-pressured for a week-out note — so we
            // queue through the same underlying enqueueEmail + events-category
            // unsubscribe plumbing it uses, with warm, blameless copy.
            await sendWeekAheadEmail({
              to:                 user.email,
              recipientName:      profile.display_name,
              recipientProfileId: profile.id,
              eventTitle:         ev.title,
              whenAbsolute:       formatAbsolute(ev.starts_at),
              location:           ev.location,
              eventUrl,
              warmProof,
            })
          } else {
            await sendEventReminderEmail({
              to:                 user.email,
              recipientName:      profile.display_name,
              recipientProfileId: profile.id,
              eventTitle:         ev.title,
              whenLabel:          formatRelative(lead),
              whenAbsolute:       formatAbsolute(ev.starts_at),
              location:           ev.location,
              eventUrl,
              lead,
            })
          }
        }
      }

      // Gate is inside sendPushToProfile (full preference + consent check).
      // wantsPush above is kept for the early-exit optimization only.
      const pushTitle =
        lead === '7d'  ? `✨ See you in a week: ${ev.title}` :
        lead === '24h' ? `🗓️ Tomorrow: ${ev.title}` :
                         `⏰ Starting soon: ${ev.title}`
      // Week-out push body leads with warm proof when it's a growing count,
      // never a low/negative one (Law 1).
      const pushBase = lead === '7d' && warmProof
        ? `${formatRelative(lead)} · ${warmProof}`
        : formatRelative(lead)
      await sendPushToProfile(profile.id, {
        title: pushTitle,
        body:  ev.location ? `${pushBase} · ${ev.location}` : pushBase,
        url:   `/events/${ev.slug}`,
        tag:   `event-${ev.id}-${lead}`,
      }, 'events')

      await stampReminder(rsvp.id, sentColumn)

      sent++
    }
  }

  return { events: eventRows.length, sent }
}

// Warm ~1-week-out email. Built here (not via sendEventReminderEmail, whose
// subject/eyebrow is hard-wired to the two near-term leads) so the copy is
// gentle and never time-pressured. Same enqueueEmail outbox + events-category
// unsubscribe headers as every other event email — only the wording differs.
async function sendWeekAheadEmail(params: {
  to:                 string
  recipientName:      string
  recipientProfileId: string
  eventTitle:         string
  whenAbsolute:       string
  location:           string | null
  eventUrl:           string
  warmProof:          string | null
}): Promise<void> {
  const { to, recipientName, recipientProfileId, eventTitle, whenAbsolute, location, eventUrl, warmProof } = params

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const unsubscribeUrl = buildUnsubscribeUrl({
    baseUrl:   appUrl,
    profileId: recipientProfileId,
    category:  'events',
  })

  // Gentle, blameless, no urgency. Warm proof only when it's a growing count.
  const proofLine = warmProof ? `${warmProof} so far — you're in good company.` : ''
  const whereLine = location ? `Where: ${location}` : ''

  const html = `
    <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;margin:28px 0 8px;">
      A week to go
    </p>
    <h1 style="font-size:24px;font-weight:800;margin:0 0 16px;color:#111;">${eventTitle}</h1>
    <p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 16px;">
      Hi ${recipientName} — just a gentle note that we'll see you in about a week. No need to do anything now; we're looking forward to having you there.
    </p>
    <p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 16px;">
      <strong>${whenAbsolute}</strong>${location ? `<br><span style="color:#777;">${location}</span>` : ''}
    </p>
    ${proofLine ? `<p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 16px;">${proofLine}</p>` : ''}
    <a href="${eventUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;">View event →</a>
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
    <p style="font-size:13px;color:#999;">
      You're receiving this because you RSVP'd to attend. Plans change, and that's okay —
      <a href="${eventUrl}" style="color:#999;">update your RSVP</a> any time.
      <a href="${appUrl}/settings/notifications" style="color:#999;">Manage preferences</a>
      · <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from event reminders</a>.
    </p>
  `

  const text = `A week to go: ${eventTitle}

Hi ${recipientName} — just a gentle note that we'll see you in about a week. No need to do anything now; we're looking forward to having you there.

When: ${whenAbsolute}
${whereLine}
${proofLine}

View event: ${eventUrl}

Plans change, and that's okay — update your RSVP any time.
Manage preferences: ${appUrl}/settings/notifications
Unsubscribe from event reminders: ${unsubscribeUrl}
`

  await enqueueEmail({
    to,
    subject: `✨ A week to go — ${eventTitle}`,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html,
    text,
  })
}

export async function GET(req: NextRequest) {
  const denied = rejectUnauthorizedCron(req)
  if (denied) return denied

  const t7  = await processLead('7d')
  const t24 = await processLead('24h')
  const t2  = await processLead('2h')

  log.info('cron.event_reminders', {
    sent7d:    t7.sent,
    events7d:  t7.events,
    sent24h:   t24.sent,
    events24h: t24.events,
    sent2h:    t2.sent,
    events2h:  t2.events,
  })

  return NextResponse.json({
    ok: true,
    '7d':  t7,
    '24h': t24,
    '2h':  t2,
  })
}
