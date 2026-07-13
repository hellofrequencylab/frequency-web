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
//
// SERVER components (booking-member, booking-owner-list, the pages) import the READ actions
// (listOpenSlots / listSpaceBookings / listSpaceAvailability / getSpaceBookingTimezone) directly
// from lib/spaces/booking.ts: they never cross a client boundary, so they need no wrapper. The
// authorization + validation all live in the implementations; these wrappers just re-expose them.

import {
  setSpaceAvailability as setSpaceAvailabilityImpl,
  setSpaceServiceTypes as setSpaceServiceTypesImpl,
  setSpaceSchedule as setSpaceScheduleImpl,
  listOpenSlots as listOpenSlotsImpl,
  createBooking as createBookingImpl,
  rescheduleBooking as rescheduleBookingImpl,
  cancelBooking as cancelBookingImpl,
  startServiceDeposit as startServiceDepositImpl,
  type AvailabilityWindow,
  type ServiceTypeInput,
  type ScheduleInput,
  type OpenSlot,
} from '@/lib/spaces/booking'
import { type ActionResult } from '@/lib/action-result'

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
