// ONE rule for "does this viewer HOLD a ticket?" versus "did a purchase just CONFIRM?" (LIVE-322).
//
// 🔴 THE DEFECT THIS CLOSES. The event page derived `ownsTicket` from two sources and merged them:
// the viewer's own `event_tickets` row (`hasTicket(event.id, myProfileId)`), and the Stripe success
// redirect `?ticket=success&session_id=…`, which `recordTicketFromSessionId` reconciles into a
// priced amount. The merge was `if (ticketedCents !== null) ownsTicket = true` — for ANY reader,
// signed in or not. `ownsTicket` feeds `viewerRegistered`, and `viewerRegistered` is what unhides a
// hidden venue (ADR-825: street, postal, precise pin, maps link). A guest buyer receives exactly
// such a URL (#2556), so a forwarded receipt link handed the hidden venue to whoever opened it,
// while the receipt email itself withholds the address on purpose.
//
// The rule is ADR-854's, one gate over: an unverified claim may address a DELIVERY, never unlock a
// CAPABILITY. A session id in a URL is a claim. It may confirm the purchase message ("you're in"),
// because that sentence discloses nothing. It may never stand in for registration, because
// registration discloses the venue and the online join link.
//
// So the two facts are kept apart by name:
//   · `ownsTicket`        — the viewer is signed in AND their profile holds the ticket row. This is
//                           the only input to `viewerRegistered`.
//   · `purchaseConfirmed` — the redirect reconciled to a paid session. Banner copy only.
//
// A signed-in buyer loses nothing: the page awaits the reconcile BEFORE it reads `hasTicket`, so
// by the time ownership is derived the row it wrote for that profile is already there.

export interface TicketOwnershipInput {
  /** The signed-in viewer's profile id, or null for a signed-out reader. */
  viewerProfileId: string | null
  /** `hasTicket(event.id, viewerProfileId)` — the DB row for THIS profile. Ignored when signed out. */
  holdsTicketRow: boolean
  /** `recordTicketFromSessionId(session_id)` — gross cents when the URL's session reconciled to a
   *  paid ticket, else null. Never a proof of who the reader is. */
  reconciledCents: number | null
}

export interface TicketOwnership {
  /** Registration-grade: unhides the venue, the join link, and the RSVP row. */
  ownsTicket: boolean
  /** Message-grade: "your ticket is confirmed". Never feed this into `viewerRegistered`. */
  purchaseConfirmed: boolean
}

/** Derive the two ticket facts the event page renders from. Pure; the DB and Stripe reads happen
 *  in the caller so this can be pinned by a test without rendering the page. */
export function deriveTicketOwnership(input: TicketOwnershipInput): TicketOwnership {
  const ownsTicket = input.viewerProfileId !== null && input.holdsTicketRow
  const purchaseConfirmed = input.reconciledCents !== null
  return { ownsTicket, purchaseConfirmed }
}
