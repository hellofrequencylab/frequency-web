'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getMyProfileId } from '@/lib/auth'
import { rateLimitOk } from '@/lib/rate-limit'
import { createTicketCheckout, refundTicket, recordTicketFromSessionId } from '@/lib/billing/tickets'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { getEventCapabilities } from '@/lib/core/load-capabilities'
import { setRsvpStatus } from '@/app/(main)/events/actions'
import { submitGuestRsvp } from '@/app/(main)/events/guest-rsvp-actions'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { TICKETING_ENABLED } from '@/lib/events/ticketing'

// Start a ticket purchase: validates + records a pending ticket and returns the
// hosted Stripe Checkout URL for the client to redirect to (ADR-177). Real money,
// destination charge to the event host — the host must be payouts-ready.
//
// `ticketTypeId` selects a tier (omit for the event's flat price — backward compat).
// `amountCents` is the buyer's chosen amount for pwyc/sliding_scale/donation tiers;
// the floor (min_cents) is enforced server-side in createTicketCheckout. A `free`
// tier returns `{ free: true }` instead of a URL — there's nothing to charge.
export async function startTicket(
  eventId: string,
  opts?: {
    qty?: number
    ticketTypeId?: string | null
    amountCents?: number | null
  /**
   * 🔴 THE FALLBACK'S ONLY WAY HOME. Set by a caller whose on-page form already FAILED in the
   * browser, to demand a session it can actually redirect to.
   *
   * Without it the fallback asks this action again, this action asks for `elements` again (the
   * publishable key has not changed), and a second client secret comes back for a form that just
   * proved it cannot mount. The caller then finds no `url`, says "Could not start checkout" and
   * the buyer is stuck -- having burned two Stripe sessions and two pending rows. That was live in
   * production on 2026-09-15: every pair of event_tickets rows 14-90s apart is one buyer hitting
   * exactly this, and the pair at 23:49:47/23:50:01 is the screenshot that reported it.
   */
  forceHosted?: boolean
  },
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string; free?: boolean }>> {
  // Hard server-side off while platform payments are dormant (lib/events/ticketing):
  // a stale link or client must never reach Stripe.
  if (!TICKETING_ENABLED) return fail('Ticket sales are off right now.')

  const buyerProfileId = await getMyProfileId()
  if (!buyerProfileId) return fail('Sign in to buy a ticket.')

  // ── ON-PAGE WHEN WE CAN, HOSTED WHEN WE CANNOT (LIVE-347) ─────────────────────────────────
  // `onPageCheckoutAvailable()` is the publishable-key check. Reading it HERE rather than in the
  // browser means the decision is made once, on the server, before a session exists -- so a
  // deployment with no key never creates an elements session that nothing could render. The
  // client still branches on what actually came back, never on what was asked for, because this
  // is only the first of two places the on-page path can decline.
  const r = await createTicketCheckout({
    buyerProfileId,
    eventId,
    qty: opts?.qty ?? 1,
    ticketTypeId: opts?.ticketTypeId ?? null,
    amountCents: opts?.amountCents ?? null,
    ui: opts?.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
  })
  if (r.error) return fail(r.error)
  // Free tier: no money moves, no checkout (createTicketCheckout already enforced the
  // tier's active/member-only/inventory gates). Record the claim as a normal "going"
  // RSVP (ADR-410): it rides event capacity (full ⇒ waitlist, via the DB capacity
  // trigger), fires the first-RSVP gem + confirmation, and is idempotent — exactly the
  // path a free event already uses. We deliberately do NOT mint an event_tickets row or
  // bump the tier's `sold`, so a free tier's own `quantity` isn't separately enforced
  // for claims (event capacity governs); the inventory gate above still blocks a
  // sold-out free tier. Best-effort recording must not mask the claim from the client.
  if (r.free) {
    await setRsvpStatus(eventId, 'going')
    return ok({ free: true })
  }
  // Exactly one of these is ever set. A client secret means the card form mounts here; a url means
  // the buyer goes to Stripe, which is what happens whenever the on-page path declined.
  // The session id rides along with the secret so the caller can settle from its own success
  // handler (see `settleTicketAction`). It is not a capability: `recordTicketFromSessionId`
  // re-reads the session from Stripe and refuses anything that is not a PAID ticket session.
  if (r.clientSecret) return ok({ clientSecret: r.clientSecret, sessionId: r.sessionId })
  if (!r.url) return fail('Could not start checkout.')
  return ok({ url: r.url })
}

