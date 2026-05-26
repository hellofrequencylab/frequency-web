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

  // Only crew+ can create events
  const crewRoles = ['crew', 'host', 'guide', 'mentor']
  if (!crewRoles.includes(profile.community_role)) notFound()

  // Fetch groups the user belongs to
  const { data: memberships } = await admin
    .from('group_memberships')
    .select('group_id')
    .eq('profile_id', profile.id)

  const groupIds = (memberships ?? []).map((m) => m.group_id as string)

  let groups: { id: string; name: string }[] = []
  if (groupIds.length > 0) {
    const { data: groupRows } = await admin
      .from('groups')
      .select('id, name')
      .in('id', groupIds)
      .eq('is_active', true)
      .order('name', { ascending: true })
    groups = (groupRows ?? []) as { id: string; name: string }[]
  }

  return (
    <div className="px-4 py-8 max-w-xl mx-auto">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-5 transition-colors"
      >
        ← Events
      </Link>

      <h1 className="text-xl font-semibold text-gray-900 mb-6">Create an Event</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <EventForm groups={groups} />
      </div>
    </div>
  )
}
