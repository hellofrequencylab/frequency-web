import { SidebarCard } from '@/components/ui/sidebar-card'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { createAdminClient } from '@/lib/supabase/admin'
import { CrewTasksClient } from './crew-tasks-client'
import { NewTaskCompose } from '@/components/compose/new-task-compose'


export default async function AdminCrewTasksPage() {
  await requireAdmin('host')

  const admin = createAdminClient()

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
  type PendingRow = {
    id: string
    completed_at: string
    zaps_earned: number
    task: { id: string; name: string; zaps_value: number } | null
    member: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }

  const allPending = (pendingRes.data ?? []) as unknown as PendingRow[]
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

  const filteredPending = pendingVerifications.filter((c: PendingRow) =>
    c.task ? verificationTaskIds.has(c.task.id) : false
  )

  const tasks = (tasksRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    task_type: t.task_type,
    zaps_value: t.zaps_value ?? 0,
    is_repeatable: t.is_repeatable ?? false,
    requires_verification: t.requires_verification ?? false,
  }))

  return (
    <AdminPage
      title="Crew Tasks"
      eyebrow="Community"
      description="Define the tasks members can complete to earn zaps. Changes apply immediately across the app."
      width="wide"
      actions={<NewTaskCompose />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <CrewTasksClient
            tasks={tasks}
            pendingVerifications={filteredPending}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <SidebarCard title="Quick Actions">
            <p className="px-4 py-3 text-xs text-subtle">Tasks that require verification must be manually approved here before zaps are awarded. Repeatable tasks can be completed multiple times per season.</p>
          </SidebarCard>
        </div>
      </div>
    </AdminPage>
  )
}
