import { createAdminClient } from '@/lib/supabase/admin'
import { isPlatformStaff } from '@/lib/auth'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'

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
}

/**
 * May this viewer start (or manage) a Run for this Circle? PURE. The Circle's host always may.
 * A steward of the OWNING Space may, because the Space's Circles are the Space's to run.
 * Platform staff may anywhere. Anonymous never passes, staff or not: a Run records a host, so
 * every start needs a signed-in actor. Fail-closed on missing facts.
 */
export function canStartRunForCircle(facts: RunGateFacts): boolean {
  if (!facts.viewerProfileId) return false
  if (facts.staff) return true
  if (facts.spaceCanEdit) return true
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
 * resolves the owning Space's capabilities for this viewer, and checks staff standing.
 * FAIL-CLOSED: a missing Circle, an anonymous caller, or any read error denies.
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

    return {
      allowed: canStartRunForCircle({
        circleHostId: circle.host_id ?? null,
        viewerProfileId,
        spaceCanEdit,
        staff,
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
