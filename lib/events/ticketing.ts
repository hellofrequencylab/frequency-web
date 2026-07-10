// Platform-wide ticket sales switch.
//
// Ticket sales are ON: platform payments have been turned on (host_payouts_enabled
// + Stripe keys → payoutsLive()), so the event page renders the full checkout
// cascade (TicketButton and the "Ticket sales have closed." / "Sold out." / "Sign
// in to get your ticket" states), the paid mobile CTA shows, and startTicket opens
// a Stripe checkout. The Venmo-handle fallback (events.venmo_handle) is hidden
// while this is on. RSVP still works alongside paid tickets.
//
// This constant is the code-level master switch; the actual charge still also
// requires payoutsLive() (host_payouts_enabled flag AND a configured Stripe key),
// so a seller with no Connect account still can't be charged against. Flip to
// false to re-gate ticketing platform-wide without touching the flag.
export const TICKETING_ENABLED = true
