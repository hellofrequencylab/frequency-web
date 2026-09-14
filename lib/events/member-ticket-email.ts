import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendMemberTicketEmail } from '@/lib/email'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'
import { publicVisibleLocation } from '@/lib/events/visible-location'
import { buildGoogleCalendarUrl } from '@/components/events/add-to-calendar'
import { formatTicketAmount } from '@/lib/events/guest-ticket-email'

// THE MEMBER'S TICKET RECEIPT (LIVE-316). The sibling of lib/events/guest-ticket-email.ts, one
// identity over. Until this existed a member who paid for a ticket got nothing at all: no email,
// no calendar link, no record outside the ticket row. The guest had a better post-purchase
// experience than the member, and a guest claimed inside the pre-webhook window inherited the gap,
// because the settle treats an already-claimed row as a member's.
//
// ── SAME QUARANTINE AS THE GUEST MODULE ──────────────────────────────────────────────────────────
// The Stripe webhook is a money path and stays narrow. Composing this message needs a wide read on
// `events`, a tier name, a Circle name, the member's display name and their account address, none
// of which the webhook otherwise touches. All of it lives here, the webhook calls this
// fire-and-forget, and nothing read here is returned to any caller. Resolves void on every path.
//
// ── THE GATE IS THE TRANSACTIONAL ONE ────────────────────────────────────────────────────────────
// A receipt is the record of a payment, not a nudge. It goes through `resolveSendGate` with the
// 'transactional' category (lib/comms/send-gate.ts names receipts in that carve-out by word), so a
// member who muted event reminders still gets the record of what they bought, and only the hard
// suppression list (a bounced or complained address) can stop it. The RSVP confirmation uses the
// 'events' category because a seat is free to walk away from; a charge on a card is not.
//
// ── 🔴 THE ADDRESS GATE, HELD TO THE GUEST RULE ON PURPOSE ───────────────────────────────────────
// A member who holds a succeeded ticket IS the reader ADR-825 unlocks the exact address for on the
// event page. This message still prints `publicVisibleLocation`, the city line on a hide_address
// event, and offers no calendar file there, exactly as the guest receipt does today. The reason is
// what an email is: the page checks who is asking at read time, and a message cannot. A receipt
// gets forwarded, lands in a shared inbox, and the .ics is a file with the address in its LOCATION
// field (SCAN-209), so the hidden venue would leave the account the moment the mail did. The
// message says where the address is instead, and the page hands it over to the ticket holder.
// Kept explicit in ./member-ticket-email.test.ts. Widening it is a decision, not a fix.

/** The event fields this message needs, read once. */
type MemberTicketEvent = {
  title: string; slug: string; starts_at: string; ends_at: string | null; description: string | null
  is_cancelled: boolean; time_zone: string | null; hide_address: boolean | null
  location: string | null
  venue_name: string | null; street: string | null; city: string | null; region: string | null
  scope_id: string | null; scope_type: string | null
  host: { display_name: string | null } | null
}

/**
 * Email a member the receipt for the ticket they just paid for.
 *
 * BEST-EFFORT ON EVERY PATH, for the same reason as the guest receipt: it runs from the Stripe
 * webhook's settle, after the ticket is already `succeeded`, and a throw there turns a finished
 * payment into a 500 that Stripe redelivers to no effect. Every failure is logged, because a
 * fail-safe nobody can see fired is an invisible regression (AGENTS.md).
 *
 * Idempotency is the CALLER's. `recordTicketFromSession` only reaches here for a row THIS delivery
 * flipped pending -> succeeded, so a redelivery flips nothing and sends nothing.
 */
