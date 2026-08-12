import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'
import { listPublicPlans } from '@/lib/journey-plans'

// WHO MAY START A RUN for a Circle (ADR-842). A Run is one Circle going through one Journey
// together (ADR-252). Before this seam the only answer was "the Circle's host", which left a
// Space steward unable to start a Run for a Circle their own Space owns, the exact case the
// Space Circles surface exists for.
//
// The pure decision is split from the IO so it unit-tests without a database, matching
// lib/events/host-gate.ts (ADR-841). Answers WHO may act; WHICH Journeys they may pick is a
// separate question (journeysOfferedBySpace below), so neither rule can quietly widen the other.

/** The facts the pure gate decides over. */
export interface RunGateFacts {
  /** circles.host_id (null on a Space Circle nobody hosts personally yet). */
  circleHostId: string | null
  /** The signed-in caller's profile id (null = anonymous). */
  viewerProfileId: string | null
  /** Does this viewer edit the Space that OWNS the Circle (owner/admin/editor)? False for a
   *  root-space Circle, which is a member's own Circle and has no Space steward. */
  spaceCanEdit: boolean
  /** Platform staff on the STAFF axis (web_role admin/janitor), preview-aware. */
  staff: boolean
  /** Does this viewer hold `circle.editSettings` on the Circle — i.e. does the capability layer
   *  say they MANAGE it? Covers the host recorded only as a stewardship edge, the guide/mentor
   *  who leads the parent hub/nexus, and the circle-scoped Admin rung (ADR-1014). Optional and
   *  defaulting to false, so a caller that forgets it can only ever be MORE closed. */
  circleCanManage?: boolean
}

/**
 * May this viewer start (or manage) a Run for this Circle? PURE. The Circle's host always may.
 * A steward of the OWNING Space may, because the Space's Circles are the Space's to run.
 * Platform staff may anywhere. Anonymous never passes, staff or not: a Run records a host, so
 * every start needs a signed-in actor. Fail-closed on missing facts.
 *
 * WHOEVER MANAGES THE CIRCLE MAY TOO (`circleCanManage` = `circle.editSettings`). The UI that
 * offers "Start a journey run" is gated on exactly that capability, so anything narrower here is
 * a control that renders and then refuses. Three people were in that gap: a host recorded only as
 * a stewardship edge (the host, by any honest reading), the guide/mentor who leads the parent
 * hub/nexus, and the circle-scoped Admin rung. ADR-1014 defines Admin as "the Host's full
 * management set MINUS the two acts that are ownership itself" — setting roles and handing the
 * circle on — and starting a Run is neither. The gate that already admits ANY editor of the
 * owning Space cannot coherently refuse the Circle's own Admin.
 */
export function canStartRunForCircle(facts: RunGateFacts): boolean {
  if (!facts.viewerProfileId) return false
  if (facts.staff) return true
  if (facts.spaceCanEdit) return true
  if (facts.circleCanManage === true) return true
  return !!facts.circleHostId && facts.circleHostId === facts.viewerProfileId
}

/** What the IO front door resolved, so a caller that passes can reuse the facts. */
export interface RunGateResult {
  allowed: boolean
  circleSlug: string | null
  /** The Circle's owning space_id, with the ROOT space normalized to null (= a member's own
   *  Circle, not a Space Circle). The Journey picker keys off this. */
  spaceId: string | null
}

/**
 * IO front door: may `viewerProfileId` start a Run for this Circle right now? Reads the Circle,
 * resolves the owning Space's capabilities for this viewer, asks the capability layer whether the
 * viewer manages the Circle, and checks staff standing.
 * FAIL-CLOSED: a missing Circle, an anonymous caller, or any read error denies.
 *
 * ⚠️ `viewerProfileId` must be the SIGNED-IN caller's own id: `getCircleCapabilities` resolves the
 * request's caller, not an arbitrary profile. Both call sites pass `caller.id`.
 */
export async function resolveRunGate(
  circleId: string,
  viewerProfileId: string | null,
): Promise<RunGateResult> {
  const denied: RunGateResult = { allowed: false, circleSlug: null, spaceId: null }
  if (!circleId || !viewerProfileId) return denied
  try {
    const admin = createAdminClient()
    const { data: circle } = await admin
      .from('circles')
      .select('host_id, slug, space_id')
      .eq('id', circleId)
      .maybeSingle()
    if (!circle) return denied

    // Root-owned circles are members' own circles: no Space steward path, only the host.
    const root = await loadRootSpaceId()
    const spaceId = circle.space_id && circle.space_id !== root ? circle.space_id : null

    let spaceCanEdit = false
    if (spaceId) {
      const space = await getSpaceById(spaceId)
      const caps = await getSpaceCapabilities(space, viewerProfileId)
      spaceCanEdit = caps.canEditProfile
    }
    const staff = await isPlatformStaff().catch(() => false)
    // The SAME capability the "Start a journey run" control renders on, so the affordance and
    // the action can never disagree again. Fail-closed on a read error.
    const circleCanManage = await getCircleCapabilities(circleId)
      .then((caps) => caps.has('circle.editSettings'))
      .catch(() => false)

    return {
      allowed: canStartRunForCircle({
        circleHostId: circle.host_id ?? null,
        viewerProfileId,
        spaceCanEdit,
        staff,
        circleCanManage,
      }),
      circleSlug: circle.slug,
      spaceId,
    }
  } catch {
    return denied
  }
}

/**
 * The Journeys a Space OFFERS its Circles: the published plans that Space owns. This is the
 * picker's whole source, so a Space Circle can only adopt what its Space actually offers, and a
 * member's own Circle (spaceId null) keeps the existing library-wide behavior by getting an
 * empty list here and falling back to the caller's own picker.
 */
/** One option in the "Start a journey run" picker — the shape the Circle page's
 *  `RunnableJourney` already carries. */
export interface RunnableJourneyOption {
  id: string
  title: string
  slug: string
  emoji: string | null
}

/**
 * The Journeys a picker may OFFER for this Circle: EXACTLY the set `startJourneyRunAction` will
 * accept, resolved from the same seam the action checks.
 *
 * The picker used to be filled from the whole public library while the action refused any plan a
 * Space Circle's Space does not offer, so on a Space Circle most of the options in the list were
 * guaranteed to fail with "Pick a Journey this space offers." Offering a choice that cannot be
 * taken is the bug; this function is the one place the two rules are read together.
 *
 * Returns an empty list when the viewer may not start a Run at all, so the picker cannot show
 * options to someone the action would refuse either.
 */
export async function runnableJourneysForCircle(
  circleId: string,
  viewerProfileId: string | null,
  limit = 50,
): Promise<RunnableJourneyOption[]> {
  const gate = await resolveRunGate(circleId, viewerProfileId)
  if (!gate.allowed) return []
  const plans = gate.spaceId ? await journeysOfferedBySpace(gate.spaceId) : await listPublicPlans()
  return plans
    .slice(0, limit)
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug, emoji: p.emoji ?? null }))
}

export async function journeysOfferedBySpace(
  spaceId: string | null,
): Promise<{ id: string; slug: string; title: string; summary: string | null; emoji: string | null }[]> {
  if (!spaceId) return []
  try {
    const { data } = await createAdminClient()
      .from('journey_plans')
      .select('id, slug, title, summary, emoji, visibility, status')
      .eq('space_id', spaceId)
      .neq('visibility', 'private')
      .order('updated_at', { ascending: false })
      .limit(100)
    return (data ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      emoji: p.emoji,
    }))
  } catch {
    return []
  }
}
