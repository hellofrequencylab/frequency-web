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
  createBooking as createBookingImpl,
  cancelBooking as cancelBookingImpl,
  type AvailabilityWindow,
} from '@/lib/spaces/booking'
import { type ActionResult } from '@/lib/action-result'

/** Replace a Space's weekly availability. Gated on canEditProfile (see the implementation). */
export async function setSpaceAvailability(
  spaceId: string,
  windows: AvailabilityWindow[],
): Promise<ActionResult> {
  return setSpaceAvailabilityImpl(spaceId, windows)
}

/** Book an open slot. Any authenticated member; the slot is re-validated server-side. */
export async function createBooking(
  spaceId: string,
  startsAtISO: string,
  note?: string,
): Promise<ActionResult> {
  return createBookingImpl(spaceId, startsAtISO, note)
}

/** Cancel a booking. The booker or a space admin only (gated in the implementation). */
export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  return cancelBookingImpl(bookingId)
}
