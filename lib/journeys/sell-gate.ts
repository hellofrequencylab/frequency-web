// MAY THIS JOURNEY CARRY A PRICE? (ADR-1397) The server-side chokepoint, shaped exactly like
// `checkJourneyPublish` beside it: resolve the OWNER context, ask the ONE resolver
// (`resolveJourneyAccess`, ADR-838), refuse in plain copy. Server-only.
//
// Owner ruling, 2026-09-17: *"make it so only paid spaces can create paid journeys."*
//
// ⚠️ THIS GATE DOES NOT HONOUR THE BETA GRACE WINDOW, and that is deliberate and load-bearing.
// `checkJourneyPublish` short-circuits to `ok` while `featureGatesLive()` is false, because the
// things it guards are ALLOWANCES — how many Journeys you may publish — and opening allowances is
// what a beta grace is for. This guards who may take money, which is not an allowance. Honouring
// the grace here would mean every free Space could sell a Journey for the whole beta, which is the
// ruling reversed rather than deferred. A rule that switches itself off is not a rule.
//
// 🔴 THE GATE IS THE AUTHORITY, THE UI IS PARITY. `canSell` is also read by the surfaces so a
// control is hidden or upsold rather than offered and then refused, but every write re-asks here.
// A hidden button is a courtesy; this is the check.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { asSpacePlan } from '@/lib/pricing/plans'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  resolveJourneyAccess,
  JOURNEY_NOT_SELLABLE_REASON,
  JOURNEY_NOT_YOURS_REASON,
  JOURNEY_SIGN_IN_REASON,
} from './journey-access'

export type SellCheck = { ok: true } | { ok: false; error: string }

/**
 * May `callerId` attach or change a price on `planId`?
 *
 * FAIL-CLOSED throughout, which is the opposite of `checkJourneyPublish`'s posture and is right for
 * the direction this one points: a read error there could lock an author out of their own work, so
 * it opens; a read error here could let an unentitled Space take somebody's money, so it shuts.
 */
export async function checkJourneySell(planId: string, callerId: string | null): Promise<SellCheck> {
  if (!callerId) return { ok: false, error: JOURNEY_SIGN_IN_REASON }

  let row: { space_id: string | null; author_id: string | null } | null = null
  try {
    const { data } = await createAdminClient()
      .from('journey_plans')
      .select('space_id, author_id')
      .eq('id', planId)
      .maybeSingle()
    row = data ?? null
  } catch {
    row = null
  }
  if (!row) return { ok: false, error: JOURNEY_NOT_SELLABLE_REASON }

  // A root-space stamp means PERSONAL, the convention every Journey consumer normalizes first
  // (authoring.ts, publish-gate.ts, launch-access.ts, run-gate.ts all do this).
  const root = await loadRootSpaceId()
  const spaceId = row.space_id && row.space_id !== root ? row.space_id : null
  if (!spaceId) return { ok: false, error: JOURNEY_NOT_SELLABLE_REASON }

  const space = await getSpaceById(spaceId)
  if (!space) return { ok: false, error: JOURNEY_NOT_SELLABLE_REASON }

  // The CALLER's authority over the Space, not an assumed `canEdit: true`. The publish gate asks as
  // the OWNER because an allotment belongs to the owner however is acting; pricing is an act, so it
  // is asked as the actor.
  const caps = await getSpaceCapabilities(space, callerId)
  const access = resolveJourneyAccess(
    { profileId: callerId, space: { plan: asSpacePlan(space.plan), canEdit: caps.canEditProfile } },
    { planId, authorId: row.author_id, spaceId },
  )

  if (!access.canSell) {
    // Two different refusals wearing one flag: not your Space, versus your Space is on the free plan.
    return { ok: false, error: caps.canEditProfile ? JOURNEY_NOT_SELLABLE_REASON : JOURNEY_NOT_YOURS_REASON }
  }
  return { ok: true }
}