/**
 * Settle an on-page purchase the moment it is paid, without waiting for the webhook (LIVE-366).
 *
 * 🔴 WHY THIS EXISTS. `confirm({ redirect: 'if_required' })` is what keeps a buyer on the page, and
 * it means the common card path NEVER navigates. So the session's `return_url` -- the one carrying
 * `session_id={CHECKOUT_SESSION_ID}`, written as the webhook's backstop -- is never visited, and
 * the reconcile behind it is unreachable on exactly the path that became the default. Until this
 * action existed, an on-page ticket had ONE way to become real, and if that one way was late,
 * retried, or misconfigured, the buyer sat behind a confirmation panel telling them they were in
 * while no row flipped, no receipt sent and no host was told.
 *
 * ⚠️ IT DOES NOT REPLACE THE WEBHOOK, and must not. This runs in the buyer's tab, so it dies with
 * a closed laptop, a lost connection, or a 3DS hop that lands somewhere else. The webhook is the
 * guarantee; this is the fast path that makes the guarantee usually unnecessary.
 *
 * BOTH ARE SAFE TO RUN. `settle_ticket_atomic` flips one row `where status = 'pending'` and returns
 * what it flipped, so whichever arrives second matches nothing, returns no rows, and sends nothing.
 * That is the same guard a webhook redelivery already relies on.
 *
 * AUTHORITY: none of it is here. `recordTicketFromSessionId` re-fetches the session FROM STRIPE and
 * refuses unless `metadata.kind === 'ticket'` and `payment_status === 'paid'`, so the worst a
 * caller can do with someone else's id is settle a purchase that genuinely happened -- which is
 * precisely what the webhook would have done unprompted.
 */
