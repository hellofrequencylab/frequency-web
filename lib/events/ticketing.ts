// Platform-wide ticket sales switch.
//
// Ticket sales are OFF for now (platform payments have not been turned on).
// While off, the event page keeps the "$X ticket" price header but renders no
// checkout cascade (no TicketButton, no "Ticket sales have closed." / "Sold
// out." / "Sign in to get your ticket" states), the paid mobile CTA is
// suppressed, RSVP stays open on priced events, and startTicket refuses to
// start a Stripe checkout. Hosts can point guests at their Venmo handle
// (events.venmo_handle) in the meantime.
//
// All the ticketing code is GATED, not deleted — flip this one constant to
// bring checkout back.
export const TICKETING_ENABLED = false
