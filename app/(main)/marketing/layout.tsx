import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStaffMember } from '@/lib/staff'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { MarketingSubNav } from './sub-nav'

// The Marketing workspace lives INSIDE the normal app frame (full left nav + top
// bar), with a horizontal tab bar for its tools — the same pattern as Admin.
// Access: community admin/janitor, OR a Studio staff member (team_members axis).
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const role = ((profile?.community_role as CommunityRole) ?? 'member')
  if (!atLeastRole(role, 'admin')) {
    const staff = await getStaffMember().catch(() => null)
    if (!staff) notFound()
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
