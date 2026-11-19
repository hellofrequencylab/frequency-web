// ONLY A PAYING ACCOUNT PROCESSES MONEY (ADR-1978, owner rulings 2026-11-18).
//
// "The only time you can process money is if you are paying money." The payments gate
// (./payments-gate.ts) already holds every SALE to the Business floor. This module holds the two
// channels that are not sales to the same sentence:
//
//   * TIPS go to a person. A person takes tips when they pay for Crew, or when they own a Space on a
//     plan that takes payments. A free member takes none.
//   * DONATIONS go to a Space. A Space takes donations when its plan takes payments, or when it is a
//     free Space whose OWNER pays for Crew. A free Space owned by a free member takes none, and a
//     Crew owner's free Space still sells nothing else.
//
// 🔴 "PAYS FOR CREW" IS THE BILLED RUNG, read straight off `profiles.membership_tier` through
// `billedTier`. Never resolveCaller (BETA_OPEN_ACCESS reports 'crew' for everyone) and never the
// effective tier (a Crew granted by a paid community membership is access, not a subscription the
// person pays Frequency for). Reading either would hand money features to an account that pays
// nothing, which is the ruling reversed.
//
// 🔴 LIKE THE PAYMENTS GATE, THIS DOES NOT WAIT FOR THE BETA GRACE WINDOW. The window opens
// allowances; it does not decide who may take money.
//
// FAIL-CLOSED on every read: "we could not tell" never opens a money path.

import { billedTier, isPaid } from '@/lib/core/entitlement'
import { spacePaymentsVerdict } from './payments-gate'

/** Does this profile pay Frequency for Crew? The billed rung only. FAIL-CLOSED. */
export async function profilePaysForCrew(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('membership_tier')
      .eq('id', profileId)
      .maybeSingle()
    if (error || !data) return false
    return isPaid(billedTier((data as { membership_tier: string | null }).membership_tier))
  } catch {
    return false
  }
}

/** How many of a person's Spaces are checked for a paying plan. A person with more than this many
 *  Spaces and none of the first few on a paid plan is refused, which is the safe direction. */
const OWNED_SPACES_CHECKED = 12

/** May this person receive tips? They pay for Crew, or they own a Space whose plan takes payments.
 *  FAIL-CLOSED. */
export async function profileCanTakeTips(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false
  if (await profilePaysForCrew(profileId)) return true
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { data, error } = await createAdminClient()
      .from('spaces')
      .select('id, plan')
      .eq('owner_profile_id', profileId)
      .limit(OWNED_SPACES_CHECKED)
    if (error || !data) return false
    for (const row of data as { id: string; plan: string | null }[]) {
      if ((await spacePaymentsVerdict(row.id, { plan: row.plan ?? null })).ok) return true
    }
    return false
  } catch {
    return false
  }
}

/** May this Space take donations? Its plan takes payments, or its owner pays for Crew. Pass the row
 *  fields the caller already read to save a round trip. FAIL-CLOSED. */
export async function spaceMayTakeDonations(
  spaceId: string,
  opts: { plan?: string | null; ownerProfileId?: string | null } = {},
): Promise<boolean> {
  if (!spaceId) return false
  try {
    if ((await spacePaymentsVerdict(spaceId, 'plan' in opts ? { plan: opts.plan ?? null } : {})).ok) return true
    let ownerId = opts.ownerProfileId
    if (ownerId === undefined) {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const { data, error } = await createAdminClient()
        .from('spaces')
        .select('owner_profile_id')
        .eq('id', spaceId)
        .maybeSingle()
      if (error || !data) return false
      ownerId = (data as { owner_profile_id: string | null }).owner_profile_id
    }
    return await profilePaysForCrew(ownerId)
  } catch {
    return false
  }
}
