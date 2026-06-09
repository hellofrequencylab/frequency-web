// Shared admin page guard. Replaces the ~12 lines of identical auth + role
// boilerplate that every /admin/* page used to repeat: fetch the user, look up
// the profile, check the role. A viewer without access is REDIRECTED home —
// logged-out → '/' (marketing), insufficient role → '/feed' — never a 404 (a dead
// end the viewer can't recover from). One call, one source of truth, built on the
// request-cached getCallerProfile() (no extra round-trips).
//
//   export default async function Page() {
//     const { profileId, role } = await requireAdmin('janitor')
//     ...
//   }
//
// Pages still own their data fetching — this only gates entry and hands back the
// caller's profile id + effective role.

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { staffCan, staffSeesAdmin, type StaffDomain, type StaffRole, type Access } from '@/lib/core/staff-roles'

export interface AdminContext {
  profileId: string
  role: CommunityRole
  /** The caller's staff/operations role (ADR-127), or null. */
  staffRole: StaffRole | null
}

/**
 * Require at least `min` community role (default 'host', the floor for /admin).
 * ADR-127: pass `opts.staff` to ALSO admit a staff/operations role that holds that
 * capability domain (write) — an ADDITIVE, fail-closed union. With no `opts.staff`
 * the gate is community-only, exactly as before (so sensitive pages that don't opt
 * in — Roles, Members, AI, Platform — stay community-janitor only). On denial the
 * viewer is redirected home, not shown a 404.
 */
export async function requireAdmin(
  min: CommunityRole = 'host',
  opts?: { staff?: StaffDomain; staffLevel?: Access },
): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  const okCommunity = atLeastRole(profile.community_role, min)
  const okStaff = opts?.staff ? staffCan(staffRole, opts.staff, opts.staffLevel ?? 'write') : false
  if (!okCommunity && !okStaff) redirect('/feed')
  return { profileId: profile.id, role: profile.community_role, staffRole }
}

/** The /admin entry floor: community host+ OR any staff role that can see at least
 *  one admin group. Each group/page still gates itself precisely below this. */
export async function requireAdminFloor(): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) redirect('/')
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  if (!atLeastRole(profile.community_role, 'host') && !staffSeesAdmin(staffRole)) redirect('/feed')
  return { profileId: profile.id, role: profile.community_role, staffRole }
}

/**
 * Authorize a server ACTION (mutation): returns the (non-null) caller if the
 * community ladder grants `min` OR (ADR-127) the caller's staff role holds
 * `staffDomain` (write); throws 'Unauthorized' otherwise. The action-level twin of
 * `requireAdmin`, for the `getCallerProfile()` + `hasRole` pattern in server actions.
 * Omit `staffDomain` to keep an action community-role only (sensitive mutations).
 */
export async function authorizeAction<T extends { community_role: CommunityRole }>(
  caller: T | null,
  min: CommunityRole,
  staffDomain?: StaffDomain,
): Promise<T> {
  if (caller) {
    if (atLeastRole(caller.community_role, min)) return caller
    if (staffDomain) {
      const staff = await getStaffMember().catch(() => null)
      if (staffCan(staff?.role ?? null, staffDomain, 'write')) return caller
    }
  }
  throw new Error('Unauthorized')
}
