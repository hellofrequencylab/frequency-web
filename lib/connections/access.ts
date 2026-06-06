// Who may use the Profile Creator. Per the v1 decision it rides the same axis as
// the rest of the CRM: community stewards (host and up) OR Studio staff
// (team_members). Records stay owner-scoped regardless — this only gates the tool.
// Server-only (resolves the caller's profile + staff membership).

import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { getStaffMember, staffCan } from '@/lib/staff'

/** The caller's profile id if they may use Profiles, else null. Community host+ OR
 *  a staff role with the 'profiles' capability (ADR-127).
 *
 *  NOTE: this is the *steward* gate — it still guards the directory-embedded
 *  contacts view (`/people`) and search, which surface contacts inside a shared
 *  surface. The personal-CRM pages now use `contactsOwnerId()` (member-tier).
 */
export async function connectionsOwnerId(): Promise<string | null> {
  const caller = await getCallerProfile()
  if (!caller) return null
  if (atLeastRole(caller.community_role, 'host')) return caller.id
  const staff = await getStaffMember().catch(() => null)
  return staff && staffCan(staff.role, 'profiles', 'read') ? caller.id : null
}

/** Member-tier (ADR-154, build §5.2): every member owns a *personal* contact book.
 *  Returns the caller's profile id for ANY authenticated member — records stay
 *  private via `network_contacts` owner-scoped RLS, so opening the tool is safe.
 *  This is what the personal-CRM pages + the Capture "In person" mode use. */
export async function contactsOwnerId(): Promise<string | null> {
  return (await getCallerProfile())?.id ?? null
}
