// Server seam: bridge live data → the pure capability resolver.
//
// This is the ONLY place that fetches the inputs `resolveCapabilities` needs and
// returns the caller's capability set for a scope. Server components and server
// actions call these; the result is (a) rendered as affordances and (b) the same
// policy the server must re-check before mutating (see capabilities.ts).
//
// NOTE: server-only — it uses the admin client. Do not import from a client
// component.

import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveCapabilities,
  type Capability,
  type Viewer,
} from './capabilities'
import { type CommunityRole } from './roles'
import { deriveTier } from './entitlement'
import { isPaid } from './access-matrix'
import { countOpenCircleTasks } from '@/lib/crew/circle-tasks'

// The STAFF axis (web_role, ADR-208) rides on the caller profile alongside the
// community role, so the SAME Viewer feeds every scope builder below — DB → auth →
// capabilities. getCallerProfile() reads web_role through the untyped cast (the
// generated types are stale until the migration applies).
async function currentViewer(): Promise<Viewer> {
  const p = await getCallerProfile()
  return {
    profileId: p?.id ?? null,
    role: (p?.community_role ?? 'member') as CommunityRole,
    webRole: p?.webRole ?? 'none',
    tier: deriveTier(p?.membershipTier),
  }
}

/** App-level capabilities (e.g. admin.access for the Admin tab). */
export async function getGlobalCapabilities(): Promise<Set<Capability>> {
  return resolveCapabilities(await currentViewer(), { kind: 'global' })
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
  // so we only do these extra lookups for guide/mentor viewers.
  let viewerManagesParent = opts?.viewerManagesParent ?? false
  if (
    !viewerManagesParent &&
    viewer.profileId &&
    (viewer.role === 'guide' || viewer.role === 'mentor') &&
    circle?.hub_id
  ) {
    const { data: hub } = await admin
      .from('hubs')
      .select('guide_id, nexus_id')
      .eq('id', circle.hub_id)
      .maybeSingle()
    if (hub?.guide_id === viewer.profileId) {
      viewerManagesParent = true
    } else if (hub?.nexus_id) {
      const { data: nexus } = await admin
        .from('nexuses')
        .select('mentor_id')
        .eq('id', hub.nexus_id)
        .maybeSingle()
      if (nexus?.mentor_id === viewer.profileId) viewerManagesParent = true
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

  // A mentor who leads the parent nexus manages this hub too.
  let viewerManagesParent = opts?.viewerManagesParent ?? false
  if (!viewerManagesParent && viewer.profileId && viewer.role === 'mentor' && hub?.nexus_id) {
    const { data: nexus } = await admin
      .from('nexuses')
      .select('mentor_id')
      .eq('id', hub.nexus_id)
      .maybeSingle()
    if (nexus?.mentor_id === viewer.profileId) viewerManagesParent = true
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

/** What the caller can do on a profile (edit-in-place gating). */
export async function getProfileCapabilities(ownerId: string): Promise<Set<Capability>> {
  return resolveCapabilities(await currentViewer(), { kind: 'profile', ownerId })
}
