'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { requireEventManager } from '../../actions'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { sendPushToProfile } from '@/lib/push'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { promoteFromWaitlist } from '@/lib/events/capacity'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Slice B-3 — host tooling write actions for the manage screen. Everything here
// re-resolves authorization server-side (requireEventManager: host/cohost/circle
// manager/staff); the admin client bypasses RLS, so the gate IS the authority.

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// ── Blast composer ──────────────────────────────────────────────────────────────
// A host/cohost broadcasts a message to the event's guests across in-app + push +
// email. Every recipient is gated through resolveSendGate (preferences + consent +
// suppression, the 'events' category) AND a real per-event mute (event_rsvps.muted).
// SMS is parked (out of scope). Records the blast in event_blasts, dispatches
// immediately through the outbox queue (email) + push fan-out + an in-app
// notification row.

export type BlastChannel = 'inapp' | 'push' | 'email'
const VALID_CHANNELS: BlastChannel[] = ['inapp', 'push', 'email']

const BLAST_MAX = 1000

export async function sendEventBlast(
  eventId: string,
  slug: string,
  input: { body: string; channels: BlastChannel[]; kind?: string },
): Promise<ActionResult<{ recipientCount: number }>> {
  const caller = await requireEventManager(eventId)
  if (!caller) return fail('You can’t send messages for this event.')

  const body = (input.body ?? '').trim()
  if (!body) return fail('Write a message first.')
  if (body.length > BLAST_MAX) return fail(`Keep it under ${BLAST_MAX} characters.`)

  const channels = (input.channels ?? []).filter((c): c is BlastChannel => VALID_CHANNELS.includes(c))
  if (channels.length === 0) return fail('Pick at least one way to send it.')
  const kind = (input.kind ?? 'update').trim() || 'update'

  const admin = createAdminClient()

  // Event meta for the email/push body.
  const { data: ev } = await admin
    .from('events')
    .select('title, slug')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return fail('Event not found.')

  // Guests = anyone with an intent-to-attend RSVP (going / maybe / waitlist) who
  // hasn't muted THIS event. `muted` is newer than the generated types → untyped read.
  const { data: rsvpRows } = await db()
    .from('event_rsvps')
    .select('profile_id, status, muted')
    .eq('event_id', eventId)
    .in('status', ['going', 'maybe', 'waitlist'])
  type RsvpRow = { profile_id: string; status: string; muted: boolean | null }
  const guests = ((rsvpRows ?? []) as RsvpRow[]).filter((r) => !r.muted)

  const wantInapp = channels.includes('inapp')
  const wantPush = channels.includes('push')
  const wantEmail = channels.includes('email')

  const eventUrl = `${appUrl()}/events/${ev.slug}`
  let attempted = 0

  for (const guest of guests) {
    const profileId = guest.profile_id
    if (!profileId || profileId === caller.id) continue // never blast yourself
    let reached = false

    // In-app: a notification row, gated by the inapp×events preference.
    if (wantInapp) {
      const gate = await resolveSendGate(profileId, 'inapp', 'events')
      if (gate.allowed) {
        try {
          await admin.from('notifications').insert({
            recipient_id: profileId,
            actor_id: caller.id,
            type: 'event_blast',
            reference_type: 'event',
            reference_id: eventId,
            body,
          })
          reached = true
        } catch (err) {
          console.error('[event blast] inapp insert failed', { eventId, profileId, err })
        }
      }
    }

    // Push: the send-gate runs INSIDE sendPushToProfile (preferences + consent +
    // suppression), so we never double-gate — but we still skip when muted (above).
    if (wantPush) {
      try {
        const sent = await sendPushToProfile(
          profileId,
          {
            title: `📣 ${ev.title}`,
            body,
            url: `/events/${ev.slug}`,
            tag: `event-blast-${eventId}`,
          },
          'events',
        )
        if (sent > 0) reached = true
      } catch (err) {
        console.error('[event blast] push failed', { eventId, profileId, err })
      }
    }

    // Email: events-category gate + suppression, queued through the durable outbox.
    if (wantEmail) {
      const gate = await resolveSendGate(profileId, 'email', 'events')
      if (gate.allowed) {
        const recipient = await resolveRecipientEmail(admin, profileId)
        if (recipient) {
          try {
            await enqueueEventBlastEmail({
              to: recipient.email,
              recipientName: recipient.name,
              recipientProfileId: profileId,
              eventTitle: ev.title,
              body,
              eventUrl,
            })
            reached = true
          } catch (err) {
            console.error('[event blast] email enqueue failed', { eventId, profileId, err })
          }
        }
      }
    }

    if (reached) attempted++
  }

  // Record the blast (durable log + the host's "who heard it" count). Service role.
  try {
    await db().from('event_blasts').insert({
      event_id: eventId,
      author_id: caller.id,
      body,
      channels,
      kind,
      recipient_count: attempted,
    })
  } catch (err) {
    console.error('[event blast] log insert failed', { eventId, err })
  }

  revalidatePath(`/events/${slug}/manage`)
  return ok({ recipientCount: attempted })
}

