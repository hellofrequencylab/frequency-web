import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendGuestRsvpConfirmationEmail } from '@/lib/email'
// The same module the member-side sendRsvpConfirmation reads it from. Not a client component
// despite living under components/ — the builder is a pure URL function.
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'

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

/** Best-effort. Never throws into the RSVP path: a failed send must not change what the guest sees. */
export async function sendGuestRsvpReceipt(eventId: string, guestEmail: string): Promise<void> {
  try {
    const admin = createAdminClient()

    // hide_address and time_zone postdate the generated types, so this reads untyped and casts to
    // the shape actually used (repo convention, same as sendRsvpConfirmation).
    const { data: evRaw } = await admin
      .from('events')
      .select(
        'title, slug, starts_at, ends_at, location, description, is_cancelled, time_zone, ' +
        'hide_address, venue_name, street, city, region, scope_id, scope_type, ' +
        'host:profiles!host_id ( display_name )',
      )
      .eq('id', eventId)
      .maybeSingle()

    const ev = evRaw as unknown as {
      title: string; slug: string; starts_at: string; ends_at: string | null
      location: string | null; description: string | null; is_cancelled: boolean
      time_zone: string | null; hide_address: boolean | null
      venue_name: string | null; street: string | null; city: string | null; region: string | null
      scope_id: string | null; scope_type: string | null
      host: { display_name: string | null } | null
    } | null

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
      .select('status, guest_name')
      .eq('event_id', eventId)
      .eq('guest_email', guestEmail)
      .maybeSingle()

    const rsvp = rsvpRaw as { status: string; guest_name: string | null } | null
    const status = rsvp?.status
    // Only these two are a confirmation. Anything else (a host removed them, an approval is
    // pending, no row at all because the event was private or ticketed) gets no email: there is
    // nothing true to say, and a "your RSVP" note about a seat that does not exist is worse than
    // silence. It would also leak, by its arrival, that the event id was real.
    if (status !== 'going' && status !== 'waitlist') return

    const evTz = resolveZone(ev.time_zone)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    let circleName: string | null = null
    if (ev.scope_type === 'circle' && ev.scope_id) {
      const { data: c } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
      circleName = c?.name ?? null
    }

    // The gate, mirroring page.tsx. A guest is never `viewerRegistered`, so a hidden-address event
    // is hidden from them, full stop.
    const addressHidden = ev.hide_address === true
    const cityLine = [ev.city, ev.region].filter(Boolean).join(', ') || null
    const location = addressHidden
      ? cityLine
      : ev.location || [ev.venue_name, ev.street, ev.city, ev.region].filter(Boolean).join(', ') || null

    // Calendar links carry the address in their own LOCATION field, so they are suppressed
    // wholesale when the address is withheld — redacting only the visible line would leak it here.
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
