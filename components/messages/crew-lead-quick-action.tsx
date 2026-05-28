import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewGroupDMCompose } from '@/components/compose/new-group-dm-compose'

/**
 * Server component that detects if the viewer is a crew lead in any
 * circle, and renders a pre-filled "Message my sub-group" quick action.
 *
 * Sub-group = all other active members in the same circle, excluding
 * the host. Capped at the group DM cap.
 */
export async function CrewLeadQuickAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: myProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile) return null
  const myProfileId = myProfile.id as string

  // Find circles where viewer is a crew lead
  const { data: leadMemberships } = await admin
    .from('memberships')
    .select('circle_id, circles!circle_id(id, name, host_id)')
    .eq('profile_id', myProfileId)
    .eq('is_crew_lead', true)
    .eq('status', 'active')

  if (!leadMemberships || leadMemberships.length === 0) return null

  // Use the first circle they're a lead in (simplest case)
  const m = leadMemberships[0] as unknown as { circle_id: string; circles: { id: string; name: string; host_id: string } | null }
  const circle = m.circles
  if (!circle) return null

  // Get other active members in the circle (excluding self)
  const { data: otherMembers } = await admin
    .from('memberships')
    .select('profile_id, profiles!profile_id(id, display_name, handle, avatar_url)')
    .eq('circle_id', circle.id)
    .eq('status', 'active')
    .neq('profile_id', myProfileId)
    .limit(24)

  const recipients = ((otherMembers ?? []) as unknown as {
    profile_id: string
    profiles: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }[])
    .map(m => m.profiles)
    .filter((p): p is { id: string; display_name: string; handle: string; avatar_url: string | null } => !!p)

  if (recipients.length === 0) return null

  return (
    <NewGroupDMCompose
      buttonLabel="Message my circle"
      buttonClass="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors whitespace-nowrap"
      defaultRecipients={recipients}
      defaultName={`${circle.name} Crew`}
    />
  )
}
