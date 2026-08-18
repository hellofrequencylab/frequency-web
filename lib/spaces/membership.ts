// Per-Space membership + the space-role LADDER (ENTITY-SPACES-BUILD §0, Epic 0.2; ENTITY-SPACES-
// SYSTEM §3.2). Who belongs to a Space (`space_members`), with what role, independent per Space.
// A person's role in Space A is unrelated to Space B — isolation is the whole point.
//
// This file is two halves:
//   1. The PURE role ladder (SPACE_ROLES, spaceRoleRank, atLeastSpaceRole) —
//      framework-independent, no Supabase/Next imports, fully unit-testable. Mirrors the ascending
//      ladder in the CHECK constraint (20260711010000_space_members.sql).
//   2. The SERVER seam (getSpaceMembership / listSpaceMembers + the add/update/remove helpers) —
//      service-role admin-client reads/writes, like the CRM layer and lib/stewardships.ts. The
//      `space_members` table is not in the generated DB types yet, so the queries use the untyped-
//      client cast (the repo convention for not-yet-typed tables, ADR-246 — see lib/page-settings
//      /store.ts, lib/stewardships.ts).
//
// Writes are SERVER-MEDIATED only (no client RLS write policy): an operator surface calls these
// helpers behind app-authz, exactly like the CRM tables. The capability layer that combines the
// Space OWNER (spaces.owner_profile_id) with a member's role lives in lib/spaces/entitlements.ts
// (getSpaceCapabilities); this file is the membership primitive it reads.

// ── `import 'server-only'` IS THE POINT OF THE LINE BELOW, NOT DECORATION (LIVE-037) ──────────
// A prose header describing two halves enforced nothing; the browser got both. The directive
// makes a client import of the server seam a BUILD FAILURE that names the importer.
import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// The pure role ladder lives in ./membership-core (dependency-free, per the split this file's
// header always described). Re-exported here so every existing server caller is unchanged;
// CLIENT code must import from ./membership-core.
export { SPACE_ROLES, isSpaceRole, isSpaceMemberStatus, spaceRoleRank, atLeastSpaceRole } from './membership-core'
export type { SpaceRole, SpaceMemberStatus, SpaceMembership } from './membership-core'
import { isSpaceRole, isSpaceMemberStatus } from './membership-core'
import type { SpaceRole, SpaceMemberStatus, SpaceMembership } from './membership-core'

// ── The server seam (typed admin client) ──────────────────────────────────────────────────

type MemberRow = {
  id: string
  space_id: string
  profile_id: string
  role: string
  status: string
  invited_by: string | null
  created_at: string
}

const MEMBER_COLS = 'id, space_id, profile_id, role, status, invited_by, created_at'

/** The typed `space_members` query builder. */
function membersTable() {
  return createAdminClient().from('space_members')
}

/** Map a raw row to a typed SpaceMembership, fail-closed: an unknown role/status drops the row
 *  (returns null) so a future enum value the build doesn't know never grants authority. */
function mapMember(r: MemberRow): SpaceMembership | null {
  if (!isSpaceRole(r.role) || !isSpaceMemberStatus(r.status)) return null
  return {
    id: r.id,
    spaceId: r.space_id,
    profileId: r.profile_id,
    role: r.role,
    status: r.status,
    invitedBy: r.invited_by,
    createdAt: r.created_at,
  }
}

/** This profile's membership in a Space, or null if they aren't a member. Service-role read
 *  (works regardless of RLS context); FAIL-SAFE (null on any error). Does NOT count the Space
 *  owner — owners have no row; combine via getSpaceCapabilities (lib/spaces/entitlements.ts).
 *
 *  REQUEST-CACHED (React.cache) on (spaceId, profileId): the manage-access resolve reads a viewer's
 *  membership several times per request — resolveSpaceManageAccess calls getSpaceCapabilities, and the
 *  rail bundle / getters call getSpaceCapabilities AGAIN for the same viewer — so without the cache one
 *  rail open fired the same membership query 2x+. The cache collapses them to a single read (perf), and
 *  is safe because a viewer's membership does not change within a request. */
export const getSpaceMembership = cache(async function getSpaceMembership(
  spaceId: string,
  profileId: string,
): Promise<SpaceMembership | null> {
  try {
    const { data, error } = await membersTable()
      .select(MEMBER_COLS)
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (error || !data) return null
    return mapMember(data)
  } catch {
    return null
  }
})

/** Every membership row of a Space (any status), newest first. Service-role read; FAIL-SAFE
 *  (empty array on any error). Unknown roles/statuses are dropped (fail-closed). */
export async function listSpaceMembers(spaceId: string): Promise<SpaceMembership[]> {
  try {
    const { data, error } = await membersTable()
      .select(MEMBER_COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
    if (error || !data) return []
    return data.flatMap((r) => {
      const m = mapMember(r)
      return m ? [m] : []
    })
  } catch {
    return []
  }
}

/** Add (or re-activate) a member of a Space at a role. Service-role write, server-mediated (call
 *  behind app-authz). Upserts on the (space_id, profile_id) unique key, so re-adding a person
 *  updates their role/status rather than erroring. Returns the resulting membership, or null on
 *  failure. */
export async function addSpaceMember(input: {
  spaceId: string
  profileId: string
  role?: SpaceRole
  status?: SpaceMemberStatus
  invitedBy?: string | null
}): Promise<SpaceMembership | null> {
  const role: SpaceRole = isSpaceRole(input.role) ? input.role : 'viewer'
  const status: SpaceMemberStatus = isSpaceMemberStatus(input.status) ? input.status : 'active'
  try {
    const payload = {
      space_id: input.spaceId,
      profile_id: input.profileId,
      role,
      status,
      invited_by: input.invitedBy ?? null,
    }
    const { data, error } = await membersTable()
      .upsert(payload, { onConflict: 'space_id,profile_id' })
      .select(MEMBER_COLS)
      .maybeSingle()
    if (error || !data) return null
    return mapMember(data)
  } catch {
    return null
  }
}

/** Change an existing member's role. Service-role write, server-mediated. Returns true on success.
 *  An unknown role is rejected (fail-closed) before any write. */
export async function updateSpaceMemberRole(
  spaceId: string,
  profileId: string,
  role: SpaceRole,
): Promise<boolean> {
  if (!isSpaceRole(role)) return false
  try {
    const { error } = await membersTable()
      .update({ role })
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
    return !error
  } catch {
    return false
  }
}

/** Change an existing member's lifecycle status (active / suspended / invited). Service-role write,
 *  server-mediated. A SUSPEND retains the row for history but strips authority (only an ACTIVE
 *  membership confers a role, see getSpaceCapabilities); REACTIVATE flips it back to 'active'.
 *  Returns true on success. An unknown status is rejected (fail-closed) before any write. */
export async function setSpaceMemberStatus(
  spaceId: string,
  profileId: string,
  status: SpaceMemberStatus,
): Promise<boolean> {
  if (!isSpaceMemberStatus(status)) return false
  try {
    const { error } = await membersTable()
      .update({ status })
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
    return !error
  } catch {
    return false
  }
}

/** Remove a member from a Space (a hard delete of the membership row). Service-role write,
 *  server-mediated. Returns true on success. The Space owner is not a member row, so this can
 *  never remove ownership. */
export async function removeSpaceMember(spaceId: string, profileId: string): Promise<boolean> {
  try {
    const { error } = await membersTable()
      .delete()
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
    return !error
  } catch {
    return false
  }
}
