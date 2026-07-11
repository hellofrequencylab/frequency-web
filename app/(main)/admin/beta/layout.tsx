import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isStaff, asWebRole } from '@/lib/core/roles'

// The Beta Command Center lives UNDER the /admin shell (requireAdminFloor supplies the
// top-nav + the admin floor). This layout re-asserts the workspace's PRECISE gate: READ
// requires a staff web_role OR the 'marketing' capability at read (the same floor the
// Marketing workspace uses). ARMING outbound is gated tighter (admin/janitor) inside the
// approval spine (lib/beta/guard.ts approverGate) at the action level, not here. No chrome
// here: the /admin shell owns the top-nav; this wrapper only enforces the capability gate.
export default async function BetaLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  // web_role isn't in the stale generated types yet, so read it through the untyped cast.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!isStaff(asWebRole((profile as { web_role?: string } | null)?.web_role))) {
    const staff = await getStaffMember().catch(() => null)
    if (!staff || !staffCan(staff.role, 'marketing', 'read')) notFound()
  }

  return <>{children}</>
}
