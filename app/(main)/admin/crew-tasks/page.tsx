import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CrewTasksClient } from './crew-tasks-client'
import { NewTaskCompose } from '@/components/compose/new-task-compose'

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      </div>
      {children}
    </div>
  )
}

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
    verificationTaskIds.has(c.task?.id)
  )

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Crew Tasks</h1>
          <p className="text-sm text-muted mt-1">
            Define the tasks members can complete to earn zaps. Changes apply immediately across the app.
          </p>
        </div>
        <NewTaskCompose />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <CrewTasksClient
            tasks={tasksRes.data ?? []}
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
    </div>
  )
}
