import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { CrewTasksClient } from './crew-tasks-client'
import { CircleTasksPanel, type HostedCircleTasks } from './circle-tasks-panel'
import { NewTaskCompose } from '@/components/compose/new-task-compose'
import { listCircleTasks } from '@/lib/crew/circle-tasks'
import type { SupabaseClient } from '@supabase/supabase-js'


export default async function AdminCrewTasksPage() {
  const { profileId } = await requireAdmin('host', { staff: 'community' })

  const admin = createAdminClient()

  const [tasksRes, pendingRes] = await Promise.all([
    // Global catalogue only (circle_id IS NULL) — circle-scoped tasks live in
    // the per-circle panel below. Untyped handle: circle_id isn't in
    // database.types yet (repo convention; see lib/crew/circle-tasks.ts).
    (admin as unknown as SupabaseClient)
      .from('crew_tasks')
      .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
      .is('circle_id', null)
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

  // Circle-task assignment (P4.7): circles the caller hosts, each with its
  // scoped tasks. Writes are re-gated per circle (circle.assignTask) in the
  // server actions — this listing is affordance only.
  const { data: hostedRows } = await admin
    .from('circles')
    .select('id, name')
    .eq('host_id', profileId)
    .order('name')
  const hostedCircles: HostedCircleTasks[] = await Promise.all(
    (hostedRows ?? []).map(async (c) => ({
      id: c.id,
      name: c.name,
      tasks: await listCircleTasks(c.id),
    })),
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
    <AdminTemplate
      title="Crew Tasks"
      eyebrow="Community"
      description="Define the tasks members can complete to earn zaps. Changes apply immediately across the app."
      width="wide"
      actions={<NewTaskCompose />}
    >
      {/* Verification queue + task editing — all behavior lives in the client */}
      <AdminSection>
        <CrewTasksClient
          tasks={tasks}
          pendingVerifications={filteredPending}
        />
      </AdminSection>

      {/* Circle tasks — host-assigned, one claimer at a time */}
      {hostedCircles.length > 0 && (
        <AdminSection
          title="Circle tasks"
          description="Tasks scoped to a circle you host. One Crew member claims a task at a time; they complete it on their Crew dashboard. Release a claim to re-open a stalled task."
        >
          <CircleTasksPanel circles={hostedCircles} />
        </AdminSection>
      )}

      {/* Quick-reference note for operators */}
      <AdminSection>
        <p className="text-sm text-muted">
          Tasks that require verification must be manually approved here before Zaps are awarded.
          Repeatable tasks can be completed multiple times per season.
        </p>
      </AdminSection>
    </AdminTemplate>
  )
}
