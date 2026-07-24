import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { ROLE_LABEL } from '@/lib/community-roles'
import { FocusTemplate } from '@/components/templates'
import { OutreachForm } from './outreach-form'

export const dynamic = 'force-dynamic'

// The scope a steward reaches, by role: host → their circle, guide → their hub,
// mentor/janitor → their nexus.
function scopeFor(role: CommunityRole): string {
  if (role === 'mentor' || role === 'janitor') return 'nexus'
  if (role === 'guide') return 'hub'
  return 'circle'
}

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const role = ((profile?.community_role as CommunityRole) ?? 'member')
  // Outreach is a steward tool — hosts and up.
  if (!atLeastRole(role, 'host')) redirect('/feed')

  const scope = scopeFor(role)

  return (
    <FocusTemplate
      title="Outreach"
      description={
        <>
          Reach the people you steward. As a{' '}
          <strong className="text-text">{ROLE_LABEL[role]}</strong>, you can message your{' '}
          <strong className="text-text">{scope}</strong>.
        </>
      }
    >
      <OutreachForm scope={scope} />

      <p className="mt-3 text-xs text-subtle">
        Outreach is a direct note to your members’ inbox + notifications. For a public,
        community-wide post, use <strong className="text-text">Dispatch</strong>.
      </p>
    </FocusTemplate>
  )
}
