import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendGuestTicketEmail } from '@/lib/email'
import { formatEventWhen, resolveZone } from '@/lib/time/zone'
import { publicVisibleLocation } from '@/lib/events/visible-location'

// THE GUEST'S ONLY TICKET. A guest bought with a card and an address. There is no account, no
// "my events" page and no notification bell, so this email is the entire artifact of a real
// payment. If it does not send, somebody paid money and holds nothing.
//
// ── WHY THE ADMIN CLIENT LIVES HERE AND NOT IN THE WEBHOOK ───────────────────────────────────────
// The same reasoning as lib/events/guest-rsvp-email.ts, one layer down. The Stripe webhook is a
// money path: everything it does is already narrow, already idempotent, and already keyed on rows a
// SQL function returned it. Composing an email is none of those things. It needs the event's title,
// slug, time, zone, host and address fields, which are a wide read on a table the webhook otherwise
// never touches, and half of those columns are gated by a policy this module has to apply by hand.
// So the elevated read is QUARANTINED here, in the one module that owns the guest ticket message,
// and the webhook calls this fire-and-forget. A reader auditing "what does the webhook read" gets a
// short answer, and a reader auditing "what does a guest get told" gets one file.
//
// Nothing read here is returned to any caller. This function resolves void on every path.
//
// ── THE ADDRESS GATE, MIRRORED RATHER THAN REINVENTED ────────────────────────────────────────────
// `hide_address` withholds an exact address until a viewer is going, waitlisted, ticketed or
// managing (ADR-825). A GUEST ticket holder is ticketed in the row and NOT PROVEN as a person, so
// they get the same treatment every other unproven reader gets: `publicVisibleLocation`, which is
// the city line on a hidden-address event. Not a copy of the rule, the rule itself (SCAN-209).
// A typed, unproven address may receive a DELIVERY, but it may not unlock something a member would
// have to sign in for (ADR-854).
//
// ── 🔴 THE CLAIM LINK IS A MAGIC LINK, AND THAT IS THE WHOLE DESIGN ──────────────────────────────
// Stripe COLLECTS an email at checkout. It does not PROVE one. Nobody typed a password, nobody
// clicked a confirmation, and a card can be used with any address its holder likes. So the one
// account offer in this message is `/sign-in?next=/events/<slug>&email=<their address>`: exactly the
// shape guest-rsvp-email.ts builds for `signUpUrl`. The tap sends a Supabase magic link TO that
// address, and THE TAP IS WHAT PROVES IT. Only then does `claim_guest_tickets()` attach the ticket,
// because that function reads the address out of `auth.users` and never takes one as a parameter.
//
// Do NOT "improve" this into a one-click Create account button on the success page, or into anything
// that mints an account from the Stripe session. That would hand an account, and every ticket held
// by that address, to whoever finished a checkout form. The extra tap IS the proof of ownership.
// The address is prefilled for convenience only: the link lands in that person's own mailbox, so
// their own address inside it tells them nothing they do not already have.

/** The event fields this message needs, read once. */
type GuestTicketEvent = {
  title: string; slug: string; starts_at: string; is_cancelled: boolean
  time_zone: string | null; hide_address: boolean | null
  location: string | null
  venue_name: string | null; street: string | null; city: string | null; region: string | null
  scope_id: string | null; scope_type: string | null
  host: { display_name: string | null } | null
}

/** What the guest paid, as a plain label, or null when the amount is unknown.
 *  Whole amounts drop the cents, matching the house price format (lib/pricing/display.ts). */
export function formatTicketAmount(amountCents: number | null | undefined, currency: string | null): string | null {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || amountCents <= 0) return null
  const code = (currency || 'usd').toUpperCase()
  try {
    const label = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    }).format(amountCents / 100)
    return label
  } catch {
    // An unknown currency code from Stripe must not cost the guest their ticket email.
    return `${(amountCents / 100).toFixed(2)} ${code}`
  }
}

/**
 * Email a guest the ticket they just paid for, with one offer to attach it to an account.
 *
 * BEST-EFFORT ON EVERY PATH. It is called from the Stripe webhook's settle, where the ticket is
 * already `succeeded` by the time this runs: a failed email must never fail the webhook, because a
 * 500 there makes Stripe redeliver an event whose money work is already done. Every failure is
 * logged, because a fail-safe nobody can see fired is an invisible regression (AGENTS.md).
 *
 * Idempotency is the CALLER's, not this module's. `recordTicketFromSession` only reaches here for a
 * row that THIS delivery flipped pending -> succeeded, so a redelivered webhook flips nothing,
 * enters no loop, and sends nothing. There is no dedupe here to get wrong.
 */
export async function sendGuestTicketReceipt(opts: {
  eventId: string
  /** The address Stripe collected, already normalised by the caller. */
  guestEmail: string
  qty: number
  /** Gross paid, minor units, straight off the Checkout Session. Null prints no amount. */
  amountCents: number | null
  currency: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()

    // hide_address / time_zone postdate the generated types, so this reads untyped and casts to the
    // shape actually used (repo convention, ADR-246 — same as sendGuestRsvpReceipt).
    const { data } = await admin
      .from('events')
      .select(
        'title, slug, starts_at, is_cancelled, time_zone, hide_address, location, ' +
        'venue_name, street, city, region, scope_id, scope_type, ' +
        'host:profiles!host_id ( display_name )',
      )
      .eq('id', opts.eventId)
      .maybeSingle()
    const ev = data as unknown as GuestTicketEvent | null

    // No event row at all is a real problem and gets said out loud: the money moved, the ticket
    // row exists, and the thing it is a ticket TO cannot be read.
    if (!ev) {
      console.error('[guest ticket email] event not found; the ticket was NOT emailed', {
        eventId: opts.eventId,
      })
      return
    }
    // A cancelled event still gets the receipt, deliberately: they PAID. Saying nothing would leave
    // a charge on a card with no message attached to it. The cancellation path owns the refund and
    // its own notice (lib/events/cancellation.ts); this stays the record of the purchase.

    const evTz = resolveZone(ev.time_zone)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
    const eventUrl = `${appUrl}/events/${ev.slug}`

    // The Circle an event belongs to, when it belongs to one. Best-effort: a missing name costs a
    // byline, never the ticket.
    let circleName: string | null = null
    if (ev.scope_type === 'circle' && ev.scope_id) {
      const { data: circle } = await admin.from('circles').select('name').eq('id', ev.scope_id).maybeSingle()
      circleName = (circle as { name: string | null } | null)?.name ?? null
    }

    await sendGuestTicketEmail({
      to:           opts.guestEmail,
      eventTitle:   ev.title,
      whenAbsolute: formatEventWhen(ev.starts_at, evTz),
      // THE gate, applied here and nowhere else in this file.
      location:     publicVisibleLocation(ev),
      hostName:     ev.host?.display_name ?? null,
      circleName,
      eventUrl,
      qty:          opts.qty,
      amountLabel:  formatTicketAmount(opts.amountCents, opts.currency),
      // The magic link. See the header: the tap is what proves the address.
      claimUrl:     `${appUrl}/sign-in?next=${encodeURIComponent(`/events/${ev.slug}`)}&email=${encodeURIComponent(opts.guestEmail)}`,
    })
  } catch (e) {
    console.error('[guest ticket email]', e)
  }
}
