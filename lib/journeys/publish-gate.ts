// Server-side JOURNEY publish gate — the IO half of the ADR-838 access seam.
//
// Composes resolveJourneyAccess (lib/journeys/journey-access.ts, THE one tier authority) with the
// reads it needs: the Journey's OWNER (the Space it is stamped to, else its author), the owner's
// tier/plan, and the owner's current PUBLISHED-Journey count. Called from the single publish
// chokepoint (setJourneyVisibility) so the allotment holds for every publish path (Space or
// personal) through ONE seam — the chokepoint consults the resolver via this gate, never a second
// tier ladder.
//
// Server-only (admin client = service_role). Fully typed reads (journey_plans.space_id/author_id/
// visibility are in the generated types; the ADR-246 untyped casts this file carried are retired).

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { asSpacePlan } from '@/lib/pricing/plans'
import { isPaid, type EntitlementTier } from '@/lib/core/access-matrix'
import { resolveJourneyAccess } from './journey-access'
import {
  canListJourneyInLibrary,
  isPublishedVisibility,
  FREE_PUBLISHED_JOURNEY_LIMIT,
  FREE_JOURNEY_CAP_MESSAGE,
  JOURNEY_PUBLISH_CAP_MESSAGE,
  LIBRARY_LISTING_PAID_MESSAGE,
  type JourneyVisibility,
} from './publish-limits'

type OwnerRow = { space_id: string | null; author_id: string | null; visibility: string | null }

/** The author's membership tier (for a personal / root-space Journey), defaulting to 'free'. */
async function authorMembershipTier(authorId: string | null): Promise<EntitlementTier> {
  if (!authorId) return 'free'
  try {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('membership_tier')
      .eq('id', authorId)
      .maybeSingle()
    return (data?.membership_tier ?? 'free') as EntitlementTier
  } catch {
    return 'free'
  }
}

/** Count the owner's OTHER already-PUBLISHED Journeys (visibility unlisted|public), excluding the one
 *  being published. Space-owned counts by space_id; personal counts by author_id. Fail-safe to 0. */
async function countPublishedForOwner(
  spaceScoped: boolean,
  spaceId: string | null,
  authorId: string | null,
  excludeId: string,
): Promise<number> {
  try {
    const base = createAdminClient()
      .from('journey_plans')
      .select('id', { count: 'exact', head: true })
      .in('visibility', ['unlisted', 'public'])
      .neq('id', excludeId)
    if (spaceScoped && spaceId) {
      const { count } = await base.eq('space_id', spaceId)
      return count ?? 0
    }
    if (authorId) {
      const { count } = await base.eq('author_id', authorId)
      return count ?? 0
    }
    return 0
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
 * May `planId` be published at `target` visibility under the tier allotments (ADR-838)?
 *  - Going to a draft (`private`) is always allowed.
 *  - `public` (library listing) requires a PAID owner (the live lever, unchanged).
 *  - A private -> published transition consumes a publish slot against the OWNER's allotment
 *    (resolveJourneyAccess.publishCap — free 1, Crew a higher placeholder cap, paid Space
 *    unlimited; all read from PLACEHOLDER_METER_LIMITS). Re-publishing an already-published
 *    Journey never re-trips the cap.
 * Self-contained: resolves the owner + tier signal + count from the DB. Fail-open on an
 * unresolved row (the action's own authz still gates the write).
 */
export async function checkJourneyPublish(planId: string, target: JourneyVisibility): Promise<PublishCheck> {
  if (!isPublishedVisibility(target)) return { ok: true }
  let row: OwnerRow | null = null
  try {
    const { data } = await createAdminClient()
      .from('journey_plans')
      .select('space_id, author_id, visibility')
      .eq('id', planId)
      .maybeSingle()
    row = data ?? null
  } catch {
    row = null
  }
  if (!row) return { ok: true }

  // Resolve the OWNER context: a Space-owned Journey (space_id set, not the root space) reads the
  // Space plan; a personal Journey reads the author's membership tier. The resolver is asked AS the
  // owner (the allotment is the owner's, whoever the acting editor is — the caller's own edit
  // authz already ran at the chokepoint).
  const root = await loadRootSpaceId()
  const spaceScoped = !!row.space_id && row.space_id !== root
  // The resolver only needs a non-null identity marker for the owner context; a Journey with no
  // author still resolves through its Space (or the free personal floor).
  const ownerId = row.author_id ?? planId
  let paid: boolean
  let access
  if (spaceScoped) {
    const space = await getSpaceById(row.space_id!)
    const plan = asSpacePlan(space?.plan)
    paid = plan !== 'free'
    access = resolveJourneyAccess(
      { profileId: ownerId, space: { plan, canEdit: true } },
      { planId, authorId: row.author_id, spaceId: row.space_id },
    )
  } else {
    const tier = await authorMembershipTier(row.author_id)
    paid = isPaid(tier)
    access = resolveJourneyAccess(
      { profileId: ownerId, tier, realTier: tier },
      { planId, authorId: row.author_id, spaceId: null },
    )
  }

  // Library listing (public) is the paid lever, regardless of the count (unchanged behavior).
  if (target === 'public' && !canListJourneyInLibrary({ paid })) {
    return { ok: false, message: LIBRARY_LISTING_PAID_MESSAGE }
  }
  // Already published (unlisted/public) -> already counted; changing among published states is free.
  if (isPublishedVisibility(row.visibility)) return { ok: true }

  // The allotment check: count the owner's other published Journeys against the resolver's cap.
  if (access.publishCap != null) {
    const currentPublishedCount = await countPublishedForOwner(spaceScoped, row.space_id, row.author_id, planId)
    if (Math.max(0, currentPublishedCount) >= access.publishCap) {
      return {
        ok: false,
        message:
          access.publishCap <= FREE_PUBLISHED_JOURNEY_LIMIT
            ? FREE_JOURNEY_CAP_MESSAGE
            : JOURNEY_PUBLISH_CAP_MESSAGE,
      }
    }
  }
  return { ok: true }
}
