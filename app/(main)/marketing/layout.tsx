import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffMember, staffCan } from '@/lib/staff'
import { isStaff, asWebRole } from '@/lib/core/roles'
import { MarketingSubNav } from './sub-nav'

// The Marketing workspace lives INSIDE the normal app frame (full left nav + top
// bar), with a horizontal tab bar for its tools — the same pattern as Admin.
// Access: community admin/janitor, OR a staff role with the 'marketing' capability
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
    <div className="-mx-6 -my-6 flex flex-col min-h-full">
      {/* Horizontal tab bar, right under the main app header. */}
      <MarketingSubNav />

      {/* Page content */}
      <div className="flex-1 px-6 py-6">
        {children}
      </div>
    </div>
  )
}
