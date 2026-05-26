import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminSubNav } from './sub-nav'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

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

  if (!profile || !['host', 'guide', 'mentor'].includes(profile.community_role as string)) {
    notFound()
  }

  return (
    <div className="flex flex-col min-h-full">
      <AdminSubNav role={profile.community_role as CommunityRole} />
      {children}
    </div>
  )
}