export async function sendMemberTicketReceipt(opts: {
  eventId: string
  /** The buyer, off the settled row. */
  profileId: string
  /** The tier bought, or null on a flat-price event with no tiers. */
  ticketTypeId: string | null
  qty: number
  /** Gross paid, minor units, straight off the Checkout Session. Null prints no amount. */
  amountCents: number | null
  currency: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()

    // hide_address / time_zone postdate the generated types, so this reads untyped and casts to the
    // shape actually used (repo convention, ADR-246, same as the guest receipt).
    const { data } = await admin
      .from('events')
      .select(
        'title, slug, starts_at, ends_at, description, is_cancelled, time_zone, hide_address, location, ' +
        'venue_name, street, city, region, scope_id, scope_type, ' +
        'host:profiles!host_id ( display_name )',
      )
      .eq('id', opts.eventId)
      .maybeSingle()
    const ev = data as unknown as MemberTicketEvent | null

    // No event row is a real problem and gets said out loud: the money moved, the ticket row
    // exists, and the thing it is a ticket TO cannot be read.
    if (!ev) {
      console.error('[member ticket email] event not found; the receipt was NOT emailed', {
        eventId: opts.eventId,
        profileId: opts.profileId,
      })
      return
    }
    // A cancelled event still gets the receipt, deliberately: they PAID. The cancellation path
    // owns the refund and its own notice (lib/events/cancellation.ts); this is the purchase record.

    // The member: a display name to greet and the PROVEN account address to send to. A profile
    // with no auth user, or a user with no address, is nobody this can reach, and says so.
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, auth_user_id')
      .eq('id', opts.profileId)
      .maybeSingle()
    if (!profile?.auth_user_id) {
      console.error('[member ticket email] buyer has no auth user; the receipt was NOT emailed', {
        profileId: opts.profileId,
      })
      return
    }
    const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (!user?.email) {
      console.error('[member ticket email] buyer has no account email; the receipt was NOT emailed', {
        profileId: opts.profileId,
      })
      return
    }

    // The ONE seam (ADR-169). Transactional: prefs and frequency step aside, suppression does not.
    const gate = await resolveSendGate(opts.profileId, 'email', 'transactional', { email: user.email })
    if (!gate.allowed) {
      console.warn('[member ticket email] send gate refused the receipt', {
        profileId: opts.profileId,
        reason: gate.reason,
      })
      return
    }

    const evTz = resolveZone(ev.time_zone)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    // The tier's name and the Circle's, both best-effort: a missing name costs a label, never the
    // receipt.
    let tierName: string | null = null
    if (opts.ticketTypeId) {
      const { data: tier } = await admin
        .from('event_ticket_types')
        .select('name')
        .eq('id', opts.ticketTypeId)
        .maybeSingle()
      tierName = (tier as { name: string | null } | null)?.name ?? null
    }
    let circleName: string | null = null
    if (ev.scope_type === 'circle' && ev.scope_id) {
      const { data: circle } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
      circleName = (circle as { name: string | null } | null)?.name ?? null
    }

    // THE gate, applied here and nowhere else in this file. See the header for why a ticketed
    // member is held to it in a message.
    const addressHidden = ev.hide_address === true
    const location = publicVisibleLocation(ev)

    await sendMemberTicketEmail({
      to:            user.email,
      recipientName: profile.display_name ?? 'there',
      eventTitle:    ev.title,
      whenAbsolute:  formatEventWhen(ev.starts_at, evTz),
      location,
      addressHidden,
      hostName:      ev.host?.display_name ?? null,
      circleName,
      eventUrl,
      qty:           opts.qty,
      tierName,
      amountLabel:   formatTicketAmount(opts.amountCents, opts.currency),
      // The same ICS route and Google URL the event page and the RSVP confirmation use. Both go
      // wholesale on a hidden-address event: the .ics carries the address in its LOCATION field.
      icsUrl:        addressHidden ? null : `${appUrl}/events/${ev.slug}/event.ics`,
      googleCalUrl:  addressHidden
        ? null
        : buildGoogleCalendarUrl({
            title: ev.title, startsAt: ev.starts_at, endsAt: ev.ends_at,
            description: ev.description, location, timeZone: evTz,
          }),
    })
  } catch (e) {
    console.error('[member ticket email]', e)
  }
}
