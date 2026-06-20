'use server'

// THE CLIENT-CALLABLE SERVER ACTION for donations (ENTITY-SPACES-SYSTEM §2.6, donations v1;
// MASTER-PLAN ADMIN-01).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure ask helpers
// or the shared types. Those live in lib/spaces/donations.ts (no directive: pure helpers + IO + the
// action implementations + types, all unit-testable). This thin file is the seam the CLIENT editor
// imports, so the mutation crosses the network boundary as a proper Server Action:
//   donation-ask-form.tsx -> setDonationAsk
//
// SERVER components (the owner donations page) import the READ actions (getOwnerDonationAsk /
// getDonationAsk) directly from lib/spaces/donations.ts: they never cross a client boundary, so they
// need no wrapper. The authorization + validation all live in the implementation; this wrapper just
// re-exposes it. The owner gate (canEditProfile, re-checked server-side) stays inside the
// implementation, so a staff preview never confers a write.

import { setDonationAsk as setDonationAskImpl, type DonationAsk } from '@/lib/spaces/donations'
import { type ActionResult } from '@/lib/action-result'

/** Set a Space's donation ask. Gated on canEditProfile server-side (see the implementation). v1
 *  records the owner's configuration only and takes no payment. */
export async function setDonationAsk(
  spaceId: string,
  ask: DonationAsk | null,
): Promise<ActionResult> {
  return setDonationAskImpl(spaceId, ask)
}
