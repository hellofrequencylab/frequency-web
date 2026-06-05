// Who may use the Profile Creator. Per the v1 decision it rides the same axis as
// the rest of the CRM: community stewards (host and up) OR Studio staff
// (team_members). Records stay owner-scoped regardless — this only gates the tool.
// Server-only (resolves the caller's profile + staff membership).

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'

/** The caller's profile id if they may use Profiles, else null. Community host+ OR
 *  a staff role with the 'profiles' capability (ADR-127). */
export async function connectionsOwnerId(): Promise<string | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  if (atLeastRole(caller.community_role, 'host')) return caller.id
  const staff = await getStaffMember().catch(() => null)
  return staff && staffCan(staff.role, 'profiles', 'read') ? caller.id : null
}
