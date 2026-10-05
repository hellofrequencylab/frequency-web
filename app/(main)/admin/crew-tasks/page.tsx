import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { CrewTasksClient } from './crew-tasks-client'
import { CircleTasksPanel, type HostedCircleTasks } from './circle-tasks-panel'
import { NewTaskCompose } from '@/components/compose/new-task-compose'
import { listCircleTasksByCircle } from '@/lib/crew/circle-tasks'
import { listHeldCompletions } from '@/lib/crew/verification-queue'


export default async function AdminCrewTasksPage() {
  const { profileId } = await requireAdmin('host', { staff: 'community' })

  const admin = createAdminClient()

  const [tasksRes, filteredPending] = await Promise.all([
    // Global catalogue only (circle_id IS NULL) — circle-scoped tasks live in
    // the per-circle panel below. Untyped handle: circle_id isn't in
    // database.types yet (repo convention; see lib/crew/circle-tasks.ts).
    (admin)
      .from('crew_tasks')
      .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
      .is('circle_id', null)
      .order('task_type')
      .order('zaps_value', { ascending: false }),
    // Held completions (verified_at null, task requires verification), filtered in SQL before
    // the limit so ordinary completions can never crowd the queue out (SCAN-752). Circle-scoped
    // held completions surface here too.
    listHeldCompletions(admin),
  ])

  // Circle-task assignment (P4.7): circles the caller hosts, each with its
  // scoped tasks. Writes are re-gated per circle (circle.assignTask) in the
  // server actions — this listing is affordance only.
  const { data: hostedRows } = await admin
    .from('circles')
    .select('id, name')
    .eq('host_id', profileId)
    .order('name')
  // PERF-3: one batched read for every hosted circle, not one query per circle.
  const tasksByCircle = await listCircleTasksByCircle((hostedRows ?? []).map((c) => c.id))
  const hostedCircles: HostedCircleTasks[] = (hostedRows ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tasks: tasksByCircle.get(c.id) ?? [],
  }))

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
      description="Define the tasks members can complete to earn Zaps. Changes apply immediately across the app."
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
        <p className="text-body-sm text-muted">
          Tasks that require verification must be manually approved here before Zaps are awarded.
          Repeatable tasks can be completed multiple times per season.
        </p>
      </AdminSection>
    </AdminTemplate>
  )
}
