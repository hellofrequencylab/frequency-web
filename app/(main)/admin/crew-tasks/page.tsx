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
    .select('community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile || !['host', 'guide', 'mentor'].includes(profile.community_role)) notFound()

  const { data: tasks } = await admin
    .from('crew_tasks')
    .select('id, name, task_type, points_value, is_repeatable, requires_verification')
    .order('task_type')
    .order('points_value', { ascending: false })

  return (
    <div className="px-4 py-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">Crew Tasks</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Define the tasks members can complete to earn points. Changes apply immediately across the app.
        </p>
      </div>

      <CrewTasksClient tasks={tasks ?? []} />
    </div>
  )
}
