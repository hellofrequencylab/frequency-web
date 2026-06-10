import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { FocusTemplate } from '@/components/templates'
import { EventForm } from './event-form'

export default async function NewEventPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  // Paid (Crew/Supporter TIER) or stewards may create events — PB.1/ADR-207.
  const paid = ['crew', 'supporter'].includes((profile as { membership_tier?: string | null }).membership_tier ?? '')
  const steward = ['host', 'guide', 'mentor', 'admin', 'janitor'].includes(profile.community_role ?? '')
  if (!paid && !steward) notFound()

  // Fetch circles the user is a member of (scope for events)
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')

  const circleIds = (memberships ?? []).map((m) => m.circle_id as string)

  let circles: { id: string; name: string }[] = []
  if (circleIds.length > 0) {
    const { data: circleRows } = await admin
      .from('circles')
      .select('id, name')
      .in('id', circleIds)
      .neq('status', 'archived')
      .order('name', { ascending: true })
    circles = (circleRows ?? []) as { id: string; name: string }[]
  }

  return (
    <FocusTemplate title="Create an Event" back={{ href: '/events', label: 'Events' }}>
      <div className="rounded-xl border border-border bg-surface p-5">
        <EventForm groups={circles} />
      </div>
    </FocusTemplate>
  )
}
