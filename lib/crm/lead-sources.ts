// WHICH DOORS A LEAD CAME THROUGH, AND WHICH OF THEM WERE NEVER A SIGNUP TO ABANDON.
//
// `signup_leads` holds one row per person who gave us an address, whatever door they gave it at.
// Two of those doors are funnels somebody started and did not finish (`beta_induction`,
// `feature_funnel`). One of them is not: `event_rsvp` is a person who came to the site to say they
// were coming to an event, typed one address, and COMPLETED what they set out to do.
//
// Mailing that person "you never finished signing up" would be a note about something they never
// started, and showing them to an operator on a list headed "people who gave an email and never
// finished" is the same mistake delivered by a human instead. Both readers therefore skip the
// sources named below.
//
// ── WHY THIS LIVES IN ITS OWN MODULE ─────────────────────────────────────────────────────────────
// Both readers need the same list, and only one seam may own it. The obvious home was the mailer
// (lib/crm/signup-lead-recovery.ts), but the operator-facing reader (lib/crm/signup-leads.ts) would
// then import the mailer, which pulls `lib/email` (resend, the outbox) into the server graph of the
// /admin/crm/leads route for the sake of one array of strings. Anything reachable from a route is
// carried by that route's function (docs/DEPLOY-SAFETY.md), so a constant does not get to drag a
// mail transport behind it. This module imports nothing.
//
// ── THE SEAM TO CHANGE LATER ─────────────────────────────────────────────────────────────────────
// Excluding event guests is the SAFE half of a decision whose other half is not built yet: they
// should eventually get their own note, warm and event-shaped, rather than silence. When that note
// lands, this list is the one line to edit, and both readers follow.

/**
 * Lead sources that are NOT an abandoned signup. Neither the recovery mailer nor the operator's
 * abandoned-signup list may act on a row carrying one of these.
 *
 * Both call sites guard on `.length > 0` before building a PostgREST `not.in` filter, because
 * PostgREST cannot parse `not in ()`. That keeps emptying this list a safe one-line edit.
 */
export const RECOVERY_EXCLUDED_SOURCES = ['event_rsvp'] as const

/** True when this lead came through a door that completed something rather than abandoning it. */
export function isRecoveryExcludedSource(source: string): boolean {
  return (RECOVERY_EXCLUDED_SOURCES as readonly string[]).includes(source)
}

/** The excluded set as a PostgREST `in` list, e.g. `("event_rsvp")`. */
export function recoveryExcludedSourceFilter(): string {
  return `(${RECOVERY_EXCLUDED_SOURCES.map((s) => `"${s}"`).join(',')})`
}
