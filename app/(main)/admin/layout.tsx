import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSubNav } from './sub-nav'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'janitor'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role as string)) {
    notFound()
  }

  return (
    <div className="-mx-6 -my-6 flex flex-col min-h-full">
      {/* Horizontal top nav bar. Sits right under the main app header */}
      <AdminSubNav role={profile.community_role as CommunityRole} />

      {/* Page content */}
      <div className="flex-1 px-6 py-6">
        {children}
      </div>
    </div>
  )
}
