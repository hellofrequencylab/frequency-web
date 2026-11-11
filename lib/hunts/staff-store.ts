/**
 * The door's fact loader (FH-020S). Every Hunt table is service role only, so this file is the tenancy
 * wall for the staff route: it reads, fresh for each request, the Hunt, its role grants, its partner
 * rows, the placement, the run and the caller's standing in the venue Space, and hands them to
 * lib/hunts/staff-review.ts `verifyAtDoor`, which decides. Nothing is cached, so revoking a staff
 * member, a partner or a placement stops the next scan. It writes nothing.
 *
 * "Staff" of a venue Space is a member who may edit the Space (`canEditProfile`: owner, admin or editor).
 * That is the narrowest standing the Space model already has; a dedicated door-staff role would narrow it
 * further and belongs to the Space roles work, not here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import type { PartnerRow, RoleGrant } from './authz'
import type { StaffFacts } from './staff-review'

// eslint-disable-next-line no-restricted-syntax -- the FH-005 hunt tables are not in the generated types yet (ADR-246 exception)
const db = () => createAdminClient() as unknown as SupabaseClient

/** The service-role RPC caller the route hands to staff-review. */
export function huntRpc() {
  const client = db()
  return (fn: string, args: Record<string, unknown>) => client.rpc(fn, args)
}

/** A scanned placement identifies a mission only when its version binds it exactly once. */
export async function loadUniquePlacementMission(huntId: string, versionId: string, placementId: string): Promise<string | null> {
  const binding = await db()
    .from('hunt_mission_placements')
    .select('mission_key', { count: 'exact' })
    .eq('hunt_id', huntId)
    .eq('version_id', versionId)
    .eq('placement_id', placementId)
    .limit(2)
  if (binding.error || binding.count !== 1 || binding.data?.length !== 1) return null
  const missionKey: unknown = binding.data[0]?.mission_key
  return typeof missionKey === 'string' && missionKey ? missionKey : null
}

type Scope = { huntId: string; placementId: string; venueSpaceId: string; runId: string }

export async function loadStaffFacts(staffId: string, scope: Scope): Promise<(StaffFacts & { missionKey: string }) | null> {
  const client = db()
  const { data: hunt, error } = await client
    .from('hunts')
    .select('id, visibility, owner_profile_id, owner_space_id, current_version_id')
    .eq('id', scope.huntId)
    .eq('status', 'live')
    .maybeSingle()
  const h = hunt as {
    id: string
    visibility: 'private' | 'unlisted' | 'public'
    owner_profile_id: string | null
    owner_space_id: string | null
    current_version_id: string | null
  } | null
  if (error || !h?.current_version_id) return null

  const [roles, partners, placement, bound, run, space] = await Promise.all([
    client.from('hunt_roles').select('hunt_id, profile_id, role, expires_at, revoked_at').eq('hunt_id', scope.huntId),
    client.from('hunt_partners').select('hunt_id, space_id, status, effective_at, revoked_at, permitted_roles').eq('hunt_id', scope.huntId),
    client.from('hunt_placements').select('id, revoked_at').eq('id', scope.placementId).eq('hunt_id', scope.huntId).maybeSingle(),
    client
      .from('hunt_mission_placements')
      .select('mission_key')
      .eq('hunt_id', scope.huntId)
      .eq('version_id', h.current_version_id)
      .eq('placement_id', scope.placementId)
      .eq('venue_space_id', scope.venueSpaceId)
      .limit(2),
    client.from('hunt_runs')
      .select('subject_profile_id')
      .eq('id', scope.runId)
      .eq('hunt_id', scope.huntId)
      .eq('version_id', h.current_version_id)
      .eq('state', 'active')
      .maybeSingle(),
    getSpaceById(scope.venueSpaceId),
  ])
  if (roles.error || partners.error || placement.error || bound.error || run.error || !space) return null

  // A v1 code signs a placement, venue and run. Only a single binding can identify its mission.
  const bindings = bound.data as { mission_key: string }[] | null
  const runSubjectId = (run.data as { subject_profile_id: string } | null)?.subject_profile_id
  if (!runSubjectId || bindings?.length !== 1) return null

  const grants: RoleGrant[] = ((roles.data ?? []) as { hunt_id: string; profile_id: string; role: RoleGrant['role']; expires_at: string | null; revoked_at: string | null }[]).map((r) => ({
    huntId: r.hunt_id,
    profileId: r.profile_id,
    role: r.role,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  }))
  const partnerRows: PartnerRow[] = ((partners.data ?? []) as { hunt_id: string; space_id: string; status: PartnerRow['status']; effective_at: string | null; revoked_at: string | null; permitted_roles: string[] }[]).map((p) => ({
    huntId: p.hunt_id,
    spaceId: p.space_id,
    status: p.status,
    effectiveAt: p.effective_at,
    revokedAt: p.revoked_at,
    permittedRoles: p.permitted_roles ?? [],
  }))

  const caps = await getSpaceCapabilities(space, staffId)
  const placementRow = placement.data as { id: string; revoked_at: string | null } | null
  const placementActive = !!placementRow && placementRow.revoked_at === null

  return {
    hunt: { id: h.id, visibility: h.visibility, ownerProfileId: h.owner_profile_id, ownerSpaceId: h.owner_space_id },
    grants,
    partners: partnerRows,
    actor: { profileId: staffId },
    staffVenueSpaceIds: caps.canEditProfile ? [scope.venueSpaceId] : [],
    placementActive,
    runSubjectId,
    missionKey: bindings[0].mission_key,
  }
}
