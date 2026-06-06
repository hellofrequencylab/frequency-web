import { createAdminClient } from '@/lib/supabase/admin'

// "Define & verify crew tasks" data for the in-place engage·CrewTasks module
// (ADR-138). Mirrors the /admin/crew-tasks page load (which can adopt this to DRY):
// the task list plus the verification queue, filtered to tasks that require it.
export async function getCrewTasksAdminData() {
  const admin = createAdminClient()

  const [tasksRes, pendingRes] = await Promise.all([
    admin
      .from('crew_tasks')
      .select('id, name, task_type, zaps_value, is_repeatable, requires_verification')
      .order('task_type')
      .order('zaps_value', { ascending: false }),
    admin
      .from('crew_completions')
      .select(
        `id, completed_at, zaps_earned,
         task:crew_tasks!task_id ( id, name, zaps_value ),
         member:profiles!profile_id ( id, display_name, handle, avatar_url )`,
      )
      .is('verified_by', null)
      .order('completed_at', { ascending: true })
      .limit(50),
  ])

  type PendingRow = {
    id: string
    completed_at: string
    zaps_earned: number
    task: { id: string; name: string; zaps_value: number } | null
    member: { id: string; display_name: string; handle: string; avatar_url: string | null } | null
  }

  // Only surface completions whose parent task actually requires verification.
  const verificationTaskIds = new Set(
    (tasksRes.data ?? []).filter((t) => t.requires_verification).map((t) => t.id),
  )
  const pendingVerifications = ((pendingRes.data ?? []) as unknown as PendingRow[]).filter((c) =>
    c.task ? verificationTaskIds.has(c.task.id) : false,
  )

  const tasks = (tasksRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    task_type: t.task_type,
    zaps_value: t.zaps_value ?? 0,
    is_repeatable: t.is_repeatable ?? false,
    requires_verification: t.requires_verification ?? false,
  }))

  return { tasks, pendingVerifications }
}
