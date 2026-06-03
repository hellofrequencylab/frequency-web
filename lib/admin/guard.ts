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

export interface AdminContext {
  profileId: string
  role: CommunityRole
}

/** Require at least `min` (default 'host', the floor for entering /admin). Returns
 *  the caller's profile id + effective role, or renders 404 for anyone below. */
export async function requireAdmin(min: CommunityRole = 'host'): Promise<AdminContext> {
  const profile = await getCallerProfile()
  if (!profile || !atLeastRole(profile.community_role, min)) notFound()
  return { profileId: profile.id, role: profile.community_role }
}
