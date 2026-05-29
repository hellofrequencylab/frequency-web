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

async function currentViewer(): Promise<Viewer> {
  const p = await getCallerProfile()
  return { profileId: p?.id ?? null, role: (p?.community_role ?? 'member') as CommunityRole }
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
    .select('host_id')
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

  return resolveCapabilities(viewer, {
    kind: 'circle',
    circleId,
    hostId: circle?.host_id ?? null,
    membership,
    // TODO: derive from the task-assignment table once that model is confirmed.
    openTaskCount: opts?.openTaskCount ?? 0,
    viewerManagesParent: opts?.viewerManagesParent,
  })
}

/** What the caller can do on a profile (edit-in-place gating). */
export async function getProfileCapabilities(ownerId: string): Promise<Set<Capability>> {
  return resolveCapabilities(await currentViewer(), { kind: 'profile', ownerId })
}