// authz-ok: STRIPE IS THE AUTHORITY, and no session-holder gate is possible here. The caller may be
// a signed-out guest settling their OWN purchase, so `getMyProfileId()` would refuse the majority
// path this action exists to serve. What stands in its place is stronger than a session check:
// `recordTicketFromSessionId` re-fetches the session FROM STRIPE and refuses anything that is not
// `metadata.kind === 'ticket'` AND `payment_status === 'paid'`, so the most a caller can do with an
// id that is not theirs is settle a purchase that genuinely happened -- which is precisely what the
// webhook does, unprompted, seconds later. Nothing is read back to the caller but a boolean. The
// per-IP limiter below is what stops that boolean being used to enumerate.
export async function settleTicketAction(sessionId: string): Promise<ActionResult<{ settled: boolean }>> {
  if (!TICKETING_ENABLED) return fail('Ticket sales are off right now.')
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')
  // Same limiter the guest door uses, for the same reason: this endpoint answers a yes/no about a
  // session id, and a yes/no answered without limit is an oracle.
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  // ⚠️ `whenUnconfigured: 'allow'`, unlike the guest door below, and the asymmetry is deliberate.
  // This runs AFTER a successful charge. Denying it does not protect anything -- the webhook will
  // settle the same session regardless -- it only deletes the fast path, silently, on a deployment
  // where the limiter happens not to be wired. A door that takes money fails closed; a reconcile
  // that runs behind one fails open.
  if (!(await rateLimitOk('settle_ticket', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }
  try {
    const cents = await recordTicketFromSessionId(sessionId)
    return ok({ settled: cents != null })
  } catch (e) {
    // NEVER fatal to the buyer. They paid; the webhook still owes them the ticket, and a thrown
    // reconcile must not turn a successful payment into an error message. Loud, because a
    // swallowed failure here is the invisible regression AGENTS.md names.
    console.error('[tickets] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
}

// ── THE GUEST DOOR ──────────────────────────────────────────────────────────────────────────────
// A signed-out person who follows a shared link to a ticketed event used to be handed /sign-in and
// asked to make an account before they could pay. This is the other door, and it is the ticket
// sibling of app/(main)/events/guest-rsvp-actions.ts `submitGuestRsvp` — same honeypot, same
// per-IP limiter, same normalisation, same "the SQL is the one that counts" posture.
//
// IT IS A SEPARATE ACTION ON PURPOSE. Widening `startTicket` would have made its
// `getMyProfileId()` guard conditional, and a conditional auth guard on a money path is the kind
// of thing that reads as correct for a year. The member path above is untouched: it still refuses
// anyone without a profile, unambiguously.
//
// WHERE THE AUTHORITY IS. Not here. `createTicketCheckout` re-validates everything for a guest
// exactly as it does for a member (tier active, member_only, space_members_only, inventory, the
// min_cents floor, the payee's Connect readiness), and `reserve_ticket_atomic` re-checks the
// identity invariant and the capacity inside the transaction that inserts the row. Nothing in
// this function is the only thing standing between a caller and a bad outcome.

/** UX-only email shape. The SQL re-validates and is the one that counts; this exists so a typo
 *  gets a useful line instead of a failed checkout. Same expression `submitGuestRsvp` uses. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function startGuestTicket(input: {
  eventId: string
  email: string
  /** Forwarded on the FREE path only, where the claim is a guest RSVP row and `guest_name` is the
   *  host's roster line, exactly as the guest RSVP form records it. On a PRICED tier it is
   *  DELIBERATELY NOT FORWARDED: a pending ticket row carries `guest_email` and nothing else, and
   *  Stripe collects the billing name itself at the card step. Adding an unagreed metadata key
   *  across the webhook boundary to carry it would be inventing a contract the settle side did
   *  not ask for. */
  name?: string
  ticketTypeId?: string | null
  amountCents?: number | null
  qty?: number
  /** Honeypot. A real person never sees this field, so anything in it is a bot. */
  company?: string
  /**
   * 🔴 THE FALLBACK'S ONLY WAY HOME. Set by a caller whose on-page form already FAILED in the
   * browser, to demand a session it can actually redirect to.
   *
   * Without it the fallback asks this action again, this action asks for `elements` again (the
   * publishable key has not changed), and a second client secret comes back for a form that just
   * proved it cannot mount. The caller then finds no `url`, says "Could not start checkout" and
   * the buyer is stuck -- having burned two Stripe sessions and two pending rows. That was live in
   * production on 2026-09-15: every pair of event_tickets rows 14-90s apart is one buyer hitting
   * exactly this, and the pair at 23:49:47/23:50:01 is the screenshot that reported it.
   */
  forceHosted?: boolean
}): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string; free?: boolean }>> {
  // Hard server-side off, FIRST and for the same reason as the member path: a stale link or a
  // client must never reach Stripe while platform payments are dormant.
  if (!TICKETING_ENABLED) return fail('Ticket sales are off right now.')

  // Silent success for the honeypot: telling a bot it was caught only teaches it to stop filling
  // the field. `submitGuestRsvp` returns its full success shape here; this one returns a success
  // that CLAIMS NOTHING (no url, no free). The difference is deliberate and it is a money
  // difference: an RSVP is a seat, but "free: true" on a ticket door would tell a human whose
  // browser autofilled a hidden field that they hold a ticket they do not hold, and they would
  // travel to a door that has no record of them. No error string is returned either way, so the
  // bot learns nothing from us.
  if ((input.company || '').trim() !== '') return ok({})

  const email = (input.email || '').trim().toLowerCase()

  // Throttle this open, unauthenticated endpoint per IP. FAILS CLOSED in production when Upstash
  // is unconfigured (lib/rate-limit.ts), which is the correct direction for a door that reserves
  // inventory and creates a Stripe session. Runs BEFORE the signed-in check below so a caller
  // cannot buy themselves out of the limit by holding a session.
  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('event_guest_ticket', ip, 5, '10 m'))) {
    return fail('Too many requests. Please try again in a few minutes.')
  }

  // A SIGNED-IN CALLER GETS THEIR OWN TICKET, NOT A GUEST ROW. If someone has a profile, minting a
  // guest ticket keyed to a typed address would strand the ticket outside their account: it would
  // not show in their tickets, would not count as their RSVP, and would need a claim flow to
  // reunite them with it. So we prefer the identity we can prove (the session) over the one they
  // typed, and hand off to the member path, which re-reads `getMyProfileId()` itself.
  const myProfileId = await getMyProfileId()
  if (myProfileId) {
    return startTicket(input.eventId, {
      qty: input.qty,
      ticketTypeId: input.ticketTypeId ?? null,
      amountCents: input.amountCents ?? null,
    })
  }

  // UX validation only, and it echoes back nothing but the reader's own input.
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.')

  const r = await createTicketCheckout({
    ui: input.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted',
    guestEmail: email,
    eventId: input.eventId,
    qty: input.qty ?? 1,
    ticketTypeId: input.ticketTypeId ?? null,
    amountCents: input.amountCents ?? null,
  })
  if (r.error) return fail(r.error)

  // A FREE TIER, FOR A GUEST (LIVE-318). No money moves and no checkout is started, exactly as for
  // a member. The member path records its claim as a going RSVP through `setRsvpStatus`, which
  // needs a profile; the guest twin is `submitGuestRsvp`, whose SQL (`capture_guest_rsvp`,
  // 20270345004000) seats a guest on a tickets-mode event when the named tier is one of its free
  // tiers, and refuses everything else with the same opaque receipt. So a free claim lands as the
  // same event_rsvps row a free RSVP lands as: it rides event capacity (full means waitlist, via
  // the capacity trigger), waits on the host's approval setting, gets the guest RSVP receipt
  // email, and is attached to an account at sign-in through claim_guest_rsvps (a PROVEN address,
  // ADR-854). No event_tickets row is minted and the tier's `sold` is untouched, which is what
  // the member free path does too.
  //
  // `createTicketCheckout` has already refused a member-only, space-members-only, inactive or
  // sold-out tier for this guest; the SQL refuses them again because anon reaches it directly.
  // The name goes along on this path only: here it is the host's roster line, not a billing name.
  //
  // `submitGuestRsvp` runs its own honeypot and per-IP limiter (its own bucket) before the write.
  // The honeypot cannot fire (nothing is passed for it) and the second limiter is the same
  // 5 per 10 minutes, so a free claim costs one call from each of the two guest buckets; a
  // refusal from it is the plain "could not save your spot" line and is passed through as-is.
  if (r.free) {
    const seat = await submitGuestRsvp({
      eventId: input.eventId,
      email,
      name: input.name,
      ticketTypeId: input.ticketTypeId ?? null,
    })
    if (!seat.ok) return fail(seat.error)
    return ok({ free: true })
  }

  // Same seam as the member door: the id rides along so the guest's purchase settles the
  // moment it is paid instead of waiting on the webhook (LIVE-366).
  if (r.clientSecret) return ok({ clientSecret: r.clientSecret, sessionId: r.sessionId })
  if (!r.url) return fail('Could not start checkout.')
  return ok({ url: r.url })
}

// Refund a ticket (host action, EVENTS-SYSTEM §7). The caller must be able to edit
// this event's settings (they host it / manage its circle / are admin+) — the same
// gate the admin editor uses. The Stripe refund reverses the transfer and returns
// the platform fee; the webhook/reconcile flips the ticket to `refunded` and frees
// the tier's capacity. Real money — re-checked server-side, never trusts the client.
export async function refundTicketAction(
  ticketId: string,
  eventId: string,
  slug: string,
): Promise<ActionResult<void>> {
  if (!(await getMyProfileId())) return fail('Sign in.')
  const caps = await getEventCapabilities(eventId)
  if (!caps.has('event.editSettings')) return fail('You can’t refund tickets for this event.')

  const r = await refundTicket(ticketId, eventId)
  if (r.error) return fail(r.error)

  revalidatePath(`/events/${slug}`)
  revalidatePath(`/admin/events`)
  return ok()
}
