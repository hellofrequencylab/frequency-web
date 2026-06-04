import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
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
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) notFound()

  const crewRoles = ['crew', 'host', 'guide', 'mentor', 'janitor']
  if (!crewRoles.includes(profile.community_role ?? '')) notFound()

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
    <div>
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-xs text-subtle hover:text-muted mb-5 transition-colors"
      >
        ← Events
      </Link>

      <h1 className="text-xl font-semibold text-text mb-6">Create an Event</h1>

      <div className="rounded-xl border border-border bg-surface p-5">
        <EventForm groups={circles} />
      </div>
    </div>
  )
}
