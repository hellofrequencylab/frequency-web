import { getCallerProfile } from '@/lib/auth'
import { isStaff } from '@/lib/core/roles'
import { getStaffMember } from '@/lib/staff'

/** Is the caller a STAFF account, the people the two-step code is required of (SEC-046)? Platform staff
 *  (web_role admin or janitor) or a team member. The same two axes the staff gates admit on, so the setup
 *  step and the Settings row never disagree with the gate that sent someone there. View-as aware. */
export async function isStaffAccount(): Promise<boolean> {
  const caller = await getCallerProfile()
  if (!caller) return false
  if (isStaff(caller.webRole)) return true
  return (await getStaffMember().catch(() => null)) !== null
}