async function resolveRecipientEmail(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<{ email: string; name: string } | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name, auth_user_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.auth_user_id) return null
  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) return null
  return { email: user.email, name: profile.display_name ?? 'there' }
}

// Plain, warm host-message email. Same outbox + events-category unsubscribe
// plumbing as the reminder emails (so it respects prefs + suppression); only the
// copy differs. Voice: a friend confirming plans, no hype, no em dashes.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function enqueueEventBlastEmail(params: {
  to: string
  recipientName: string
  recipientProfileId: string
  eventTitle: string
  body: string
  eventUrl: string
}): Promise<void> {
  const { to, recipientName, recipientProfileId, eventTitle, body, eventUrl } = params
  const base = appUrl()
  const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: base, profileId: recipientProfileId, category: 'events' })
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>')

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#f5f5f5;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;padding:40px 40px 32px;">
      <a href="${base}" style="font-size:22px;font-weight:900;letter-spacing:-0.5px;color:#1a1a1a;text-decoration:none;">frequency</a>
      <p style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;margin:28px 0 8px;">A note from your host</p>
      <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0 0 16px;">${escapeHtml(eventTitle)}</h1>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 20px;">Hi ${escapeHtml(recipientName)},</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 20px;">${safeBody}</p>
      <a href="${eventUrl}" style="display:inline-block;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">View event →</a>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
      <p style="font-size:13px;color:#999;">
        You're getting this because you RSVP'd to this event. You can mute this event on its page, or
        <a href="${unsubscribeUrl}" style="color:#999;">unsubscribe from event emails</a>.
        <a href="${base}/settings/notifications" style="color:#999;">Manage preferences</a>.
      </p>
    </div>
  </div>
</body></html>`

  const text = `A note from your host about ${eventTitle}

Hi ${recipientName},

${body}

View event: ${eventUrl}

You're getting this because you RSVP'd. Mute this event on its page, or unsubscribe from event emails: ${unsubscribeUrl}
Manage preferences: ${base}/settings/notifications
`

  await enqueueEmail({
    to,
    subject: `📣 ${eventTitle}: a note from your host`,
    headers: listUnsubscribeHeaders(unsubscribeUrl),
    html,
    text,
  })
}

// ── Per-event mute (the guest's own lever) ───────────────────────────────────────
// Self-authorized: only ever touches the caller's own RSVP row. Honored by
// sendEventBlast above. Does NOT affect the guest's own RSVP/reminder emails.
export async function setEventMuted(eventId: string, slug: string, muted: boolean): Promise<ActionResult<void>> {
  const myProfileId = await getMyProfileId()
  if (!myProfileId) return fail('Sign in.')

  const { error } = await db()
    .from('event_rsvps')
    .update({ muted })
    .eq('event_id', eventId)
    .eq('profile_id', myProfileId)
  if (error) return fail('Could not update your settings.')

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/manage`)
  return ok()
}

// ── Waitlist controls (host) ─────────────────────────────────────────────────────
// Pull the next person off the waitlist into a confirmed seat (respects capacity),
// or move a specific guest off the waitlist. Host/cohost/manager/staff only.
export async function promoteNextWaitlister(eventId: string, slug: string): Promise<ActionResult<{ promotedId: string | null }>> {
  const caller = await requireEventManager(eventId)
  if (!caller) return fail('You can’t manage this event.')

  const promotedId = await promoteFromWaitlist(eventId).catch((e) => {
    console.error('[manage] promoteFromWaitlist', e)
    return null
  })

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath('/feed')
  return ok({ promotedId })
}

// Move a specific waitlisted guest straight into a confirmed seat (a host override —
// e.g. they know the person is coming). Only flips a row that is actually waitlisted.
export async function promoteWaitlister(eventId: string, slug: string, profileId: string): Promise<ActionResult<void>> {
  const caller = await requireEventManager(eventId)
  if (!caller) return fail('You can’t manage this event.')

  const { error } = await db()
    .from('event_rsvps')
    .update({ status: 'going' })
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .eq('status', 'waitlist')
  if (error) return fail('Could not move them off the waitlist.')

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/events/${slug}/manage`)
  revalidatePath('/feed')
  return ok()
}
