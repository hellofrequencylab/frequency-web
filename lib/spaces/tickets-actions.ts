'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for Event Space ticketing (MASTER-PLAN ADMIN-03).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure tier helpers
// or the shared types. Those live in lib/spaces/tickets.ts (no directive: pure helpers + IO + the
// action implementations + types, all unit-testable). This thin file is the seam the CLIENT surfaces
// import, so the mutations cross the network boundary as proper Server Actions:
//   ticket-tier-form.tsx -> setTicketTiers
//   (the member RSVP surface, ADMIN-04) -> rsvpToTier / cancelRsvp
//
// SERVER components (the owner RSVP list, the pages) import the READ actions (listTicketTiers /
// listAllTicketTiers / getMyRsvp / listSpaceRsvps) directly from lib/spaces/tickets.ts: they never
// cross a client boundary, so they need no wrapper. The authorization + validation all live in the
// implementations; these wrappers just re-expose them. NO money is involved (ADMIN-03).

import {
  setTicketTiers as setTicketTiersImpl,
  rsvpToTier as rsvpToTierImpl,
  cancelRsvp as cancelRsvpImpl,
  type TicketTier,
} from '@/lib/spaces/tickets'
import { type ActionResult } from '@/lib/action-result'

/** Replace a Space's ticket tiers. Gated on canEditProfile (see the implementation). */
export async function setTicketTiers(spaceId: string, tiers: TicketTier[]): Promise<ActionResult> {
  return setTicketTiersImpl(spaceId, tiers)
}

/** RSVP to a tier. Any authenticated member; v1 records the RSVP and takes no charge. */
export async function rsvpToTier(spaceId: string, tierId: string): Promise<ActionResult> {
  return rsvpToTierImpl(spaceId, tierId)
}

/** Cancel an RSVP. The member who reserved or a space admin only (gated in the implementation). */
export async function cancelRsvp(rsvpId: string): Promise<ActionResult> {
  return cancelRsvpImpl(rsvpId)
}
