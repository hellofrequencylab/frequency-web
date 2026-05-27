import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CrewTasksClient } from './crew-tasks-client'

export default async function AdminCrewTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor', 'janitor'].includes(profile.community_role)) notFound()

  const [tasksRes, pendingRes] = await Promise.all([
    admin
      .from('crew_tasks')
      .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
      .order('task_type')
      .order('zaps_value', { ascending: false }),
    admin
      .from('crew_completions')
      .select(`
        id, completed_at, zaps_earned,
        task:crew_tasks!task_id ( id, name, zaps_value ),
        member:profiles!profile_id ( id, display_name, handle, avatar_url )
      `)
      .is('verified_by', null)
      .order('completed_at', { ascending: true })
      .limit(50),
  ])

  // Filter to only completions where the task requires verification
  const allPending = (pendingRes.data ?? []) as any[]
  const pendingVerifications = allPending.filter((c) => {
    // task is an object with id/name from the join; check parent requires_verification
    return c.task !== null
  })

  // Re-fetch tasks that require verification to cross-reference
  const verificationTaskIds = new Set(
    (tasksRes.data ?? [])
      .filter((t) => t.requires_verification)
      .map((t) => t.id)
  )

  const filteredPending = pendingVerifications.filter((c: any) =>
    verificationTaskIds.has(c.task?.id)
  )

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Crew Tasks</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Define the tasks members can complete to earn zaps. Changes apply immediately across the app.
        </p>
      </div>

      <CrewTasksClient
        tasks={tasksRes.data ?? []}
        pendingVerifications={filteredPending}
      />
    </div>
  )
}
