// Shared admin page guard. Replaces the ~12 lines of identical auth + role
// boilerplate that every /admin/* page used to repeat: fetch the user, look up
// the profile, check the role, notFound() otherwise. One call, one source of
// truth, built on the request-cached getCallerProfile() (no extra round-trips).
//
//   export default async function Page() {
//     const { profileId, role } = await requireAdmin('janitor')
//     ...
//   }
//
// Pages still own their data fetching — this only gates entry and hands back the
// caller's profile id + effective role.

import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'
import { staffCan, type StaffDomain, type StaffRole } from '@/lib/core/staff-roles'

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
 * in — Roles, Members, AI, Platform — stay community-janitor only).
 */
export async function requireAdmin(
  min: CommunityRole = 'host',
  opts?: { staff?: StaffDomain },
): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile) notFound()
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  const okCommunity = atLeastRole(profile.community_role, min)
  const okStaff = opts?.staff ? staffCan(staffRole, opts.staff, 'write') : false
  if (!okCommunity && !okStaff) notFound()
  return { profileId: profile.id, role: profile.community_role, staffRole }
}
