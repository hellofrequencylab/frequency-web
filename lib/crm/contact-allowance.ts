// THE COUNTED CONTACT WRITE SEAM (ADR-917, docs/VALUE-LADDER.md Phase 3b step 1).
//
// `space_crm` was BOTH a gate ("no CRM below Business") and a meter ("200 contacts free"). Those are
// two different promises to the same customer, and they disagree the moment the gates go live: the
// gate takes the whole CRM away from a free Space the pricing page sold a 200-contact list to. The
// strategy resolves it in favour of the METER, and this module is what makes that safe: deleting the
// gate without counting contacts would have replaced an enforced limit with an unenforced one.
//
// 🔴 THERE IS NO SINGLE DATABASE CHOKEPOINT, AND THAT IS THE FINDING. `contacts` is written from four
// modules, and the honest architecture is one shared guard those four call rather than a check
// scattered per call site (the ~20 "seams" are CALLERS of those four; guarding the four covers them
// all). The four, and what each one is:
//
//   ✅ GUARDED   lib/crm/lead-capture.ts captureLead()          — the engine behind all five lead-grab
//                doors (QR, warm intro, event, lead magnet, share-back). Deliberate list-building.
//   ✅ GUARDED   lib/crm/lead-capture.ts linkMemberToSpaceLead() — the member-scans-your-code door.
//   ✅ GUARDED   lib/crm/import/commit.ts commitToSpace()        — CSV import, the bulk growth path.
//   ✅ GUARDED   lib/connections/crm-sync.ts syncContactToSpaceCrm() — the graduation bridge.
//
// And the two that are DELIBERATELY NOT guarded, each for a reason that is not laziness:
//
//   ⛔ lib/billing/tickets.ts — the buyer's contact row is written AFTER a settled purchase. The money
//      already moved; refusing the record would lose the introduction we just charged for and leave a
//      paid order with no one attached to it. A meter must never fail in the direction that loses a
//      customer's own transaction (Gate 4).
//   ⛔ lib/crm/lead-capture.ts ensureSpaceMemberContact() — this materializes the CRM row for someone
//      who ALREADY JOINED the Space. Refusing it does not prevent the join; it just leaves a member
//      the owner cannot see or email, which is data corruption dressed as a limit. The membership
//      itself is walled at Business (`space_memberships`), so this is not an unmetered growth path.
//
// Every OTHER `contacts` insert in the repo (the beta waitlist, /start, onboarding, the opt-in funnel,
// event guest capture, support chat, the personal scan bridge, and the importer's `platform` target)
// writes with NO space_id, so the `contacts_default_space_id` trigger lands it in the ROOT hub, which
// lib/pricing/space-allowance.ts exempts. Those are Frequency's own marketing list, not a tenant's CRM.
//
// FAIL-SAFE THROUGHOUT: the count fails to 0 and the verdict fails to granted, so a database hiccup
// can only ever let a write through. Nothing here blocks while `featureGatesLive()` is false.

import { createAdminClient } from '@/lib/supabase/admin'
import { featureGatesLive } from '@/lib/pricing/settings'
import {
  spaceAllowanceVerdict,
  spaceAllowanceHeadroom,
  type SpaceAllowanceVerdict,
} from '@/lib/pricing/space-allowance'

/** The meter key the contact list is priced on. One string, one place. */
export const CONTACT_METER_KEY = 'space_crm'

/**
 * Count a Space's contacts in ONE filtered head query. FAIL-SAFE to 0: a failed count must never
 * invent usage that refuses a write (0 is always inside any allowance), matching the direction every
 * other pricing read fails in.
 */
export async function countSpaceContacts(spaceId: string): Promise<number> {
  const id = (spaceId ?? '').trim()
  if (!id) return 0
  try {
    const { count, error } = await createAdminClient()
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', id)
    if (error || typeof count !== 'number') return 0
    return Math.max(0, count)
  } catch {
    return 0
  }
}

/**
 * May this Space add ONE more contact? THE predicate the four write seams call.
 *
 * Short-circuits BEFORE counting while the gates are not live, so the beta pays nothing for a meter
 * that cannot bite. Once live it counts, applies the plan allowance, and applies the grandfather
 * floor (the effective cap is never below the Space's current count), so a full list stops the NEXT
 * contact and never touches the ones already there.
 */
export async function spaceContactAllowance(spaceId: string): Promise<SpaceAllowanceVerdict> {
  let gatesLive = false
  try {
    gatesLive = await featureGatesLive()
  } catch {
    gatesLive = false
  }
  // Not live: skip the count entirely. spaceAllowanceVerdict would grant anyway, and a COUNT on every
  // lead capture through the whole beta is a real cost for an answer that is fixed.
  if (!gatesLive) return spaceAllowanceVerdict(spaceId, CONTACT_METER_KEY, 0)
  const used = await countSpaceContacts(spaceId)
  return spaceAllowanceVerdict(spaceId, CONTACT_METER_KEY, used)
}

/** The boolean form, for a seam that only needs yes/no. FAIL-SAFE to true. */
export async function canAddSpaceContact(spaceId: string): Promise<boolean> {
  try {
    return (await spaceContactAllowance(spaceId)).allowed
  } catch {
    return true
  }
}

/** How many more contacts this Space may add, or null when nothing is being enforced. For the CSV
 *  importer, which needs a headroom number rather than a yes/no per row. FAIL-SAFE to null. */
export async function spaceContactHeadroom(spaceId: string): Promise<number | null> {
  try {
    let gatesLive = false
    try {
      gatesLive = await featureGatesLive()
    } catch {
      gatesLive = false
    }
    if (!gatesLive) return null
    return await spaceAllowanceHeadroom(spaceId, CONTACT_METER_KEY, await countSpaceContacts(spaceId))
  } catch {
    return null
  }
}
