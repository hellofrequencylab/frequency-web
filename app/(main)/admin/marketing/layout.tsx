import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isStaff, asWebRole } from '@/lib/core/roles'
import { MarketingSubNav } from './sub-nav'

// The Marketing workspace now lives UNDER the admin shell (Phase 3): the admin
// layout supplies the persistent left sidebar + the Admin › Growth › Marketing
// breadcrumb, and the requireAdminFloor() floor. This layout keeps Marketing's own
// PRECISE gate (the admin floor admits a broader set of operators than should see
// marketing, so we re-assert the 'marketing' capability here) and renders its
// internal tab bar as an IN-PAGE horizontal sub-nav under the breadcrumb — it never
// re-declares global chrome, so it does not fight the admin sidebar.
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

  return (
    // No global chrome here: the admin shell owns the sidebar + breadcrumb. We only
    // add Marketing's own in-page tab bar above the page content.
    <div className="flex flex-col">
      {/* In-page horizontal tab bar — Marketing's detail nav within the Growth area. */}
      <MarketingSubNav />

      {/* Page content */}
      <div className="pt-6">
        {children}
      </div>
    </div>
  )
}
