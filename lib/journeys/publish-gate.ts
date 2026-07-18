// Server-side JOURNEY publish gate — the IO half of lib/journeys/publish-limits.ts.
//
// Composes the pure cap rules with the reads they need: the Journey's OWNER (the Space it is stamped
// to, else its author), the owner's PAID signal (Space plan, else the author's membership tier), and
// the owner's current PUBLISHED-Journey count. Called from the single publish chokepoint
// (setJourneyVisibility) so the free-vs-paid lever holds for every publish path (Space or personal).
//
// Server-only (admin client = service_role). space_id / journey_plans reads go through the untyped
// admin handle (ADR-246).

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { asSpacePlan } from '@/lib/pricing/plans'
import { isPaid, type EntitlementTier } from '@/lib/core/access-matrix'
import {
  canPublishAnotherJourney,
  canListJourneyInLibrary,
  isPublishedVisibility,
  FREE_JOURNEY_CAP_MESSAGE,
  LIBRARY_LISTING_PAID_MESSAGE,
  type JourneyVisibility,
} from './publish-limits'

type OwnerRow = { space_id: string | null; author_id: string | null; visibility: string | null }

// Untyped chain casts (journey_plans.space_id isn't in the generated types, ADR-246). One shape reads a
// single row; the other is a thenable count query, so `await` on it resolves to `{ count }`.
type RowChain = {
  select: (c: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } }
}
interface CountChain {
  select(c: string, o: { count: 'exact'; head: boolean }): CountChain
  eq(c: string, v: string): CountChain
  neq(c: string, v: string): CountChain
  in(c: string, v: string[]): CountChain
  then<T>(cb: (r: { count: number | null }) => T): Promise<T>
}

/** The author's membership tier (for a personal / root-space Journey), defaulting to 'free'. */
async function authorMembershipTier(authorId: string | null): Promise<EntitlementTier | null> {
  if (!authorId) return null
  try {
    // profiles.membership_tier is in the generated types, so the typed client reads it directly.
    const { data } = await createAdminClient().from('profiles').select('membership_tier').eq('id', authorId).maybeSingle()
    return ((data as { membership_tier: string | null } | null)?.membership_tier ?? 'free') as EntitlementTier
  } catch {
    return 'free'
  }
}

/** Is the Journey's OWNER paid? A Space-owned Journey reads the Space plan (free vs paid); a personal
 *  (root / no-space) Journey reads the author's membership tier. */
async function ownerIsPaid(spaceId: string | null, authorId: string | null): Promise<boolean> {
  const root = await loadRootSpaceId()
  if (spaceId && spaceId !== root) {
    const space = await getSpaceById(spaceId)
    return asSpacePlan(space?.plan) !== 'free'
  }
  return isPaid(await authorMembershipTier(authorId))
}

/** Count the owner's OTHER already-PUBLISHED Journeys (visibility unlisted|public), excluding the one
 *  being published. Space-owned counts by space_id; personal counts by author_id. Fail-safe to 0. */
async function countPublishedForOwner(spaceId: string | null, authorId: string | null, excludeId: string): Promise<number> {
  const root = await loadRootSpaceId()
  try {
    const base = (createAdminClient().from('journey_plans') as unknown as CountChain)
      .select('id', { count: 'exact', head: true })
      .in('visibility', ['unlisted', 'public'])
      .neq('id', excludeId)
    let q: CountChain
    if (spaceId && spaceId !== root) q = base.eq('space_id', spaceId)
    else if (authorId) q = base.eq('author_id', authorId)
    else return 0
    const { count } = await q
    return count ?? 0
  } catch {
    return 0
  }
}

export interface PublishCheck {
  ok: boolean
  /** The upsell message to surface when blocked (CONTENT-VOICE, no em dashes). */
  message?: string
}

/**
 * May `planId` be published at `target` visibility under the free-vs-paid lever?
 *  - Going to a draft (`private`) is always allowed.
 *  - `public` (library listing) requires a PAID owner.
 *  - A private -> published transition consumes a publish slot: a FREE owner is capped at
 *    FREE_PUBLISHED_JOURNEY_LIMIT; re-publishing an already-published Journey never re-trips the cap.
 * Self-contained: resolves the owner + paid signal + count from the DB. Fail-open on an unresolved
 * row (the action's own authz still gates the write).
 */
export async function checkJourneyPublish(planId: string, target: JourneyVisibility): Promise<PublishCheck> {
  if (!isPublishedVisibility(target)) return { ok: true }
  let row: OwnerRow | null = null
  try {
    const { data } = await (createAdminClient().from('journey_plans') as unknown as RowChain)
      .select('space_id, author_id, visibility')
      .eq('id', planId)
      .maybeSingle()
    row = data as OwnerRow | null
  } catch {
    row = null
  }
  if (!row) return { ok: true }

  const paid = await ownerIsPaid(row.space_id, row.author_id)

  // Library listing (public) is the paid lever, regardless of the count.
  if (target === 'public' && !canListJourneyInLibrary({ paid })) {
    return { ok: false, message: LIBRARY_LISTING_PAID_MESSAGE }
  }
  // Already published (unlisted/public) -> already counted; changing among published states is free.
  if (isPublishedVisibility(row.visibility)) return { ok: true }

  const currentPublishedCount = await countPublishedForOwner(row.space_id, row.author_id, planId)
  if (!canPublishAnotherJourney({ paid, currentPublishedCount })) {
    return { ok: false, message: FREE_JOURNEY_CAP_MESSAGE }
  }
  return { ok: true }
}
