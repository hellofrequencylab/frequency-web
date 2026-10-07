'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for 1:1 booking (ENTITY-SPACES-SYSTEM section 2.4, booking v1).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure slot math
// or the shared types. Those live in lib/spaces/booking.ts (no directive: pure helpers + IO + the
// action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// surfaces import, so the mutations cross the network boundary as proper Server Actions:
//   booking-availability-form.tsx -> setSpaceAvailability
//   booking-picker.tsx            -> createBooking
//   booking-cancel-button.tsx     -> cancelBooking
//   the website's Book page       -> listGuestOpenSlotsAction / createGuestBookingAction (LIVE-835)
//
// SERVER components (booking-member, booking-owner-list, the pages) import the READ actions
// (listOpenSlots / listSpaceBookings / listSpaceAvailability / getSpaceBookingTimezone) directly
// from lib/spaces/booking.ts: they never cross a client boundary, so they need no wrapper. The
// authorization + validation all live in the implementations; these wrappers just re-expose them.

import { headers } from 'next/headers'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { rateLimitOk } from '@/lib/rate-limit'
import {
  setSpaceAvailability as setSpaceAvailabilityImpl,
  setSpaceServiceTypes as setSpaceServiceTypesImpl,
  setSpaceSchedule as setSpaceScheduleImpl,
  listOpenSlots as listOpenSlotsImpl,
  createBooking as createBookingImpl,
  rescheduleBooking as rescheduleBookingImpl,
  cancelBooking as cancelBookingImpl,
  startServiceDeposit as startServiceDepositImpl,
  listPublicOpenSlots,
  createGuestBooking as createGuestBookingImpl,
  type AvailabilityWindow,
  type ServiceTypeInput,
  type ScheduleInput,
  type OpenSlot,
} from '@/lib/spaces/booking'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Replace a Space's weekly availability. Gated on canEditProfile (see the implementation). */
export async function setSpaceAvailability(
  spaceId: string,
  windows: AvailabilityWindow[],
): Promise<ActionResult> {
  return setSpaceAvailabilityImpl(spaceId, windows)
}

/** Replace a Space's service types (the bookable "event types", P1). Gated on canEditProfile. */
export async function setSpaceServiceTypes(
  spaceId: string,
  services: ServiceTypeInput[],
): Promise<ActionResult> {
  return setSpaceServiceTypesImpl(spaceId, services)
}

/** Save a Space's scheduling rules + date overrides (buffers / notice / window, P2). canEditProfile. */
export async function setSpaceSchedule(
  spaceId: string,
  input: ScheduleInput,
): Promise<ActionResult> {
  return setSpaceScheduleImpl(spaceId, input)
}

/** The open slots for a chosen service (P1), so the client service picker can load times per service
 *  after the member picks one. Any authenticated member; FAIL-SAFE to [] in the implementation. */
export async function listOpenSlotsForService(
  spaceId: string,
  serviceTypeId: string | null,
): Promise<OpenSlot[]> {
  return listOpenSlotsImpl(spaceId, serviceTypeId)
}

/** Book an open slot. Any authenticated member; the slot is re-validated server-side. `serviceTypeId`
 *  (P1) validates the instant against the chosen service's duration + windows. `answers` (P3) captures
 *  the service's booking questions. */
export async function createBooking(
  spaceId: string,
  startsAtISO: string,
  note?: string,
  serviceTypeId?: string | null,
  answers?: Record<string, string> | null,
): Promise<ActionResult> {
  return createBookingImpl(spaceId, startsAtISO, note, serviceTypeId, answers)
}

/** Reschedule the member's own booking to a new time (P3). Atomic new-then-cancel, re-validated. */
export async function rescheduleBooking(
  bookingId: string,
  newStartsAtISO: string,
  serviceTypeId?: string | null,
): Promise<ActionResult> {
  return rescheduleBookingImpl(bookingId, newStartsAtISO, serviceTypeId)
}

/** Cancel a booking. The booker (within the policy window) or a space admin (gated in the
 *  implementation). `reason` (P3) is an optional member/owner-facing note. */
export async function cancelBooking(bookingId: string, reason?: string): Promise<ActionResult> {
  return cancelBookingImpl(bookingId, reason)
}

/** Open deposit checkout for a paid Space service type (P4, DARK: double-gated off, no-ops until
 *  payments are turned on). Returns a checkout URL to redirect to, or an error. */
export async function startServiceDeposit(
  spaceId: string,
  serviceTypeId: string,
  startsAtISO: string,
): Promise<{ url?: string; error?: string }> {
  return startServiceDepositImpl(spaceId, serviceTypeId, startsAtISO)
}

// ── LIVE-835: the guest door, for a Space website's Book page ────────────────────────────────────
// The second anonymous write surface beside the contact form (app/(main)/spaces/[slug]/contact-form-actions.ts),
// guarded the same way, in the order it runs:
//   1. The SPACE IS RESOLVED SERVER-SIDE FROM THE SLUG with an ANONYMOUS viewer (getVisibleSpaceBySlug(slug,
//      null)), never taken as an id, so a Private or missing Space fails closed.
//   2. The HONEYPOT answers exactly like a success and writes nothing.
//   3. A PER-IP RATE LIMIT (default deny-when-unconfigured), because a booking holds a slot.
// The slot itself is re-validated by the same core a member booking uses. Unlike the contact form, a
// booking cannot answer "success" when it failed: the visitor must know their time is not held.
//
// authz-ok: anonymous by design. The Space comes from a public slug resolved with an anonymous viewer; a
// honeypot and a per-IP rate limit sit above the write; the booking is re-validated server-side; the
// guest's consent comes only from their own tick.

/** The open slots a website visitor may book (LIVE-835). Anonymous; the Space is resolved from its public
 *  slug. FAIL-SAFE to []. */
export async function listGuestOpenSlotsAction(slug: string, serviceTypeId: string | null): Promise<OpenSlot[]> {
  const clean = typeof slug === 'string' ? slug.trim() : ''
  if (!clean) return []
  const space = await getVisibleSpaceBySlug(clean, null)
  if (!space) return []
  return listPublicOpenSlots(space.id, serviceTypeId)
}

interface GuestBookingActionInput {
  /** The Space's slug, from the website the picker renders on. Resolved server-side; see above. */
  slug: string
  startsAtISO: string
  name: string
  email: string
  note?: string | null
  serviceTypeId?: string | null
  answers?: Record<string, string> | null
  /** The guest ticked "Keep me posted". */
  optIn?: boolean
  /** Honeypot: bots fill it, people never see it. */
  company?: string
}

/** Book an open slot as a guest from a Space website (LIVE-835). Same ActionResult as createBooking. */
export async function createGuestBookingAction(input: GuestBookingActionInput): Promise<ActionResult> {
  // The honeypot answers like a success: telling a bot it was caught only teaches it to stop.
  if (typeof input.company === 'string' && input.company.trim()) return ok()

  const slug = typeof input.slug === 'string' ? input.slug.trim() : ''
  const space = slug ? await getVisibleSpaceBySlug(slug, null) : null
  if (!space) return fail('This space is not taking bookings right now.')

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('booking_guest', ip, 6, '10 m'))) {
    return fail('Too many bookings just now. Please try again in a few minutes.')
  }

  return createGuestBookingImpl({
    spaceId: space.id,
    startsAtISO: input.startsAtISO,
    name: input.name,
    email: input.email,
    note: input.note ?? null,
    serviceTypeId: input.serviceTypeId ?? null,
    answers: input.answers ?? null,
    optIn: input.optIn === true,
  })
}
