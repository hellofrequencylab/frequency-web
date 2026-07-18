// Server seam: bridge live data → the pure capability resolver.
//
// This is the ONLY place that fetches the inputs `resolveCapabilities` needs and
// returns the caller's capability set for a scope. Server components and server
// actions call these; the result is (a) rendered as affordances and (b) the same
// policy the server must re-check before mutating (see capabilities.ts).
//
// NOTE: server-only — it uses the admin client. Do not import from a client
// component.

import { cache } from 'react'
import type { AdminScope } from '@/lib/layout/page-chrome'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveCapabilities,
  type Capability,
  type Viewer,
} from './capabilities'
import { type CommunityRole } from './roles'
import { crewCreateUpsell } from './beta-notices'
import { deriveTier } from './entitlement'
import { isPaid } from './access-matrix'
import {
  leadsScope as edgeLeadsScope,
  deriveCommunityLevel,
  levelRank,
  type CommunityLevel,
} from './stewardship'
import { getStewardships } from '@/lib/stewardships'
import { countOpenCircleTasks } from '@/lib/crew/circle-tasks'
import { readSpotlightEnabled, readSpotlightPublished } from '@/lib/profile/spotlight-flags'

// The STAFF axis (web_role, ADR-208) rides on the caller profile alongside the
// community role, so the SAME Viewer feeds every scope builder below — DB → auth →
// capabilities. getCallerProfile() reads web_role through the untyped cast (the
// generated types are stale until the migration applies).
//
// SCOPED stewardship (P1.6, ADR-218): the viewer also carries its `stewardships`
// edges as a `leadsScope` predicate, so the resolver recognizes a scoped leader by
// edge as well as by the legacy leader FK. Edges are fetched ONCE per request
// (cache()) and OR'd with the FK match in the resolver — provably a no-op on today's
// data (every FK was backfilled to an edge; no edge exists without an FK yet). The
// whole viewer is memoized so the several per-scope builders below share one
// getCallerProfile() + one getStewardships() round-trip.
const currentViewer = cache(async (): Promise<Viewer> => {
  const p = await getCallerProfile()
  const edges = p?.id ? await getStewardships(p.id) : []
  return {
    profileId: p?.id ?? null,
    role: (p?.community_role ?? 'member') as CommunityRole,
    webRole: p?.webRole ?? 'none',
    tier: deriveTier(p?.membershipTier),
    // The real DB tier (pre beta-override) feeds the creation gates so the upgrade
    // popup still fires for a genuinely free member during the beta (ADR-414).
    realTier: deriveTier(p?.realMembershipTier),
    leadsScope: (scopeType, scopeId) => edgeLeadsScope(edges, scopeType, scopeId),
  }
})

// The viewer's highest EDGE-contributed community level (P1.6 PR 2, ADR-221). Derived
// from the same edges `currentViewer` reads, with NO community_role floor — this is the
// "what do your edges alone grant" signal that ADDITIVELY widens the parent-walk gate
// below: a viewer who holds a guide/mentor EDGE (any scope) triggers the hub/nexus walk
// just like a global guide/mentor does. The existing FK/edge match then confirms the
// SPECIFIC parent, so this only opens the walk for scoped-only stewards — it grants
// nothing a global guide/mentor didn't already have, and removes nothing.
const viewerEdgeLevel = cache(async (): Promise<CommunityLevel> => {
  const p = await getCallerProfile()
  const edges = p?.id ? await getStewardships(p.id) : []
  return deriveCommunityLevel(edges) // no floor: pure edge standing
})

/** Does the viewer hold an edge at or above `level` anywhere? Additive parent-walk gate. */
async function hasEdgeAtLeast(level: CommunityLevel): Promise<boolean> {
  return levelRank(await viewerEdgeLevel()) >= levelRank(level)
}

/** App-level capabilities (e.g. admin.access for the Admin tab). */
export async function getGlobalCapabilities(): Promise<Set<Capability>> {
  return resolveCapabilities(await currentViewer(), { kind: 'global' })
}

/** The four global creation gates (ADR-414) — who may author a new entity. */
export type CreateCapability = 'event.create' | 'circle.create' | 'journey.create' | 'practice.create'

/** Render-time check: may the caller author a new entity of this kind? Reads the
 *  REAL Crew tier (pre beta-override) so a free member sees the upgrade affordance. */
export async function canCreate(cap: CreateCapability): Promise<boolean> {
  return (await getGlobalCapabilities()).has(cap)
}

/** Server enforcement: throw unless the caller may author this kind. Call at the
 *  top of every create action/page — the capability popup is UX, this is law. */
export async function assertCanCreate(cap: CreateCapability): Promise<void> {
  if (!(await canCreate(cap))) {
    // Beta-aware copy from the one rule (lib/core/beta-notices) so launch flips it in place.
    throw new Error(crewCreateUpsell('this'))
  }
}

