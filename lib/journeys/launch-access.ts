// Server-side JOURNEY LAUNCH context — the IO half of the launch surface (ADR-840), the sibling
// of lib/journeys/publish-gate.ts.
//
// ONE resolver answers everything /journeys/[slug]/launch and its server actions need to know:
// the Journey's identity (title / slug / play window), its OWNING Space (the root space
// normalized to null, the same personal-is-null rule the publish gate uses), and the VIEWER's
// resolved capabilities through resolveJourneyAccess (lib/journeys/journey-access.ts, THE tier
// authority — never a second ladder here).
//
// Both halves of the surface call this: the page for what to RENDER, and every server action for
// what to ALLOW, so a client can never widen its own tier. Server-only (admin client =
// service_role) and FULLY TYPED — no untyped `.from` seams.

import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { asSpacePlan, type SpacePlan } from '@/lib/pricing/plans'
import type { EntitlementTier } from '@/lib/core/access-matrix'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import { canEditJourney } from './authoring'
import { resolveJourneyAccess, type JourneyAccess } from './journey-access'

/** The viewer as the caller already knows them (getCallerProfile's shape, loosened so either the
 *  page or an action can pass what it has). */
export interface LaunchViewer {
  profileId: string
  role?: CommunityRole | null
  webRole?: WebRole | null
  tier?: EntitlementTier | null
  realTier?: EntitlementTier | null
}

/** Everything the launch surface stands on. Resolved once per request by the page, and again
 *  (independently) by every write action. */
export interface JourneyLaunchContext {
  /** The profile the context was resolved FOR (the acting publisher). Actions send and log as them. */
  viewerId: string
  planId: string
  slug: string
  title: string
  /** journey_plans.window_starts_at — the anchor deriveLaunchSchedule reads. */
  windowStartsAt: string | null
  /** The owning Space, with the ROOT space normalized to null (= a personal Journey, which has no
   *  contact list and therefore no campaign lane). */
  spaceId: string | null
  spacePlan: SpacePlan
  /** May this viewer edit the Journey at all (author / Space team / operator)? Always true on a
   *  resolved context — the gate ran before it was built — and kept on the shape so callers can
   *  read the answer without re-deriving it. */
  canEdit: boolean
  /** The tier answer for this viewer against this Journey. */
  access: JourneyAccess
}

type PlanRow = {
  id: string
  slug: string
  title: string
  space_id: string | null
  author_id: string | null
  window_starts_at: string | null
}

/**
 * Resolve the launch context for `planId` as `viewer`, or null when the Journey is missing or the
 * viewer may not edit it (FAIL-CLOSED: a null answer is the caller's cue to redirect or refuse).
 *
 * The Space leg mirrors the publish gate: the root space reads as personal, a real Space supplies
 * the plan for the tier math AND the viewer's own editor standing on it, which is what
 * `launchCampaignsAllowed` hangs on.
 */
export async function resolveJourneyLaunchContext(
  planId: string,
  viewer: LaunchViewer,
): Promise<JourneyLaunchContext | null> {
  if (!viewer.profileId) return null

  const { data } = await createAdminClient()
    .from('journey_plans')
    .select('id, slug, title, space_id, author_id, window_starts_at')
    .eq('id', planId)
    .maybeSingle()
  const plan = (data ?? null) as PlanRow | null
  if (!plan) return null

  if (!(await canEditJourney(plan.id, viewer.profileId))) return null

  const root = await loadRootSpaceId()
  const spaceId = plan.space_id && plan.space_id !== root ? plan.space_id : null

  let spacePlan: SpacePlan = 'free'
  let editsSpace = false
  if (spaceId) {
    const space = await getSpaceById(spaceId)
    spacePlan = asSpacePlan(space?.plan)
    if (space) {
      const caps = await getSpaceCapabilities(space, viewer.profileId)
      editsSpace = caps.canEditProfile
    }
  }

  const access = resolveJourneyAccess(
    {
      profileId: viewer.profileId,
      role: viewer.role ?? null,
      webRole: viewer.webRole ?? null,
      tier: viewer.tier ?? null,
      realTier: viewer.realTier ?? null,
      space: spaceId ? { plan: spacePlan, canEdit: editsSpace } : null,
    },
    { planId: plan.id, authorId: plan.author_id, spaceId },
  )

  return {
    viewerId: viewer.profileId,
    planId: plan.id,
    slug: plan.slug,
    title: plan.title,
    windowStartsAt: plan.window_starts_at,
    spaceId,
    spacePlan,
    canEdit: true,
    access,
  }
}
