import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isStaff, asWebRole } from '@/lib/core/roles'

// The Marketing workspace lives UNDER the admin shell: the admin layout supplies the
// persistent top-nav + the Admin › Growth › Marketing breadcrumb and the
// requireAdminFloor() floor. This layout's sole job is to re-assert Marketing's own
// PRECISE capability gate — the admin floor admits a broader set of operators than
// should see marketing, so it's load-bearing (ADR-214). Marketing's internal tabs are
// now reachable from the Growth dropdown in the top-nav (ADR-228), so the old in-page
// sub-nav is gone; this is a thin gate-only wrapper.
// Access: a staff web_role, OR a team role with the 'marketing' capability
// (Marketing / Admin / Owner write · Analyst read) — ADR-127.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  // Staff access is the web_role axis now (ADR-208). web_role isn't in the stale
  // generated types yet, so read it through the untyped cast (repo convention).
  const admin = createAdminClient() as unknown as SupabaseClient
  const { data: profile } = await admin
    .from('profiles')
    .select('web_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!isStaff(asWebRole((profile as { web_role?: string } | null)?.web_role))) {
    const staff = await getStaffMember().catch(() => null)
    if (!staff || !staffCan(staff.role, 'marketing', 'read')) notFound()
  }

  // No chrome here: the admin shell owns the top-nav + breadcrumb, and the Growth
  // dropdown carries Marketing's destinations (ADR-228). This wrapper only enforces
  // the capability gate above.
  return <>{children}</>
}
