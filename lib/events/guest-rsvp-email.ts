import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendGuestRsvpConfirmationEmail, sendEventRsvpConfirmationEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
// The same module the member-side sendRsvpConfirmation reads it from. Not a client component
// despite living under components/ — the builder is a pure URL function.
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'
import { publicVisibleLocation } from '@/lib/events/visible-location'

// THE GUEST'S ONLY RECEIPT. A guest RSVP has no account, no notification bell and no "my events"
// page, so this email is the entire record that anything happened. If it does not send, the guest
// submitted a form into a void.
//
// ── WHY THE ADMIN CLIENT LIVES HERE AND NOT IN THE SERVER ACTION ─────────────────────────────────
// The action (app/(main)/events/guest-rsvp-actions.ts) runs on the SESSION client on purpose: the
// capture function is granted to anon and reachable over PostgREST directly, so the action is not a
// security boundary and must not hold powers the SQL is not already assuming. But composing this
// email needs to read something anon genuinely cannot see — whether the seat landed as `going` or
// `waitlist`, which RLS hides from a caller with no profile. So the elevated read is quarantined in
// this module, which the action calls fire-and-forget.
//
// 🔴 THE STATUS IS READ SERVER-SIDE AND NEVER RETURNED TO THE BROWSER. capture_guest_rsvp answers
// every caller with the same opaque receipt precisely so nobody can ask "is this person going to
// this event" (20270303000100). Reading the status here does not reopen that: it goes into the body
// of an email addressed to the person in question, and this function returns void. Anything that
// later plumbs this result back into the HTTP response undoes the whole design.
//
// ── THE ADDRESS GATE, MIRRORED RATHER THAN REINVENTED ────────────────────────────────────────────
// The event page hides an exact address when `hide_address` is set unless the viewer is going,
// waitlisted, ticketed or managing (ADR-825). A guest row is none of those. So a hidden-address
// event sends the CITY LINE and no calendar links, because an .ics and a Google Calendar URL both
// carry the address in a LOCATION field and would route around the visible redaction. A typed,
// unproven address may receive a DELIVERY, but it may not unlock something a member would have to
// sign in for (ADR-854).

/**
 * The untyped table surface (ADR-246), the read-side twin of the `UntypedRpc` handle the guest
 * server action uses. Narrow on purpose: only the chained shape this file actually calls.
 */
type UntypedTable = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
        }
      }
    }
  }
}

/** The event fields every guest-facing email in this file needs, read once. */
type GuestEmailEvent = {
  title: string; slug: string; starts_at: string; ends_at: string | null
  location: string | null; description: string | null; is_cancelled: boolean
  time_zone: string | null; hide_address: boolean | null
  venue_name: string | null; street: string | null; city: string | null; region: string | null
  scope_id: string | null; scope_type: string | null
  host: { display_name: string | null } | null
}

/** hide_address and time_zone postdate the generated types, so this reads untyped and casts to the
 *  shape actually used (repo convention, same as sendRsvpConfirmation). */