/** What the caller can do on a specific Circle. */
export async function getCircleCapabilities(
  circleId: string,
  opts?: { openTaskCount?: number; viewerManagesParent?: boolean },
): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()

  const { data: circle } = await admin
    .from('circles')
    .select('host_id, hub_id')
    .eq('id', circleId)
    .maybeSingle()

  let membership: { status: string; volunteerRole: CommunityRole | null } | null = null
  if (viewer.profileId) {
    const { data: m } = await admin
      .from('memberships')
      .select('status, volunteer_role')
      .eq('circle_id', circleId)
      .eq('profile_id', viewer.profileId)
      .maybeSingle()
    if (m) membership = { status: m.status as string, volunteerRole: m.volunteer_role as CommunityRole | null }
  }

  // Area-scoped leadership: a guide/mentor who leads this circle's hub (or its
  // nexus) manages it too. Host + janitor are handled by the resolver directly,
  // so we only do these extra lookups for guide/mentor viewers. A scoped-only
  // guide/mentor (global member, but holding a guide/mentor EDGE) ALSO triggers the
  // walk — the FK/edge check below still confirms the SPECIFIC parent (ADR-221,
  // additive). (`hasEdgeAtLeast` is cached, so the extra read is free.)
  let viewerManagesParent = opts?.viewerManagesParent ?? false
  if (
    !viewerManagesParent &&
    viewer.profileId &&
    (viewer.role === 'guide' || viewer.role === 'mentor' || (await hasEdgeAtLeast('guide'))) &&
    circle?.hub_id
  ) {
    const { data: hub } = await admin
      .from('hubs')
      .select('guide_id, nexus_id')
      .eq('id', circle.hub_id)
      .maybeSingle()
    // Confirm the SPECIFIC parent by leader FK OR stewardship edge (additive — a
    // scoped-only guide/mentor with no FK is recognized via the edge).
    if (
      hub?.guide_id === viewer.profileId ||
      (viewer.leadsScope?.('hub', circle.hub_id) ?? false)
    ) {
      viewerManagesParent = true
    } else if (hub?.nexus_id) {
      const { data: nexus } = await admin
        .from('nexuses')
        .select('mentor_id')
        .eq('id', hub.nexus_id)
        .maybeSingle()
      if (
        nexus?.mentor_id === viewer.profileId ||
        (viewer.leadsScope?.('nexus', hub.nexus_id) ?? false)
      ) {
        viewerManagesParent = true
      }
    }
  }

  // Open (unclaimed) circle-scoped crew tasks — the input that lights up
  // task.volunteer / task.claim in the resolver. Only paid active members can
  // ever receive those capabilities, so skip the count for everyone else
  // (anon/free viewers are the bulk of page views).
  let openTaskCount = opts?.openTaskCount
  if (openTaskCount === undefined) {
    openTaskCount =
      viewer.profileId && isPaid(viewer.tier) && membership?.status === 'active'
        ? await countOpenCircleTasks(circleId)
        : 0
  }

  return resolveCapabilities(viewer, {
    kind: 'circle',
    circleId,
    hostId: circle?.host_id ?? null,
    membership,
    openTaskCount,
    viewerManagesParent,
  })
}

/** What the caller can do on a specific Hub. hub.manage goes to its guide, a
 *  mentor who leads the parent nexus, or a janitor (resolver). */
export async function getHubCapabilities(
  hubId: string,
  opts?: { viewerManagesParent?: boolean },
): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()

  const { data: hub } = await admin
    .from('hubs')
    .select('guide_id, nexus_id')
    .eq('id', hubId)
    .maybeSingle()

  // A mentor who leads the parent nexus manages this hub too. A scoped-only mentor
  // (global member holding a mentor EDGE) also triggers the walk; the FK/edge check
  // below confirms the SPECIFIC nexus (ADR-221, additive).
  let viewerManagesParent = opts?.viewerManagesParent ?? false
  if (
    !viewerManagesParent &&
    viewer.profileId &&
    (viewer.role === 'mentor' || (await hasEdgeAtLeast('mentor'))) &&
    hub?.nexus_id
  ) {
    const { data: nexus } = await admin
      .from('nexuses')
      .select('mentor_id')
      .eq('id', hub.nexus_id)
      .maybeSingle()
    if (
      nexus?.mentor_id === viewer.profileId ||
      (viewer.leadsScope?.('nexus', hub.nexus_id) ?? false)
    ) {
      viewerManagesParent = true
    }
  }

  return resolveCapabilities(viewer, {
    kind: 'hub',
    hubId,
    guideId: hub?.guide_id ?? null,
    viewerManagesParent,
  })
}

/** What the caller can do on a specific Nexus. nexus.manage goes to its mentor or
 *  a janitor (resolver). */
export async function getNexusCapabilities(nexusId: string): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()

  const { data: nexus } = await admin
    .from('nexuses')
    .select('mentor_id')
    .eq('id', nexusId)
    .maybeSingle()

  return resolveCapabilities(viewer, {
    kind: 'nexus',
    nexusId,
    mentorId: nexus?.mentor_id ?? null,
  })
}

