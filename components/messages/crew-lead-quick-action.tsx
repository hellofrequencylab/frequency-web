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
    .select('id, is_crew_lead')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!myProfile || !myProfile.is_crew_lead) return null
  const myProfileId = myProfile.id

  // Crew lead is a global profile flag; surface their active circle(s).
  const { data: leadMemberships } = await admin
    .from('memberships')
    .select('circle_id, circles!circle_id(id, name, host_id)')
    .eq('profile_id', myProfileId)
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

  // startGroupConversation refuses any invitee who isn't an accepted friend, so a
  // circle full of non-friends made "Message my circle" dead-end on submit. Pre-filter
  // the default invitees to accepted friends so the primary path goes through (the
  // compose still surfaces the friendship error if a member adds a non-friend by hand).
  const { data: friendRows } = await admin
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${myProfileId},user_b_id.eq.${myProfileId}`)
  const friendIds = new Set(
    ((friendRows ?? []) as { user_a_id: string; user_b_id: string }[])
      .map(f => (f.user_a_id === myProfileId ? f.user_b_id : f.user_a_id)),
  )
  const friendRecipients = recipients.filter(r => friendIds.has(r.id))

  if (friendRecipients.length === 0) return null

  return (
    <NewGroupDMCompose
      buttonLabel="Message my circle"
      buttonClass="inline-flex items-center gap-1.5 rounded-lg border border-primary-bg bg-primary-bg px-3 py-1.5 text-xs font-semibold text-primary-strong hover:bg-primary-bg dark:hover:bg-primary-bg/50 transition-colors whitespace-nowrap"
      defaultRecipients={friendRecipients}
      defaultName={`${circle.name} Crew`}
    />
  )
}