async function loadGuestEmailEvent(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<GuestEmailEvent | null> {
  const { data } = await admin
    .from('events')
    .select(
      'title, slug, starts_at, ends_at, location, description, is_cancelled, time_zone, ' +
      'hide_address, venue_name, street, city, region, scope_id, scope_type, ' +
      'host:profiles!host_id ( display_name )',
    )
    .eq('id', eventId)
    .maybeSingle()
  return data as unknown as GuestEmailEvent | null
}

/** The Circle an event belongs to, by name, when it belongs to one. */
async function loadCircleName(
  admin: ReturnType<typeof createAdminClient>,
  ev: GuestEmailEvent,
): Promise<string | null> {
  if (ev.scope_type !== 'circle' || !ev.scope_id) return null
  const { data } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
  return data?.name ?? null
}

/** What a guest may be shown, and whether they may be handed a calendar file.
 *
 *  The gate mirrors page.tsx rather than reinventing it: a guest never satisfies the
 *  going/waitlist/ticket test that unlocks a withheld address (ADR-825), so a hidden-address event
 *  gives them the city line. Calendar links go too, wholesale — an .ics carries the address in its
 *  own LOCATION field, so redacting the visible line alone would leak it straight back. */
function guestVisibleLocation(ev: GuestEmailEvent): { location: string | null; addressHidden: boolean } {
  // The rule itself now lives in lib/events/visible-location.ts. It was module-private here, and the
  // comment above turned out to be a prediction rather than a caveat: the .ics surfaces did leak the
  // address straight back, because they had no way to reach this function (SCAN-209). Same behaviour,
  // one copy.
  return { addressHidden: ev.hide_address === true, location: publicVisibleLocation(ev) }
}

/** Best-effort. Never throws into the RSVP path: a failed send must not change what the guest sees. */
export async function sendGuestRsvpReceipt(eventId: string, guestEmail: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const ev = await loadGuestEmailEvent(admin, eventId)

    // A cancelled event sends nothing. The capture function already refuses to seat anyone on one,
    // so reaching here means it was cancelled between the insert and this read.
    if (!ev || ev.is_cancelled) return

    // The seat as it actually landed. `.eq` is safe rather than `.ilike` here because
    // capture_guest_rsvp lowercases and trims before inserting, and this is handed the same
    // normalised string the action sent it — there is no user-typed casing left at this point.
    //
    // Untyped (ADR-246): guest_email/guest_name are live columns that lib/database.types.ts has not
    // been regenerated for, and `.eq()` is typed from that same generated file. The cast goes when
    // the types are refreshed and every caller is retyped in one pass.
    const { data: rsvpRaw } = await (admin as unknown as UntypedTable)
      .from('event_rsvps')
      .select('status, guest_name, approval_status')
      .eq('event_id', eventId)
      .eq('guest_email', guestEmail)
      .maybeSingle()

    const rsvp = rsvpRaw as {
      status: string; guest_name: string | null; approval_status: string | null
    } | null
    // No row at all (the event was private, ticketed, past, cancelled or never existed) gets no
    // email: there is nothing true to say, and the arrival of a message would itself confirm the
    // event id was real, which is the one thing capture_guest_rsvp refuses to tell anyone.
    if (rsvp?.status !== 'going' && rsvp?.status !== 'waitlist') return

    // 🔴 APPROVAL OUTRANKS STATUS. capture_guest_rsvp writes status='going' AND
    // approval_status='pending' on an approval-gated event, so reading status alone would send
    // "You're going" to somebody who is not going and may never be. The row says `going` because
    // that is the seat they are asking for, not the seat they hold.
    const status: 'going' | 'waitlist' | 'pending' =
      rsvp.approval_status === 'pending' ? 'pending'
      : rsvp.status === 'going' ? 'going'
      : 'waitlist'

    const evTz = resolveZone(ev.time_zone)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    const circleName = await loadCircleName(admin, ev)
    const { location, addressHidden } = guestVisibleLocation(ev)
    // Nothing to add to a calendar until there is actually a spot.
    const canShareCalendar = status === 'going' && !addressHidden

    await sendGuestRsvpConfirmationEmail({
      to:           guestEmail,
      guestName:    rsvp?.guest_name ?? null,
      eventTitle:   ev.title,
      whenAbsolute: formatEventWhen(ev.starts_at, evTz),
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
      // Carries the address so the sign-in form is prefilled: the seat can only be claimed by
      // signing in with THIS address (claim_guest_rsvps reads it from auth.users), so making the
      // guest retype it is friction with no security value. The link lands in their own mailbox,
      // so their own address in it reveals nothing they do not already have.
      signUpUrl:    `${appUrl}/sign-in?next=${encodeURIComponent(`/events/${ev.slug}`)}&email=${encodeURIComponent(guestEmail)}`,
      status,
    })
  } catch (e) {
    console.error('[guest rsvp receipt]', e)
  }
}


// ── "You're in" ──────────────────────────────────────────────────────────────────────────────────
//
// Sent when a host admits a seat from the approval queue. Without it the approval gate is a trap:
// somebody asks to come, the request sits in a queue they cannot see, the host clicks Approve, and
// nothing whatsoever reaches the person who asked. They would find out by opening the event page on
// the off chance. A gate that never says yes out loud is worse than no gate, because the member who
// requested has been told to wait and is then never released.
//
// Handles BOTH identities, because the queue does. A member has a profile and preferences, so the
// send routes through the same pref + suppression gate as every other member email; a guest has
// neither, so it takes the transactional carve-out the rest of this file uses.

