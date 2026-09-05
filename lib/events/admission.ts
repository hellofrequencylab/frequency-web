// ONE rule for "is this RSVP an ADMISSION, or still a REQUEST?" (SCAN-528/529/530 class).
//
// 🔴 THE DEFECT THIS CLOSES. The host's approval gate (20260625020000) writes a pending request the
// same way it writes an admitted seat: `status='going'` with `approval_status='pending'`. That is
// deliberate — `app/(main)/events/actions.ts` says so at the insert: "A pending seat is a REQUEST,
// not an admission, so it is written the same way a guest's is." The consequence is that
// `status === 'going'` ALONE IS NEVER A SEAT, and every reader has to remember the second half.
//
// Four query-layer readers do remember it, with a literal `.neq('approval_status', 'pending')`:
// lib/events/capacity.ts:45 and :100, lib/events/connectors.ts:72, lib/events/going-counts.ts:109.
// Two readers that hold the row in memory did NOT, and both were guarding something that matters:
//
//   · app/(main)/events/[slug]/page.tsx — `viewerRegistered` decided whether a viewer may see a
//     HIDDEN venue (ADR-825: venue name, street, postal, precise pin, maps link). It read
//     `myRsvpStatus === 'going'` while `myApprovalStatus` sat resolved 493 lines above it. So
//     tapping "Request to join" disclosed the exact address before the host had decided — and the
//     host's decline could not take it back.
//   · checkInEvent (app/(main)/events/actions.ts) — selected `status` only, so a pending requester
//     could check in through the printed QR door and collect the attendance streak, the Zaps and
//     permanent verified-member standing.
//
// The rule was swept through the side effects (no seat email, no feed line, no gems) and missed on
// the two readers that gate the actual secrets. This module exists so the next reader inherits it
// instead of re-deriving it: a rule that lives in one consumer is a rule the next consumer does not
// know about (the lesson lib/events/visible-location.ts was written for, one gate over).
//
// ⚪ WHY THERE IS NO 'declined' CASE. The CHECK constraint is
// `approval_status in ('none','pending','approved')` (20260625020000:43) — a host's refusal removes
// the row rather than marking it, so "not pending" is complete. If a 'declined' value is ever added,
// this is the one place that has to learn about it.

/** The two columns the rule needs. Structural, so any row shape carrying them can be passed —
 *  including the untyped `as unknown as` read surfaces (ADR-246) these columns are read through. */
export interface AdmissionFields {
  status?: string | null
  approval_status?: string | null
}

/** Is this seat waiting on the host? `approval_status` is NOT NULL with default 'none', so a plain
 *  equality is complete for a row read from the table; the null tolerance is for partial selects. */
export function isPendingApproval(rsvp: AdmissionFields): boolean {
  return rsvp.approval_status === 'pending'
}

/** Does this RSVP admit the member — i.e. may a reader treat them as actually holding the seat?
 *
 *  `going` or `waitlist` AND not waiting on the host. Waitlist counts as admitted for the purposes
 *  this predicate serves (seeing the venue) because a waitlisted member has been let through the
 *  host's gate and is queued on CAPACITY, not on approval — the distinction ADR-825 draws is
 *  "registered", not "seated". Callers that need a confirmed seat specifically should test
 *  `status === 'going'` themselves in addition to this. */
export function isAdmitted(rsvp: AdmissionFields): boolean {
  if (isPendingApproval(rsvp)) return false
  return rsvp.status === 'going' || rsvp.status === 'waitlist'
}
