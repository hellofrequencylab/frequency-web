import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { isStaff } from '@/lib/core/roles'
import { staffSeesAdmin } from '@/lib/core/staff-roles'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyAdminConsole } from '@/components/frequency/admin/admin-console'

// Entry points are free for every signed-in member, so the page itself stays open. It is also a row of the
// operator menu (Growth, Acquisition), so a viewer who can open the operator console gets it inside that
// console, with the rest of its section, instead of being dropped out of it. Anyone else gets the page bare,
// exactly as before. SITE_DESIGN is build-time: a DAWN build renders the children untouched.
export default async function EntryPointsLayout({ children }: { children: React.ReactNode }) {
  if (SITE_DESIGN !== 'frequency') return children
  const profile = await getCallerProfile()
  if (!profile) return children
  const staff = await getStaffMember().catch(() => null)
  const staffRole = staff?.role ?? null
  if (!isStaff(profile.webRole) && !staffSeesAdmin(staffRole)) return children
  return <FrequencyAdminConsole profileId={profile.id} role={profile.community_role} webRole={profile.webRole} staffRole={staffRole}>{children}</FrequencyAdminConsole>
}