/** Best-effort. Never throws into the approve action — a failed email must not un-approve anyone. */
export async function sendRsvpApprovedNotice(eventId: string, rsvpId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const ev = await loadGuestEmailEvent(admin, eventId)
    if (!ev || ev.is_cancelled) return

    // Read the seat back rather than trusting the caller: this runs after the update, so it reports
    // what the row actually says, including a `waitlist` the capacity trigger may have imposed.
    const { data: rsvpRaw } = await (admin as unknown as UntypedTable)
      .from('event_rsvps')
      .select('status, approval_status, profile_id, guest_email, guest_name')
      .eq('id', rsvpId)
      .eq('event_id', eventId)
      .maybeSingle()

    const rsvp = rsvpRaw as {
      status: string; approval_status: string | null
      profile_id: string | null; guest_email: string | null; guest_name: string | null
    } | null
    if (!rsvp) return

    // Only an APPROVED seat gets this. If the row is still pending, the update did not land and
    // telling someone they are in would be a lie we then have to retract.
    if (rsvp.approval_status !== 'approved') return
    if (rsvp.status !== 'going' && rsvp.status !== 'waitlist') return
    const status: 'going' | 'waitlist' = rsvp.status === 'going' ? 'going' : 'waitlist'

    const circleName = await loadCircleName(admin, ev)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`
    const evTz = resolveZone(ev.time_zone)
    const whenAbsolute = formatEventWhen(ev.starts_at, evTz)

    // ── The member leg. Approval is the moment they became a real attendee, so this is exactly the
    // confirmation the RSVP itself would have sent had there been no gate — same template, same
    // preference category, same suppression.
    if (rsvp.profile_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('display_name, auth_user_id')
        .eq('id', rsvp.profile_id)
        .maybeSingle()
      if (!profile?.auth_user_id) return
      const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
      if (!user?.email) return
      // The ONE seam (ADR-169), not the bare preference read it replaced, which skipped suppression
      // (meta-scan B9 H6). Address first so suppression can see it. No subject: this confirms the
      // member's own seat, not a Circle they may have muted.
      if (!(await resolveSendGate(rsvp.profile_id, 'email', 'events', { email: user.email })).allowed) return

      // A member is not subject to the guest address gate: they are registered now, which is the
      // exact condition ADR-825 unlocks a withheld address on.
      const location = ev.location
        || [ev.venue_name, ev.street, ev.city, ev.region].filter(Boolean).join(', ')
        || null

      await sendEventRsvpConfirmationEmail({
        to:                 user.email,
        recipientName:      profile.display_name ?? 'there',
        recipientProfileId: rsvp.profile_id,
        eventTitle:         ev.title,
        whenAbsolute,
        location,
        hostName:           ev.host?.display_name ?? null,
        circleName,
        eventUrl,
        icsUrl:             status === 'going' ? `${appUrl}/events/${ev.slug}/event.ics` : null,
        googleCalUrl:       status === 'going'
          ? buildGoogleCalendarUrl({
              title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
              description: ev.description, location, timeZone: evTz,
            })
          : null,
        status,
      })
      return
    }

    // ── The guest leg. Same address gate as every other guest email here: being approved is not
    // the same as being registered, and the seat is still keyed to an address nobody has proven.
    if (!rsvp.guest_email) return
    const { location, addressHidden } = guestVisibleLocation(ev)
    // Nothing to add to a calendar until there is actually a spot.
    const canShareCalendar = status === 'going' && !addressHidden

    await sendGuestRsvpConfirmationEmail({
      to:           rsvp.guest_email,
      guestName:    rsvp.guest_name,
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
      signUpUrl:    `${appUrl}/sign-in?next=${encodeURIComponent(`/events/${ev.slug}`)}&email=${encodeURIComponent(rsvp.guest_email)}`,
      status,
    })
  } catch (e) {
    console.error('[rsvp approved notice]', e)
  }
}
