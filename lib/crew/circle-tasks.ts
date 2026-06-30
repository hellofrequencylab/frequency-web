// Circle-scoped crew tasks — reads (BUILD-LIST P4.7).
//
// A circle task is a crew_tasks row with circle_id set: created by the circle's
// host (circle.assignTask), claimable by ONE paid active member at a time
// (task.claim → assigned_to + claimed_at), and completed through the existing
// crew_completions flow unchanged. NULL circle_id = the global catalogue.
//
// Server-only (admin client). The new columns aren't in lib/database.types.ts
// yet, so reads go through an untyped handle (repo convention; see
// lib/traits/tags.ts) until `supabase gen types` is re-run.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface CircleTaskAssignee {
  id: string
  displayName: string
  handle: string
  avatarUrl: string | null
}

export interface CircleTask {
  id: string
  circleId: string
  name: string
  taskType: string
  zapsValue: number
  isRepeatable: boolean
  requiresVerification: boolean
  /** profiles.id of the current claimer, or null when the task is open. */
  assignedTo: string | null
  claimedAt: string | null
  assignee: CircleTaskAssignee | null
}

interface CircleTaskRow {
  id: string
  circle_id: string
  name: string
  task_type: string
  zaps_value: number | null
  is_repeatable: boolean | null
  requires_verification: boolean | null
  assigned_to: string | null
  claimed_at: string | null
  assignee: {
    id: string
    display_name: string
    handle: string
    avatar_url: string | null
  } | null
}

/** All of a circle's tasks (open first, then claimed), with the claimer joined
 *  in so the UI can show who holds each task. */
export async function listCircleTasks(circleId: string): Promise<CircleTask[]> {
  const { data, error } = await db()
    .from('crew_tasks')
    .select(`
      id, circle_id, name, task_type, zaps_value, is_repeatable,
      requires_verification, assigned_to, claimed_at,
      assignee:profiles!assigned_to ( id, display_name, handle, avatar_url )
    `)
    .eq('circle_id', circleId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[listCircleTasks]', error.message)
    return []
  }

  const rows = (data ?? []) as unknown as CircleTaskRow[]
  return rows
    .map(mapCircleTaskRow)
    .sort((a, b) => Number(a.assignedTo !== null) - Number(b.assignedTo !== null))
}

/** Map a CircleTaskRow → CircleTask (shared by the single- and batched reads). */
function mapCircleTaskRow(r: CircleTaskRow): CircleTask {
  return {
    id: r.id,
    circleId: r.circle_id,
    name: r.name,
    taskType: r.task_type,
    zapsValue: r.zaps_value ?? 0,
    isRepeatable: r.is_repeatable ?? false,
    requiresVerification: r.requires_verification ?? false,
    assignedTo: r.assigned_to,
    claimedAt: r.claimed_at,
    assignee: r.assignee
      ? {
          id: r.assignee.id,
          displayName: r.assignee.display_name,
          handle: r.assignee.handle,
          avatarUrl: r.assignee.avatar_url,
        }
      : null,
  }
}

/** PERF-3: tasks for MANY circles in ONE query, grouped by circle id (open
 *  first, then claimed — same ordering as listCircleTasks). Returns a Map so a
 *  caller iterating its circles avoids the N+1 of one read per circle. Circles
 *  with no tasks are present with an empty array. */
export async function listCircleTasksByCircle(
  circleIds: string[],
): Promise<Map<string, CircleTask[]>> {
  const grouped = new Map<string, CircleTask[]>()
  for (const id of circleIds) grouped.set(id, [])
  if (circleIds.length === 0) return grouped

  const { data, error } = await db()
    .from('crew_tasks')
    .select(`
      id, circle_id, name, task_type, zaps_value, is_repeatable,
      requires_verification, assigned_to, claimed_at,
      assignee:profiles!assigned_to ( id, display_name, handle, avatar_url )
    `)
    .in('circle_id', circleIds)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[listCircleTasksByCircle]', error.message)
    return grouped
  }

  for (const r of (data ?? []) as unknown as CircleTaskRow[]) {
    const bucket = grouped.get(r.circle_id)
    if (bucket) bucket.push(mapCircleTaskRow(r))
  }
  // Open tasks first within each circle (stable on the created_at order above).
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => Number(a.assignedTo !== null) - Number(b.assignedTo !== null))
  }
  return grouped
}

/** Count of a circle's open (unclaimed) tasks — the `openTaskCount` input the
 *  capability resolver uses to light up task.volunteer / task.claim. */
export async function countOpenCircleTasks(circleId: string): Promise<number> {
  const { count, error } = await db()
    .from('crew_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('circle_id', circleId)
    .is('assigned_to', null)

  if (error) {
    console.error('[countOpenCircleTasks]', error.message)
    return 0
  }
  return count ?? 0
}
