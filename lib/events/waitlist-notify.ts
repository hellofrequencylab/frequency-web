import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { enqueueEmail, listUnsubscribeHeaders, sendGuestRsvpConfirmationEmail } from '@/lib/email'
import { buildUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { sendPushToProfile } from '@/lib/push'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'
// Not a client component despite living under components/ (the builder is a pure URL function);
// the same import lib/events/guest-rsvp-email.ts takes.
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { publicVisibleLocation } from '@/lib/events/visible-location'
import type { PromotedSeat } from './capacity'

// ── "A spot opened up and you're in." ────────────────────────────────────────────────────────────
//
// THE PROMISE THIS KEEPS. Every waitlist receipt says the same thing: "If a spot opens up we'll
// move you in automatically and let you know" (lib/email.ts, the member and guest waitlist
// templates) and "We'll text if a spot opens" (the RSVP SMS). The first half was true from day
// one: promoteFromWaitlist (lib/events/capacity.ts) flips the oldest eligible waitlist row to
// 'going' the moment a confirmed seat is withdrawn. The second half was never built. The promote
// helper returns a PromotedSeat "so the caller can notify whichever identity holds it" and both
// callers in app/(main)/events/actions.ts discarded the value (scan2 L5-02). A member found out by
// noticing their RSVP badge had changed; a guest, who has no account, no bell and no "my events"
// page, found out by turning up.
//
// WHAT GOES OUT, BY IDENTITY. A promoted seat carries exactly one identity
// (event_rsvps_identity_check, 20270303000000), and each gets the channels it actually has:
//
//   * MEMBER seat: an in-app notification row (the bell), a push, and an email. The push and the
//     email are the SAME plumbing the RSVP confirmation uses. Push routes through
//     sendPushToProfile, which runs resolveSendGate('push', 'events') itself; the email runs
//     resolveSendGate('email', 'events') here, address first so suppression can see it, and lands
//     on the durable outbox with the events-category unsubscribe URL and List-Unsubscribe headers,
//     exactly as sendEventRsvpConfirmationEmail does. NO SUBJECT is passed to the gate on purpose:
//     RSVP-lifecycle sends are deliberately not subject-muted (DECISIONS, the OWN-049 note). This
//     is the member's own seat moving, not the Circle talking, and a mute swallowing "you're in
//     now" would strand someone who was told to wait and then never released. The in-app row is
//     written unconditionally, the way every other in-app event notice in lib/events is: there is
//     no inapp_events switch (lib/notifications/wired.ts), so gating on one would be a lie.
//
//   * GUEST seat: the guest confirmation email, status 'going', through the transactional
//     carve-out the guest receipt already takes (no profile, so no preference row and no
//     unsubscribe token; global suppression is checked at drain time inside sendRawEmail). It is
//     the "You're going" receipt the guest's waitlist email told them to expect. The address gate
//     is mirrored, not reinvented: a hidden-address event sends the city line and no calendar
//     links, because a guest row never satisfies the going/waitlist/ticketed test that unlocks a
//     withheld address (ADR-825) and an .ics carries the address in its own LOCATION field.
//
// THE SEAT IS READ BACK, NOT TRUSTED. This runs after the update, so the row is re-read by id and
// nothing is sent unless it still says 'going' and is not pending. Telling someone they are in and
// then having the capacity trigger's coercion or a host's decision say otherwise is worse than
// silence, because it has to be retracted.
//
// FAIL-SAFE. Never throws into the RSVP path: a failed send must not un-promote anyone or change
// what the withdrawing member sees. Every failure is logged and swallowed here.

/** The one line every channel leads with. Plain, no em dashes (CONTENT-VOICE). */
export const PROMOTED_SEAT_LINE = "A spot opened up and you're in."

/** The `notifications.type` the bell row carries. Unregistered in the bell's icon map on purpose:
 *  it falls back to the generic bell icon, and reference_type 'event' lands it on /events
 *  (lib/notifications/href.ts routes event ids to the index, not the page). */
export const PROMOTED_SEAT_NOTIFICATION_TYPE = 'event_waitlist_promoted'

type PromotedEvent = {
  title: string; slug: string; starts_at: string; ends_at: string | null
  location: string | null; description: string | null; is_cancelled: boolean
  time_zone: string | null; hide_address: boolean | null
  venue_name: string | null; street: string | null; city: string | null; region: string | null
  scope_id: string | null; scope_type: string | null
  host: { display_name: string | null } | null
}

type SeatRow = {
  status: string
  approval_status: string | null
  profile_id: string | null
  guest_email: string | null
  guest_name: string | null
}

/** The untyped table surface (ADR-246): guest_email / guest_name / hide_address / time_zone
 *  postdate the generated types, so the two reads that need them are cast to the shape used. */
type UntypedTable = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Tell whoever holds a just-promoted seat that they are in. Best-effort and identity-aware:
 * a member seat gets bell + push + email, a guest seat gets the guest confirmation email.
 * Resolves without throwing on every failure.
 */
export async function notifyPromotedSeat(seat: PromotedSeat, eventId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const untyped = admin as unknown as UntypedTable

    const { data: evRaw } = await untyped
      .from('events')
      .select(
        'title, slug, starts_at, ends_at, location, description, is_cancelled, time_zone, ' +
        'hide_address, venue_name, street, city, region, scope_id, scope_type, ' +
        'host:profiles!host_id ( display_name )',
      )
      .eq('id', eventId)
      .maybeSingle()
    const ev = evRaw as PromotedEvent | null
    // Unknown or cancelled event: there is nothing true to say.
    if (!ev || ev.is_cancelled) return

    // Read the seat back rather than trusting the caller (see the header).
    const { data: rowRaw } = await untyped
      .from('event_rsvps')
      .select('status, approval_status, profile_id, guest_email, guest_name')
      .eq('id', seat.rsvpId)
      .maybeSingle()
    const row = rowRaw as SeatRow | null
    if (!row || row.status !== 'going' || row.approval_status === 'pending') return

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`
    const evTz = resolveZone(ev.time_zone)
    const whenAbsolute = formatEventWhen(ev.starts_at, evTz)

    const profileId = seat.profileId ?? row.profile_id
    if (profileId) {
      await notifyMember({ admin, profileId, ev, eventId, eventUrl, evTz, whenAbsolute, appUrl })
      return
    }

    const guestEmail = seat.guestEmail ?? row.guest_email
    if (!guestEmail) return
    await notifyGuest({ guestEmail, guestName: row.guest_name, ev, eventUrl, evTz, whenAbsolute, appUrl, admin })
  } catch (e) {
    console.error('[events waitlist promoted]', e)
  }
}

async function loadCircleName(
  admin: ReturnType<typeof createAdminClient>,
  ev: PromotedEvent,
): Promise<string | null> {
  if (ev.scope_type !== 'circle' || !ev.scope_id) return null
  const { data } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
  return data?.name ?? null
}

// ── The member leg ───────────────────────────────────────────────────────────────────────────────

async function notifyMember(args: {
  admin: ReturnType<typeof createAdminClient>
  profileId: string
  ev: PromotedEvent
  eventId: string
  eventUrl: string
  evTz: string
  whenAbsolute: string
  appUrl: string
}): Promise<void> {
  const { admin, profileId, ev, eventId, eventUrl, evTz, whenAbsolute, appUrl } = args

  // 1. The bell. Written first and unconditionally: it is the one channel a member cannot have
  //    switched off, and the one that stays put if push and email are both gated.
  try {
    const { error } = await admin.from('notifications').insert({
      recipient_id: profileId,
      actor_id: null,
      type: PROMOTED_SEAT_NOTIFICATION_TYPE,
      reference_type: 'event',
      reference_id: eventId,
      body: `${PROMOTED_SEAT_LINE} ${ev.title}`,
    })
    if (error) console.error('[events waitlist promoted] bell insert failed', { eventId, error: error.message })
  } catch (e) {
    console.error('[events waitlist promoted] bell insert threw', { eventId, e })
  }

  // 2. Push. sendPushToProfile runs the events push gate itself (prefs + consent + suppression);
  //    no subject, so a Circle mute does not swallow it (RSVP lifecycle rule).
  try {
    await sendPushToProfile(
      profileId,
      { title: ev.title, body: PROMOTED_SEAT_LINE, url: eventUrl, tag: `event-promoted-${eventId}` },
      'events',
    )
  } catch (e) {
    console.error('[events waitlist promoted] push failed', { eventId, e })
  }

  // 3. Email, through the same seam and the same outbox plumbing as the RSVP confirmation.
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', profileId)
      .maybeSingle()
    if (!profile?.auth_user_id) return
    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) return

    // The ONE seam (ADR-169). Address first so suppression can see it. No subject on purpose.
    if (!(await resolveSendGate(profileId, 'email', 'events', { email: user.email })).allowed) return

    const circleName = await loadCircleName(admin, ev)
    // A member is registered now, which is the exact condition ADR-825 unlocks a withheld
    // address on, so they get the full location and the calendar links.
    const location = ev.location
      || [ev.venue_name, ev.street, ev.city, ev.region].filter(Boolean).join(', ')
      || null
    const icsUrl = `${appUrl}/events/${ev.slug}/event.ics`
    const googleCalUrl = buildGoogleCalendarUrl({
      title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
      description: ev.description, location, timeZone: evTz,
    })
    const unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: appUrl, profileId, category: 'events' })

    await enqueueEmail({
      to: user.email,
      subject: `${PROMOTED_SEAT_LINE} ${ev.title}`,
      headers: listUnsubscribeHeaders(unsubscribeUrl),
      html: promotedSeatHtml({
        recipientName: profile.display_name ?? 'there',
        eventTitle: ev.title, whenAbsolute, location,
        hostName: ev.host?.display_name ?? null, circleName,
        eventUrl, icsUrl, googleCalUrl, unsubscribeUrl,
      }),
      text: promotedSeatText({
        recipientName: profile.display_name ?? 'there',
        eventTitle: ev.title, whenAbsolute, location,
        hostName: ev.host?.display_name ?? null, circleName,
        eventUrl, icsUrl, googleCalUrl, unsubscribeUrl,
      }),
    })
  } catch (e) {
    console.error('[events waitlist promoted] email failed', { eventId, e })
  }
}

type PromotedSeatEmailParts = {
  recipientName: string
  eventTitle: string
  whenAbsolute: string
  location: string | null
  hostName: string | null
  circleName: string | null
  eventUrl: string
  icsUrl: string
  googleCalUrl: string
  unsubscribeUrl: string
}

function hostLine(hostName: string | null, circleName: string | null): string | null {
  if (hostName && circleName) return `Hosted by ${hostName} for ${circleName}`
  if (hostName) return `Hosted by ${hostName}`
  if (circleName) return `Hosted by ${circleName}`
  return null
}

function promotedSeatHtml(p: PromotedSeatEmailParts): string {
  const host = hostLine(p.hostName, p.circleName)
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#3D352A;">
  <p style="font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#8F8675;margin:0 0 8px;">You're in</p>
  <h1 style="font-size:24px;font-weight:800;margin:0 0 16px;">${escapeHtml(p.eventTitle)}</h1>
  <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hi ${escapeHtml(p.recipientName)}, ${escapeHtml(PROMOTED_SEAT_LINE)} You were on the waitlist for this one and a seat just freed up, so it is yours. We'll send a reminder as it gets close.</p>
  <p style="font-size:15px;line-height:1.6;margin:0 0 4px;"><strong>When:</strong> ${escapeHtml(p.whenAbsolute)}</p>
  ${p.location ? `<p style="font-size:15px;line-height:1.6;margin:0 0 4px;"><strong>Where:</strong> ${escapeHtml(p.location)}</p>` : ''}
  ${host ? `<p style="font-size:15px;line-height:1.6;margin:0 0 4px;">${escapeHtml(host)}</p>` : ''}
  <p style="margin:24px 0;">
    <a href="${p.eventUrl}" style="display:inline-block;background:#3D352A;color:#FAF6EC;font-size:15px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px;">Open the event</a>
  </p>
  <p style="font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#8F8675;margin:24px 0 8px;">Add to your calendar</p>
  <p style="margin:0 0 8px;">
    <a href="${p.googleCalUrl}" style="display:inline-block;background:#FAF6EC;color:#3D352A;font-size:14px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0;">Google Calendar</a>
    <a href="${p.icsUrl}" style="display:inline-block;background:#FAF6EC;color:#3D352A;font-size:14px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0;">Apple / Outlook (.ics)</a>
  </p>
  <p style="font-size:14px;line-height:1.5;color:#6B6252;margin:24px 0 0;">Plans changed? Open the event and tap Going again to give the seat back.</p>
  <p style="font-size:12px;color:#8F8675;margin:32px 0 0;"><a href="${p.unsubscribeUrl}" style="color:#8F8675;">Unsubscribe from event emails</a></p>
</div>`.trim()
}

function promotedSeatText(p: PromotedSeatEmailParts): string {
  const host = hostLine(p.hostName, p.circleName)
  return [
    `Hi ${p.recipientName}, ${PROMOTED_SEAT_LINE}`,
    '',
    `You were on the waitlist for ${p.eventTitle} and a seat just freed up, so it is yours. We'll send a reminder as it gets close.`,
    '',
    `When: ${p.whenAbsolute}`,
    p.location ? `Where: ${p.location}` : null,
    host,
    '',
    `Open the event: ${p.eventUrl}`,
    '',
    `Add to your calendar:`,
    `Google Calendar: ${p.googleCalUrl}`,
    `Apple / Outlook (.ics): ${p.icsUrl}`,
    '',
    'Plans changed? Open the event and tap Going again to give the seat back.',
    '',
    `Unsubscribe from event emails: ${p.unsubscribeUrl}`,
  ].filter((l): l is string => l !== null).join('\n')
}

// ── The guest leg ────────────────────────────────────────────────────────────────────────────────

async function notifyGuest(args: {
  admin: ReturnType<typeof createAdminClient>
  guestEmail: string
  guestName: string | null
  ev: PromotedEvent
  eventUrl: string
  evTz: string
  whenAbsolute: string
  appUrl: string
}): Promise<void> {
  const { admin, guestEmail, guestName, ev, eventUrl, evTz, whenAbsolute, appUrl } = args
  try {
    const circleName = await loadCircleName(admin, ev)
    // The address gate, mirrored from lib/events/guest-rsvp-email.ts: city line and no calendar
    // links on a hidden-address event (ADR-825, ADR-854).
    const addressHidden = ev.hide_address === true
    const location = publicVisibleLocation(ev)
    const canShareCalendar = !addressHidden

    await sendGuestRsvpConfirmationEmail({
      to:           guestEmail,
      guestName,
      eventTitle:   ev.title,
      whenAbsolute,
      location,
      hostName:     ev.host?.display_name ?? null,
      circleName,
      eventUrl,
      icsUrl:       canShareCalendar ? `${appUrl}/events/${ev.slug}/event.ics` : null,
      googleCalUrl: canShareCalendar
        ? buildGoogleCalendarUrl({
            title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
            description: ev.description, location, timeZone: evTz,
          })
        : null,
      signUpUrl:    `${appUrl}/sign-in?next=${encodeURIComponent(`/events/${ev.slug}`)}&email=${encodeURIComponent(guestEmail)}`,
      status:       'going',
    })
  } catch (e) {
    console.error('[events waitlist promoted] guest email failed', e)
  }
}