/** What the caller can do on a specific Event. event.editSettings goes to its
 *  host, platform staff, or whoever can edit the event's parent circle (delegated
 *  to getCircleCapabilities — "if you run the circle, you run its events"). */
export async function getEventCapabilities(eventId: string): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()

  const { data: ev } = await admin
    .from('events')
    .select('host_id, scope_type, scope_id')
    .eq('id', eventId)
    .maybeSingle()

  let viewerManagesScope = false
  if (ev?.scope_type === 'circle' && ev.scope_id) {
    const circleCaps = await getCircleCapabilities(ev.scope_id)
    viewerManagesScope = circleCaps.has('circle.editSettings')
  }

  return resolveCapabilities(viewer, {
    kind: 'event',
    eventId,
    hostId: ev?.host_id ?? null,
    viewerManagesScope,
  })
}

/** What the caller can do on a specific topical Channel. Channels are platform-curated
 *  (no per-channel owner), so channel.manage goes to staff only — the resolver adds it
 *  when the viewer is staff. Used by the channel detail page to gate its staff-only
 *  in-place Edit trigger (ADR-515 Phase 5). */
export async function getChannelCapabilities(channelId: string): Promise<Set<Capability>> {
  return resolveCapabilities(await currentViewer(), { kind: 'channel', channelId })
}

/** What the caller can do on a specific Practice. practice.editSettings goes to its
 *  creator (owner), platform staff, or whoever manages its parent space. */
export async function getPracticeCapabilities(practiceId: string): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()
  const { data: p } = await admin
    .from('practices')
    .select('created_by')
    .eq('id', practiceId)
    .maybeSingle()
  return resolveCapabilities(viewer, {
    kind: 'practice',
    practiceId,
    ownerId: p?.created_by ?? null,
  })
}

/** What the caller can do on a specific Journey. journey.editSettings goes to its author
 *  (journey_plans.author_id), platform staff, or whoever manages its parent scope. Mirrors
 *  getPracticeCapabilities. Used to gate the Journey admin rail (ADR-515 Phase 6). */
export async function getJourneyCapabilities(journeyId: string): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()
  const { data: j } = await admin
    .from('journey_plans')
    .select('author_id')
    .eq('id', journeyId)
    .maybeSingle()
  return resolveCapabilities(viewer, {
    kind: 'journey',
    journeyId,
    authorId: (j as { author_id: string | null } | null)?.author_id ?? null,
  })
}

/** What the caller can do on a profile (edit-in-place gating + Spotlight). Reads the
 *  OWNER's Spotlight flags from their meta so the resolver can grant spotlight.manage
 *  only when the owner has it enabled (opt-in is owner state, not a viewer flag). */
export async function getProfileCapabilities(ownerId: string): Promise<Set<Capability>> {
  const viewer = await currentViewer()
  const admin = createAdminClient()
  const { data: owner } = await admin
    .from('profiles')
    .select('meta')
    .eq('id', ownerId)
    .maybeSingle()
  const meta = (owner as { meta?: unknown } | null)?.meta
  return resolveCapabilities(viewer, {
    kind: 'profile',
    ownerId,
    ownerSpotlightEnabled: readSpotlightEnabled(meta),
    ownerSpotlightPublished: readSpotlightPublished(meta),
  })
}

/**
 * The resolved capability set for a page's admin SCOPE (LP4 step B2, docs/LOOM-PLATFORM.md §5) — the
 * server-side dispatcher the standardized admin bar reads to gate its menu on the viewer's REAL
 * capabilities (feeding `caps` into PageAdminProvider). Dispatches on `scope.kind` to the per-entity
 * resolver above; `scope.id` must be the entity's DB id (route slug → id resolution is the caller's
 * job). Fail-closed: a null scope, a missing id, or a kind with no capability resolver here (e.g.
 * channel) yields an empty set. Not yet wired into the provider — until it is, the panel selects
 * modules caps-blind and each module self-gates server-side (the authority).
 */
export async function loadCapabilitiesForScope(scope: AdminScope | null): Promise<Set<Capability>> {
  if (!scope) return new Set()
  switch (scope.kind) {
    case 'global':
      return getGlobalCapabilities()
    case 'circle':
      return scope.id ? getCircleCapabilities(scope.id) : new Set()
    case 'hub':
      return scope.id ? getHubCapabilities(scope.id) : new Set()
    case 'nexus':
      return scope.id ? getNexusCapabilities(scope.id) : new Set()
    case 'event':
      return scope.id ? getEventCapabilities(scope.id) : new Set()
    case 'practice':
      return scope.id ? getPracticeCapabilities(scope.id) : new Set()
    case 'journey':
      return scope.id ? getJourneyCapabilities(scope.id) : new Set()
    case 'profile':
      return scope.id ? getProfileCapabilities(scope.id) : new Set()
    default:
      return new Set()
  }
}
