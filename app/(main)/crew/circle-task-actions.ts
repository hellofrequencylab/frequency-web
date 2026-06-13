'use server'

// Circle-task assignment actions (BUILD-LIST P4.7).
//
// Capabilities are LAW here — the admin client bypasses RLS, so every action
// re-resolves the caller's capabilities for the task's circle before writing
// (see lib/core/capabilities.ts):
//   • circle.assignTask — host/staff/parent-leader: create, release any, delete.
//   • task.claim        — paid active member while the circle has open tasks.
//
// Completing a claimed task is NOT here on purpose: a circle task is still a
// crew_tasks row, so the existing completion flow (./actions.ts logCompletion →
// crew_completions) works unchanged.
//
// The assignment columns aren't in lib/database.types.ts yet → untyped admin
// handle (repo convention; see lib/crew/circle-tasks.ts).

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getCircleCapabilities } from '@/lib/core/load-capabilities'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface CircleTaskActionResult {
  ok: boolean
  error?: string
}

const TASK_TYPES = new Set([
  'attendance', 'hosting', 'volunteering', 'content', 'referral', 'other',
])

function revalidateTaskSurfaces() {
  revalidatePath('/crew')
  revalidatePath('/admin/crew-tasks')
}

async function loadTask(taskId: string): Promise<{
  id: string
  circle_id: string | null
  assigned_to: string | null
} | null> {
  const { data } = await db()
    .from('crew_tasks')
    .select('id, circle_id, assigned_to')
    .eq('id', taskId)
    .maybeSingle()
  return (data as { id: string; circle_id: string | null; assigned_to: string | null } | null) ?? null
}

/** Host flow: create a task scoped to a circle the caller manages. */
export async function createCircleTask(circleId: string, fd: FormData): Promise<CircleTaskActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const caps = await getCircleCapabilities(circleId)
  if (!caps.has('circle.assignTask')) throw new Error('Unauthorized')

  const name = ((fd.get('name') as string) ?? '').trim()
  if (!name) return { ok: false, error: 'Task name is required.' }
  const rawType = (fd.get('task_type') as string) ?? 'volunteering'
  const taskType = TASK_TYPES.has(rawType) ? rawType : 'volunteering'
  const zaps = Math.min(9999, Math.max(1, parseInt(fd.get('zaps_value') as string, 10) || 10))

  const { error } = await db().from('crew_tasks').insert({
    name,
    task_type: taskType,
    zaps_value: zaps,
    is_repeatable: false,
    requires_verification: fd.get('requires_verification') === 'true',
    circle_id: circleId,
  })
  if (error) throw new Error(error.message)

  revalidateTaskSurfaces()
  return { ok: true }
}

/** Member flow: claim an open task in a circle where the caller holds task.claim.
 *  Race-safe — the UPDATE is filtered on `assigned_to IS NULL`, so of two
 *  concurrent claimers exactly one matches the row; the other gets 0 rows back
 *  and a friendly error. */
export async function claimCircleTask(taskId: string): Promise<CircleTaskActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const task = await loadTask(taskId)
  if (!task?.circle_id) return { ok: false, error: 'Task not found.' }
  if (task.assigned_to) return { ok: false, error: 'Someone already claimed this task.' }

  const caps = await getCircleCapabilities(task.circle_id)
  if (!caps.has('task.claim')) throw new Error('Unauthorized')

  const { data, error } = await db()
    .from('crew_tasks')
    .update({ assigned_to: profileId, claimed_at: new Date().toISOString() })
    .eq('id', taskId)
    .is('assigned_to', null) // ← the race guard: only an open row can be won
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    return { ok: false, error: 'Someone already claimed this task.' }
  }

  revalidateTaskSurfaces()
  return { ok: true }
}

/** Release a claim — by the claimer themselves, or by anyone holding
 *  circle.assignTask (host re-opening a stalled task). */
export async function releaseCircleTask(taskId: string): Promise<CircleTaskActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const task = await loadTask(taskId)
  if (!task?.circle_id) return { ok: false, error: 'Task not found.' }
  if (!task.assigned_to) return { ok: true } // already open

  if (task.assigned_to !== profileId) {
    const caps = await getCircleCapabilities(task.circle_id)
    if (!caps.has('circle.assignTask')) throw new Error('Unauthorized')
  }

  const { error } = await db()
    .from('crew_tasks')
    .update({ assigned_to: null, claimed_at: null })
    .eq('id', taskId)
    .eq('assigned_to', task.assigned_to) // no-op if the claim changed under us
  if (error) throw new Error(error.message)

  revalidateTaskSurfaces()
  return { ok: true }
}

/** Host flow: remove a circle task. A task that already has logged completions
 *  can't be deleted (crew_completions.task_id FK is NO ACTION — awarded zaps are
 *  facts); we surface that as a friendly error rather than throwing. */
export async function deleteCircleTask(taskId: string): Promise<CircleTaskActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) throw new Error('Unauthorized')

  const task = await loadTask(taskId)
  if (!task?.circle_id) return { ok: false, error: 'Task not found.' }

  const caps = await getCircleCapabilities(task.circle_id)
  if (!caps.has('circle.assignTask')) throw new Error('Unauthorized')

  const { error } = await db().from('crew_tasks').delete().eq('id', taskId)
  if (error) {
    return { ok: false, error: 'This task already has logged completions, so it can’t be deleted. Release it instead.' }
  }

  revalidateTaskSurfaces()
  return { ok: true }
}
